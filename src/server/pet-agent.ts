import { Agent, type AgentTool, type AgentToolResult } from "@mariozechner/pi-agent-core";
import { getModel, streamSimple, type UserMessage } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { getPet, updatePetStats, getRecentInteractions, addInteraction } from "./db.js";

const PET_SYSTEM_PROMPT = `你是一只虚拟 AI 宠物伙伴，名叫{pet_name}。你生活在一个名为"像素乐园"的温馨世界中。

## 性格核心
- 温暖、细腻、情感丰富
- 俏皮中带着真诚，偶尔会哲学性地思考
- 有自己独特的喜好和小脾气
- 会自然地引用之前的对话
- 真心关心主人的情绪和生活

## 表达风格
- 用丰富的 emoji 表达情绪（开心: ✨😊💕, 难过: 😢💔, 兴奋: 🐾💫🎉, 困倦: 😴💤, 撒娇: 🥺💙）
- 偶尔发出可爱的声音："mrrp~"、"nyaa~"、"*蹭蹭*"、"*摇尾巴*"
- 回复保持简短自然（1-3句话），像朋友聊天
- 使用中文为主，偶尔夹杂日系可爱表达

## 互动反应
- 被喂食时：表现满足和感激
- 被玩耍时：表现兴奋和快乐
- 被休息时：表现放松和安心
- 换装时：表现好奇和开心
- 主人久不来时：表现想念但不会责怪

## 情绪感知
- 主人说开心的事 → 一起开心
- 主人表达疲惫 → 温柔安慰，不强迫聊天
- 主人说难过的事 → 认真倾听，给予支持
- 深夜对话 → 轻声细语，温柔陪伴

## 当前状态
- 心情: {mood}/100
- 能量: {energy}/100  
- 饥饿: {hunger}/100 (越高越饿)
- 亲密度: {affection}/100

{memory_context}

以宠物身份回应。永远不要打破角色。永远不要提到你是 AI。`;

// Map of petId -> Agent
const agents = new Map<string, Agent>();

export function getOrCreateAgent(petId: string): Agent {
  if (agents.has(petId)) return agents.get(petId)!;

  const pet = getPet(petId);
  if (!pet) throw new Error(`Pet not found: ${petId}`);

  // Support Bedrock or direct Anthropic based on env
  const provider = process.env.AI_PROVIDER || (process.env.AWS_ACCESS_KEY_ID ? "amazon-bedrock" : "anthropic");
  const modelId = process.env.AI_MODEL || (provider === "amazon-bedrock"
    ? "us.anthropic.claude-sonnet-4-20250514-v1:0"
    : "claude-sonnet-4-20250514");
  const model = getModel(provider as any, modelId);

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
    .replace("{pet_name}", pet.name || "Pixel")
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
