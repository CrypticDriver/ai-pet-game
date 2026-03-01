/**
 * Pet Memory System
 * 
 * Two layers of memory:
 * 1. General memory: daily activity summaries (what I did today)
 * 2. Social memory: per-pet relationship memories (what I know about each friend)
 * 
 * Key principle (boss directive): 
 * - Pets can have "善意谎言" (white lies / gentle expressions)
 * - Pets CANNOT have "幻觉" (hallucinations / fabricated events)
 * - Memory grounds the AI in real experiences
 * - Memories should be emotional and contextual, not mechanical logs
 */

import { getDb, getPet, updatePetMemory } from "./db.js";
import { getRecentInsights } from "./soul.js";
import { chat } from "./pet-agent.js";

// ── DB Schema ──

export function initMemorySchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_social_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id TEXT NOT NULL,
      target_pet_id TEXT NOT NULL,
      memory_type TEXT NOT NULL CHECK(memory_type IN ('first_meet', 'conversation', 'shared_activity', 'impression', 'friendship')),
      memory_text TEXT NOT NULL,
      emotional_tag TEXT DEFAULT 'neutral',
      importance INTEGER DEFAULT 5 CHECK(importance BETWEEN 1 AND 10),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_social_memory_pet ON pet_social_memory(pet_id, target_pet_id);
  `);

  // Add importance column if missing (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE pet_social_memory ADD COLUMN importance INTEGER DEFAULT 5`);
  } catch { /* already exists */ }
}

/**
 * Build a memory context string for a pet's system prompt.
 * Combines the stored memory_summary with very recent activities.
 */
export function buildMemoryContext(petId: string): string {
  const pet = getPet(petId);
  if (!pet) return "";

  const parts: string[] = [];

  // Long-term memory (compressed summary)
  if (pet.memory_summary) {
    parts.push(`## 你的记忆\n${pet.memory_summary}`);
  }

  // Recent activities (last ~10, for immediate context)
  const db = getDb();
  const recentActivities = db.prepare(`
    SELECT action_type, action_data, location, created_at 
    FROM pet_activity_log
    WHERE pet_id = ?
    ORDER BY id DESC LIMIT 10
  `).all(petId) as any[];

  if (recentActivities.length > 0) {
    const activityLines = recentActivities.reverse().map(a => {
      try {
        const data = JSON.parse(a.action_data);
        return `- ${data.description || a.action_type}`;
      } catch { return `- ${a.action_type}`; }
    });
    parts.push(`## 你最近做的事\n${activityLines.join("\n")}`);
  }

  // Recent social interactions
  const recentSocial = db.prepare(`
    SELECT action_type, action_data FROM pet_activity_log
    WHERE pet_id = ? AND action_type IN ('social_chat_init', 'social_chat_reply', 'social_chat_react', 'became_friends')
    ORDER BY id DESC LIMIT 5
  `).all(petId) as any[];

  if (recentSocial.length > 0) {
    const socialLines = recentSocial.reverse().map(s => {
      try {
        const data = JSON.parse(s.action_data);
        return `- ${data.description}`;
      } catch { return ""; }
    }).filter(Boolean);
    if (socialLines.length > 0) {
      parts.push(`## 你最近的社交\n${socialLines.join("\n")}`);
    }
  }

  // Friends list
  const friends = db.prepare(`
    SELECT p.name FROM friends f
    JOIN pets p ON f.friend_pet_id = p.id
    WHERE f.pet_id = ?
  `).all(petId) as any[];

  if (friends.length > 0) {
    parts.push(`## 你的朋友\n${friends.map((f: any) => f.name).join("、")}`);
  }

  // Daily insights (reflections)
  try {
    const insights = getRecentInsights(petId, 3);
    if (insights.length > 0) {
      parts.push(`## 你最近的感悟\n${insights.map(i => `- ${i}`).join("\n")}`);
    }
  } catch { /* soul module not ready yet */ }

  // Grounding rule
  parts.push(`## 重要规则\n你只能谈论真实发生过的事。上面列出了你的真实记忆和经历。你可以表达感受、聊日常、问问题，但不要编造没有发生过的具体活动或事件。`);

  return parts.join("\n\n");
}

// ── Social Memory (per-pet relationship) ──

/**
 * Get all memories about a specific pet.
 * Used when two pets are about to interact.
 */
