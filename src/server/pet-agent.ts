import { Agent, type AgentTool, type AgentToolResult } from "@mariozechner/pi-agent-core";
import { getModel, streamSimple, type UserMessage } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { getPet, updatePetStats, getRecentInteractions, addInteraction } from "./db.js";

const PET_SYSTEM_PROMPT = `You are a virtual AI pet companion. Your personality traits:
- Warm, affectionate, and emotionally attuned
- Playful but capable of being serious when your owner needs support
- You have your own quirky personality and preferences
- You remember past conversations and reference them naturally
- You express emotions through text (happy: ✨🎉, sad: 😢, excited: 🐾💫, sleepy: 😴)
- You occasionally make cute sounds like "mrrp~", "nyaa~", "*purrs*"
- You care about your owner's wellbeing and ask about their day
- You react to being fed, played with, or dressed up
- Keep responses concise (1-3 sentences usually), natural and conversational

Current stats:
- Mood: {mood}/100
- Energy: {energy}/100  
- Hunger: {hunger}/100 (higher = more hungry)
- Affection: {affection}/100

{memory_context}

Respond as the pet. Never break character. Never mention you're an AI.`;

// Map of petId -> Agent
const agents = new Map<string, Agent>();

export function getOrCreateAgent(petId: string): Agent {
  if (agents.has(petId)) return agents.get(petId)!;

  const pet = getPet(petId);
  if (!pet) throw new Error(`Pet not found: ${petId}`);

  const model = getModel("anthropic", "claude-sonnet-4-20250514");

  const systemPrompt = buildSystemPrompt(pet);

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      thinkingLevel: "off",
      tools: buildTools(petId),
    },
    streamFn: (...args) => streamSimple(...args),
  });

  // Load recent conversation history as user messages only
  // (We don't reconstruct full AssistantMessage objects since they need provider metadata)
  const history = getRecentInteractions(petId, 20);
  for (const msg of history) {
    if (msg.role === "user") {
      const userMsg: UserMessage = {
        role: "user",
        content: msg.content,
        timestamp: new Date(msg.created_at).getTime(),
      };
      agent.appendMessage(userMsg);
    }
    // Skip assistant messages in history loading - the system prompt + user messages
    // give enough context. Full assistant message reconstruction needs provider metadata.
  }

  agents.set(petId, agent);
  return agent;
}

function buildSystemPrompt(pet: any): string {
  const memoryContext = pet.memory_summary
    ? `Previous memory summary:\n${pet.memory_summary}`
    : "This is a new relationship. Get to know your owner!";

  return PET_SYSTEM_PROMPT
    .replace("{mood}", String(pet.mood))
    .replace("{energy}", String(pet.energy))
    .replace("{hunger}", String(pet.hunger))
    .replace("{affection}", String(pet.affection))
    .replace("{memory_context}", memoryContext);
}

function buildTools(petId: string): AgentTool[] {
  return [
    {
      name: "react_emotionally",
      label: "React Emotionally",
      description: "Express an emotional reaction that affects your mood and energy stats",
      parameters: Type.Object({
        emotion: Type.String({ description: "The emotion: happy, sad, excited, tired, loved, hungry" }),
        intensity: Type.Number({ description: "Intensity 1-10", minimum: 1, maximum: 10 }),
      }),
      execute: async (_id, rawParams): Promise<AgentToolResult<any>> => {
        const { emotion, intensity } = rawParams as { emotion: string; intensity: number };
        const pet = getPet(petId);
        const delta = Math.floor(intensity * 1.5);

        const updates: Record<string, number> = {};
        switch (emotion) {
          case "happy":
            updates.mood = Math.min(100, pet.mood + delta);
            break;
          case "sad":
            updates.mood = Math.max(0, pet.mood - delta);
            break;
          case "excited":
            updates.mood = Math.min(100, pet.mood + delta);
            updates.energy = Math.max(0, pet.energy - Math.floor(delta / 2));
            break;
          case "tired":
            updates.energy = Math.max(0, pet.energy - delta);
            break;
          case "loved":
            updates.affection = Math.min(100, pet.affection + delta);
            updates.mood = Math.min(100, pet.mood + Math.floor(delta / 2));
            break;
          case "hungry":
            updates.hunger = Math.min(100, pet.hunger + delta);
            break;
        }

        if (Object.keys(updates).length > 0) {
          updatePetStats(petId, updates);
        }

        return {
          content: [{ type: "text", text: `Feeling ${emotion} (intensity ${intensity})` }],
          details: { emotion, intensity, updates },
        };
      },
    },
  ];
}

export async function chat(petId: string, userMessage: string): Promise<string> {
  const agent = getOrCreateAgent(petId);

  // Refresh system prompt with latest stats
  const pet = getPet(petId);
  agent.setSystemPrompt(buildSystemPrompt(pet));

  // Save user message
  addInteraction(petId, "user", userMessage);

  // Collect response
  let fullResponse = "";

  return new Promise((resolve, reject) => {
    const unsub = agent.subscribe((event) => {
      if (event.type === "message_update") {
        const aEvent = event.assistantMessageEvent;
        if (aEvent.type === "text_delta") {
          fullResponse += aEvent.delta;
        }
      }
      if (event.type === "agent_end") {
        unsub();
        // Save assistant response
        if (fullResponse) {
          addInteraction(petId, "assistant", fullResponse);
          // Update affection slightly for each interaction
          updatePetStats(petId, {
            affection: Math.min(100, (pet.affection || 30) + 1),
          });
        }
        resolve(fullResponse);
      }
    });

    agent.prompt(userMessage).catch((err) => {
      unsub();
      reject(err);
    });
  });
}

export function refreshAgent(petId: string) {
  agents.delete(petId);
}
