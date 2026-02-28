/**
 * Pet Memory System
 * 
 * Each pet accumulates memories from activities, conversations, and social interactions.
 * Memories are periodically compressed into a summary stored in the DB.
 * This summary is injected into the AI system prompt so pets "remember" their life.
 * 
 * Key principle (boss directive): 
 * - Pets can have "善意谎言" (white lies / gentle expressions)
 * - Pets CANNOT have "幻觉" (hallucinations / fabricated events)
 * - Memory grounds the AI in real experiences
 */

import { getDb, getPet, updatePetMemory } from "./db.js";

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

  // Grounding rule
  parts.push(`## 重要规则\n你只能谈论真实发生过的事。上面列出了你的真实记忆和经历。你可以表达感受、聊日常、问问题，但不要编造没有发生过的具体活动或事件。`);

  return parts.join("\n\n");
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