export function getMemoriesAbout(petId: string, targetPetId: string): string {
  const db = getDb();
  const memories = db.prepare(`
    SELECT memory_type, memory_text, emotional_tag, importance, created_at
    FROM pet_social_memory
    WHERE pet_id = ? AND target_pet_id = ?
    ORDER BY importance DESC, id ASC
  `).all(petId, targetPetId) as any[];

  if (memories.length === 0) return "";

  const lines = memories.map(m => `- ${m.memory_text}`);
  return lines.join("\n");
}

/**
 * Check if this is the first time two pets meet.
 */
export function isFirstMeeting(petId: string, targetPetId: string): boolean {
  const db = getDb();
  const existing = db.prepare(`
    SELECT 1 FROM pet_social_memory
    WHERE pet_id = ? AND target_pet_id = ? AND memory_type = 'first_meet'
    LIMIT 1
  `).get(petId, targetPetId);
  return !existing;
}

/**
 * Record a first meeting between two pets.
 */
export function recordFirstMeeting(petId: string, targetPetId: string, targetName: string) {
  const db = getDb();
  const hour = new Date().getUTCHours();
  const timeOfDay = hour < 12 ? "上午" : hour < 18 ? "下午" : "晚上";

  db.prepare(`
    INSERT INTO pet_social_memory (pet_id, target_pet_id, memory_type, memory_text, emotional_tag, importance)
    VALUES (?, ?, 'first_meet', ?, 'warm', 8)
  `).run(petId, targetPetId, `第一次在Hub认识了${targetName}，是${timeOfDay}的时候`);
}

/**
 * After a conversation, generate a memory summary using AI.
 * This creates an emotional, contextual memory — not a mechanical log.
 */
