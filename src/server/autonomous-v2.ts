/**
 * Autonomous Behavior v2 — LLM-Driven Digital Life
 *
 * Every tick, each Pet:
 * 1. Perceives its surroundings (code, not LLM)
 * 2. Decides what to do (LLM — this is the Pet's free will)
 * 3. Executes the action (code)
 *
 * The LLM is the brain. Code is just the body.
 */

import { getDb, getPet } from "./db.js";
import { getPetSoul, soulToPrompt } from "./soul.js";
import { buildMemoryContext } from "./memory.js";
import { getInbox } from "./message-bus.js";
import { formatPerception, talkToPet, goTo, lookAround } from "./world-tools.js";
import { getPetLocationId, getPetsInLocation } from "./locations.js";
import { hasStimulus, classifyPriority, think } from "./llm-scheduler.js";
import { safetyFilter } from "./safety-guard.js";
import { broadcastMessage } from "./message-bus.js";

// ── Autonomous Tick (v2) ──

const TICK_INTERVAL = 42_000; // 42 seconds per boss directive
let tickTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Run one autonomous tick for a single pet.
 * This is where the pet THINKS.
 */
export async function autonomousTickV2(petId: string) {
  const db = getDb();
  const pet = getPet(petId);
  if (!pet) return;

  const locationId = getPetLocationId(petId);
  const nearbyPets = getPetsInLocation(locationId);
  const inbox = getInbox(petId, locationId, 5);
  const otherPetsHere = nearbyPets.filter(p => p.pet_id !== petId);

  // ── Stimulus Check (code, not LLM) ──
  // Only call LLM if there's something worth thinking about
  const stimulated = hasStimulus({
    unreadMessages: inbox.length,
    nearbyPetChanged: otherPetsHere.length > 0,
    newEvent: false, // TODO: check location_events
    lowStats: pet.energy < 20 || pet.hunger < 20,
    randomChance: 0.15, // 15% chance of spontaneous thought
  });

  if (!stimulated) {
    // Nothing interesting — pet stays idle, no LLM cost
    return;
  }

  // ── Build Perception (code assembles, LLM interprets) ──
  const soul = getPetSoul(petId);
  const memory = buildMemoryContext(petId);
  const perception = formatPerception(petId);

  const inboxText = inbox.length > 0
    ? `\n## 有人找你\n${inbox.map(m => {
        const from = getPet(m.from_pet_id);
        return `- ${from?.name || "某个Pix"}: ${m.content}`;
      }).join("\n")}`
    : "";

  const prompt = `${soulToPrompt(soul)}

## 此刻
${perception}
- 你的心情：${pet.mood}% | 能量：${pet.energy}% | 饱腹：${pet.hunger}%
${inboxText}

## 你的记忆
${memory}

## 你现在想做什么？

想说话就说，想走就走，想发呆也行。做你想做的。
回复格式（选一个）：
- [说话] 对象名: 你要说的话
- [去] 地点名
- [广播] 你想大声说的话（附近所有Pix都能听到）
- [行动] 描述你在做什么（发呆、看书、散步...）
- [想法] 你心里在想什么（不会被别人听到）

只选一个行动，简短自然。`;

  // ── LLM Decision ──
  const priority = inbox.length > 0 ? classifyPriority("message_reply") : classifyPriority("autonomous");

  let response: string;
  try {
    const result = await think({ petId, context: prompt, priority });
    response = safetyFilter(result.text, petId);
  } catch (err) {
    console.error(`🧠 Autonomous think error for ${pet.name}:`, err);
    return;
  }

  // ── Execute Action (parse LLM output) ──
  await executeResponse(petId, response);

  // ── Log Activity ──
  db.prepare(`
    INSERT INTO pet_activity_log (pet_id, action_type, action_data, location)
    VALUES (?, 'autonomous_v2', ?, ?)
  `).run(petId, JSON.stringify({ response: response.slice(0, 200) }), locationId);
}

/**
 * Parse and execute the LLM's decision
 */
async function executeResponse(petId: string, response: string) {
  const db = getDb();

  // [说话] 对象名: 内容
  const talkMatch = response.match(/\[说话\]\s*(.+?)[:：]\s*(.+)/);
  if (talkMatch) {
    const [, targetName, message] = talkMatch;
    const result = await talkToPet(petId, targetName.trim(), message.trim());
    if (result.ok) {
      updateAction(petId, `跟${targetName.trim()}聊天`);
    }
    return;
  }

  // [去] 地点名
  const goMatch = response.match(/\[去\]\s*(.+)/);
  if (goMatch) {
    const result = goTo(petId, goMatch[1].trim());
    if (result.ok) {
      updateAction(petId, `去了${goMatch[1].trim()}`);
    }
    return;
  }

  // [广播] 内容
  const broadcastMatch = response.match(/\[广播\]\s*(.+)/);
  if (broadcastMatch) {
    const locationId = getPetLocationId(petId);
    broadcastMessage(petId, locationId, broadcastMatch[1].trim());
    updateAction(petId, "说了些什么");
    return;
  }

  // [行动] 描述
  const actionMatch = response.match(/\[行动\]\s*(.+)/);
  if (actionMatch) {
    updateAction(petId, actionMatch[1].trim());
    logActivity(petId, "action", actionMatch[1].trim());
    return;
  }

  // [想法] 内心独白（不执行任何外部行动）
  const thoughtMatch = response.match(/\[想法\]\s*(.+)/);
  if (thoughtMatch) {
    updateAction(petId, "在想事情...");
    logActivity(petId, "thought", thoughtMatch[1].trim());
    return;
  }

  // Fallback: treat as free action
  updateAction(petId, response.slice(0, 50));
  logActivity(petId, "free", response.slice(0, 200));
}

function updateAction(petId: string, action: string) {
  const db = getDb();
  db.prepare(`
    UPDATE pet_state SET current_action = ? WHERE pet_id = ?
  `).run(action.slice(0, 100), petId);
}

function logActivity(petId: string, type: string, description: string) {
  const db = getDb();
  const locationId = getPetLocationId(petId);
  db.prepare(`
    INSERT INTO pet_activity_log (pet_id, action_type, action_data, location)
    VALUES (?, ?, ?, ?)
  `).run(petId, type, JSON.stringify({ description }), locationId);
}

// ── Tick Manager ──

/**
 * Start the autonomous v2 tick loop for all pets.
 */
export function startAutonomousV2() {
  if (tickTimer) return;

  console.log(`🧬 Autonomous v2 started (${TICK_INTERVAL / 1000}s interval, LLM-driven)`);

  tickTimer = setInterval(async () => {
    const db = getDb();
    const pets = db.prepare("SELECT id FROM pets").all() as Array<{ id: string }>;

    // Process pets in sequence to control concurrency
    // (LLM scheduler handles its own concurrency)
    for (const pet of pets) {
      try {
        await autonomousTickV2(pet.id);
      } catch (err) {
        console.error(`🧬 Tick error for ${pet.id}:`, err);
      }
    }
  }, TICK_INTERVAL);
}

/**
 * Stop the autonomous v2 tick loop.
 */
export function stopAutonomousV2() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
    console.log("🧬 Autonomous v2 stopped");
  }
}
