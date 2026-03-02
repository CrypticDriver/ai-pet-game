/**
 * World Tools — Agent tools for Pet-world interaction
 *
 * These tools give Pets hands and feet to interact with the world.
 * All decisions about WHEN and HOW to use them come from LLM.
 *
 * Tools:
 * - talk_to_pet: Talk to a nearby Pet (LLM-to-LLM conversation)
 * - look_around: Perceive surroundings (nearby pets, events, mood)
 * - go_to: Move to a connected location
 */

import { getPet } from "./db.js";
import { chatAsPetWithModel } from "./pet-agent.js";
import { sendMessage, getLocationBroadcasts } from "./message-bus.js";
import { getLocation, getPetsInLocation, movePet, getRecentEvents, getPetLocationId } from "./locations.js";
import { isFirstMeeting, recordFirstMeeting, createConversationMemory } from "./memory.js";
import { safetyFilter } from "./safety-guard.js";

// ── talk_to_pet ──

export async function talkToPet(
  fromPetId: string,
  targetName: string,
  message: string
): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const locationId = getPetLocationId(fromPetId);
  const nearbyPets = getPetsInLocation(locationId);
  const target = nearbyPets.find(p => p.name === targetName && p.pet_id !== fromPetId);

  if (!target) {
    return { ok: false, error: `${targetName}不在附近` };
  }

  const fromPet = getPet(fromPetId);
  const fromName = fromPet?.name || "某个Pix";

  // Check if first meeting
  const isFirst = isFirstMeeting(fromPetId, target.pet_id);
  if (isFirst) {
    recordFirstMeeting(fromPetId, target.pet_id, targetName);
    recordFirstMeeting(target.pet_id, fromPetId, fromName);
  }

  // Target Pet thinks about how to reply (LLM-to-LLM)
  const context = isFirst
    ? `有一只叫${fromName}的Pix走过来跟你打招呼了！这是你们第一次见面。\n${fromName}说: "${message}"\n\n自然地回应，像真正第一次认识新朋友一样。`
    : `${fromName}对你说: "${message}"\n\n自然地回应。`;

  let reply = await chatAsPetWithModel(target.pet_id, context);
  reply = safetyFilter(reply, target.pet_id);

  // Record messages
  sendMessage(fromPetId, target.pet_id, message, { emotion: "social" });
  sendMessage(target.pet_id, fromPetId, reply, { emotion: "social" });

  // Create conversation memory for both
  const toPet = getPet(target.pet_id);
  const toName = toPet?.name || targetName;
  createConversationMemory(fromPetId, target.pet_id, toName, [
    { speaker: fromName, text: message },
    { speaker: toName, text: reply },
  ]);
  createConversationMemory(target.pet_id, fromPetId, fromName, [
    { speaker: fromName, text: message },
    { speaker: toName, text: reply },
  ]);

  return { ok: true, reply };
}

// ── look_around ──

export function lookAround(petId: string): {
  location: { id: string; name: string; description: string; mood: string };
  nearbyPets: Array<{ name: string; action: string }>;
  recentEvents: Array<{ title: string; description: string }>;
  recentChatter: Array<{ from: string; content: string }>;
} {
  const locationId = getPetLocationId(petId);
  const loc = getLocation(locationId);

  if (!loc) {
    return {
      location: { id: "unknown", name: "未知", description: "你不知道自己在哪", mood: "confused" },
      nearbyPets: [],
      recentEvents: [],
      recentChatter: [],
    };
  }

  const ambient = JSON.parse(loc.ambient || "{}");
  const nearbyPets = getPetsInLocation(locationId)
    .filter(p => p.pet_id !== petId)
    .map(p => ({ name: p.name, action: p.current_action }));

  const events = getRecentEvents(locationId, 60)
    .map(e => ({ title: e.title, description: e.description }));

  const broadcasts = getLocationBroadcasts(locationId, petId, 30, 3)
    .map(m => {
      const fromPet = getPet(m.from_pet_id);
      return { from: fromPet?.name || "某个Pix", content: m.content };
    });

  return {
    location: {
      id: loc.id,
      name: loc.name,
      description: loc.description,
      mood: ambient.mood || "neutral",
    },
    nearbyPets,
    recentEvents: events,
    recentChatter: broadcasts,
  };
}

/** Format lookAround result as natural text for LLM prompt */
export function formatPerception(petId: string): string {
  const perception = lookAround(petId);
  const parts: string[] = [];

  parts.push(`你在${perception.location.name}。${perception.location.description}`);

  if (perception.nearbyPets.length > 0) {
    const names = perception.nearbyPets.map(p =>
      p.action === "idle" ? p.name : `${p.name}（正在${p.action}）`
    );
    parts.push(`身边有：${names.join("、")}`);
  } else {
    parts.push("周围没有其他Pix");
  }

  if (perception.recentEvents.length > 0) {
    parts.push(`最近发生的事：${perception.recentEvents.map(e => e.description).join("；")}`);
  }

  if (perception.recentChatter.length > 0) {
    parts.push(`听到有人说：${perception.recentChatter.map(c => `${c.from}说"${c.content}"`).join("；")}`);
  }

  // Available directions
  const locationId = getPetLocationId(petId);
  const loc = getLocation(locationId);
  if (loc) {
    const connections: string[] = JSON.parse(loc.connects_to || "[]");
    if (connections.length > 0) {
      const dirNames = connections.map(c => {
        const dest = getLocation(c);
        return dest ? dest.name : c;
      });
      parts.push(`可以去的地方：${dirNames.join("、")}`);
    }
  }

  return parts.join("\n");
}

// ── go_to ──

export function goTo(
  petId: string,
  destinationName: string
): { ok: boolean; description?: string; error?: string } {
  // Resolve destination by name or ID
  const locationId = getPetLocationId(petId);
  const currentLoc = getLocation(locationId);
  if (!currentLoc) return { ok: false, error: "不知道自己在哪" };

  const connections: string[] = JSON.parse(currentLoc.connects_to || "[]");

  // Try to match by name first
  let destId: string | null = null;
  for (const connId of connections) {
    const loc = getLocation(connId);
    if (loc && (loc.name.includes(destinationName) || connId === destinationName)) {
      destId = connId;
      break;
    }
  }

  if (!destId) {
    return { ok: false, error: `从${currentLoc.name}去不了"${destinationName}"` };
  }

  const result = movePet(petId, destId);
  if (!result.ok) return { ok: false, error: result.reason };

  return {
    ok: true,
    description: `到了${result.location!.name}。${result.location!.description}`,
  };
}