export async function createConversationMemory(
  petId: string,
  targetPetId: string,
  targetName: string,
  messages: Array<{ speaker: string; text: string }>
) {
  const db = getDb();

  // Build conversation text for summarization
  const convoText = messages.map(m => `${m.speaker}: ${m.text}`).join("\n");

  // Use the pet's own AI to generate a memory (from its perspective)
  try {
    const result = await chat(petId,
      `[系统：请用一句话总结你刚才和${targetName}的对话，写下你想记住的东西。` +
      `比如对方说了什么有趣的话、你们聊了什么话题、你对它的感觉。` +
      `只写一句简短的记忆，不要打招呼。]\n\n刚才的对话：\n${convoText}`
    );

    const memoryText = result.text?.replace(/^[\s"']*|[\s"']*$/g, "").slice(0, 200);
    if (memoryText && memoryText.length > 5) {
      // Detect emotional tag from content
      let emotionalTag = "neutral";
      if (/开心|快乐|好玩|有趣|哈哈/.test(memoryText)) emotionalTag = "happy";
      else if (/温暖|温柔|感动|谢谢/.test(memoryText)) emotionalTag = "warm";
      else if (/好奇|有意思|想知道/.test(memoryText)) emotionalTag = "curious";
      else if (/难过|担心|想念/.test(memoryText)) emotionalTag = "sad";

      db.prepare(`
        INSERT INTO pet_social_memory (pet_id, target_pet_id, memory_type, memory_text, emotional_tag, importance)
        VALUES (?, ?, 'conversation', ?, ?, ?)
      `).run(petId, targetPetId, memoryText, emotionalTag,
        // Emotional memories are more important
        emotionalTag === "happy" || emotionalTag === "warm" ? 7 : 5
      );

      console.log(`🧠 Memory created for ${petId} about ${targetName}: "${memoryText.slice(0, 50)}..."`);
    }
  } catch (err: any) {
    console.error(`Memory creation error: ${err.message}`);
  }
}

/**
 * Record a friendship event.
 */
export function recordFriendship(petId: string, targetPetId: string, targetName: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO pet_social_memory (pet_id, target_pet_id, memory_type, memory_text, emotional_tag, importance)
    VALUES (?, ?, 'friendship', ?, 'happy', 9)
  `).run(petId, targetPetId, `和${targetName}成为了好朋友！觉得特别开心`);
}

/**
 * Build a social context string for a specific interaction.
 * Injected when Pet A is about to talk with Pet B.
 */
export function buildSocialContext(petId: string, targetPetId: string, targetName: string): string {
  const memories = getMemoriesAbout(petId, targetPetId);
  const isFirst = isFirstMeeting(petId, targetPetId);

  if (isFirst) {
    return `\n\n[你从来没见过${targetName}，这是你们第一次相遇。好奇地去认识它吧！]`;
  }

  if (!memories) {
    return `\n\n[你之前见过${targetName}，但记忆模糊。]`;
  }

  return `\n\n[你对${targetName}的记忆：\n${memories}\n\n基于这些记忆继续你们的对话。]`;
}

/**
 * Compress recent activities into a memory summary.
 * Called periodically (e.g., every 10 minutes or every N ticks).
 * Keeps the memory_summary field concise but comprehensive.
 */
export function compressMemory(petId: string) {
  const db = getDb();
  const pet = getPet(petId);
  if (!pet) return;

  // Get activities since last compression (or last 50)
  const activities = db.prepare(`
    SELECT action_type, action_data, location, created_at
    FROM pet_activity_log
    WHERE pet_id = ?
    ORDER BY id DESC LIMIT 50
  `).all(petId) as any[];

  if (activities.length === 0) return;

  // Count activity types
  const counts: Record<string, number> = {};
  const socialNames = new Set<string>();
  const notableEvents: string[] = [];

  for (const a of activities) {
    counts[a.action_type] = (counts[a.action_type] || 0) + 1;
    try {
      const data = JSON.parse(a.action_data);
      if (data.targetPet) socialNames.add(data.targetPet);
      // Track notable events
      if (['became_friends', 'social_chat_init', 'go_to_plaza', 'go_home'].includes(a.action_type)) {
        notableEvents.push(data.description || a.action_type);
      }
    } catch {}
  }

  // Build compressed summary
  const summaryParts: string[] = [];

  // Existing memory (keep previous, append new)
  const existingSummary = pet.memory_summary || "";

  // Daily summary
  const today = new Date().toISOString().slice(0, 10);
  const dailyLines: string[] = [];

  if (counts.play_toy) dailyLines.push(`玩了${counts.play_toy}次玩具球`);
  if (counts.explore) dailyLines.push(`在房间里探索了${counts.explore}次`);
  if (counts.nap || counts.sleep) dailyLines.push(`睡了${(counts.nap || 0) + (counts.sleep || 0)}次觉`);
  if (counts.window || counts.stargaze) dailyLines.push(`看了${(counts.window || 0) + (counts.stargaze || 0)}次窗外`);
  if (counts.fountain) dailyLines.push(`在喷泉边玩了${counts.fountain}次水`);
  if (counts.wander) dailyLines.push(`在广场散了${counts.wander}次步`);
  if (counts.butterfly) dailyLines.push(`追了${counts.butterfly}次蝴蝶`);
  if (counts.bench) dailyLines.push(`在长椅上休息了${counts.bench}次`);
  if (counts.read) dailyLines.push(`看了${counts.read}次书`);

  const socialCount = (counts.social_chat_init || 0) + (counts.social_chat_reply || 0);
  if (socialCount > 0) {
    const names = Array.from(socialNames).join("、");
    dailyLines.push(`和${names || "其他Pix"}聊了${Math.ceil(socialCount / 2)}次天`);
  }

  if (counts.became_friends) {
    const friendNames = Array.from(socialNames).join("、");
    dailyLines.push(`交到了新朋友：${friendNames}`);
  }

  if (dailyLines.length > 0) {
    summaryParts.push(`[${today}] ${dailyLines.join("，")}`);
  }

  // Combine with existing (keep last 500 chars to prevent unbounded growth)
  let newSummary = existingSummary;
  if (summaryParts.length > 0) {
    const addition = summaryParts.join("\n");
    // Avoid duplicating today's entry
    if (!existingSummary.includes(`[${today}]`)) {
      newSummary = existingSummary ? `${existingSummary}\n${addition}` : addition;
    } else {
      // Replace today's entry
      newSummary = existingSummary.replace(new RegExp(`\\[${today}\\].*`), addition);
    }
  }

  // Keep concise (last 500 chars)
  if (newSummary.length > 500) {
    newSummary = "..." + newSummary.slice(-497);
  }

  updatePetMemory(petId, newSummary);
}

/**
 * Compress memories for ALL pets. Called periodically.
 */
export function compressAllMemories() {
  const db = getDb();
  const pets = db.prepare("SELECT id FROM pets").all() as any[];
  for (const pet of pets) {
    try {
      compressMemory(pet.id);
    } catch (err) {
      console.error(`Memory compression error for ${pet.id}:`, err);
    }
  }
  console.log(`🧠 Memory compressed for ${pets.length} pets`);
}
