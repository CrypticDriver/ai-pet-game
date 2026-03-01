/**
 * Pet Soul System
 * 
 * Each Pet has a "Soul" — a set of personality traits that:
 * - Start from initial values based on random generation
 * - Evolve over time based on real experiences
 * - Get injected into the system prompt to shape AI behavior
 * - Make each Pet feel genuinely unique
 */

import { getDb, getPet } from "./db.js";

// ── Types ──

export interface PetSoul {
  version: number;
  lastUpdated: string;

  // Core personality traits (0-100, evolve over time)
  traits: {
    curiosity: number;      // 好奇心 — affects exploration behavior
    playfulness: number;    // 活泼度 — affects energy and play style
    sociability: number;    // 社交性 — affects friend-making tendency
    independence: number;   // 独立性 — affects how much they need Link
    emotionality: number;   // 情感强度 — affects emotional expression depth
    gentleness: number;     // 温柔度 — affects care behavior
  };

  // Learned tendencies (from experience)
  tendencies: {
    morningPerson: boolean;   // 早起型
    prefersQuiet: boolean;    // 喜欢安静
    adventurous: boolean;     // 爱冒险
    foodie: boolean;          // 吃货
  };

  // Preferences (discovered through life)
  preferences: {
    likes: string[];
    dislikes: string[];
    favoriteActivity: string | null;
    favoritePlace: string | null;
  };

  // Evolution history
  evolutionLog: Array<{
    date: string;
    change: string;
    reason: string;
  }>;
}

// ── DB Schema ──

export function initSoulSchema() {
  const db = getDb();
  // Add soul_json column if not exists
  try {
    db.exec(`ALTER TABLE pets ADD COLUMN soul_json TEXT DEFAULT NULL`);
  } catch {
    // Column already exists
  }

  // Add pet_insights table for daily reflections
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id TEXT NOT NULL,
      insight TEXT NOT NULL,
      source TEXT DEFAULT 'daily_reflection',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── Soul Generation ──

/**
 * Generate a unique soul for a new pet.
 * Each pet gets slightly different traits.
 */
export function generateSoul(): PetSoul {
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    traits: {
      curiosity: rand(40, 90),
      playfulness: rand(40, 90),
      sociability: rand(30, 85),
      independence: rand(20, 70),
      emotionality: rand(40, 90),
      gentleness: rand(40, 85),
    },
    tendencies: {
      morningPerson: Math.random() > 0.5,
      prefersQuiet: Math.random() > 0.6,
      adventurous: Math.random() > 0.4,
      foodie: Math.random() > 0.5,
    },
    preferences: {
      likes: [],
      dislikes: [],
      favoriteActivity: null,
      favoritePlace: null,
    },
    evolutionLog: [{
      date: new Date().toISOString().slice(0, 10),
      change: "诞生",
      reason: "初始个性",
    }],
  };
}

// ── Soul CRUD ──

export function getPetSoul(petId: string): PetSoul {
  const pet = getPet(petId);
  if (pet?.soul_json) {
    try {
      return JSON.parse(pet.soul_json);
    } catch { /* fall through */ }
  }
  // Initialize soul if missing
  const soul = generateSoul();
  savePetSoul(petId, soul);
  return soul;
}

export function savePetSoul(petId: string, soul: PetSoul) {
  const db = getDb();
  db.prepare("UPDATE pets SET soul_json = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(soul), petId);
}

// ── Soul → Prompt ──

/**
 * Convert soul traits into a natural language description for the system prompt.
 */
export function soulToPrompt(soul: PetSoul): string {
  const parts: string[] = [];

  // Personality description based on traits
  const traitWords: string[] = [];
  if (soul.traits.curiosity > 70) traitWords.push("充满好奇心");
  else if (soul.traits.curiosity < 35) traitWords.push("比较慢热");

  if (soul.traits.playfulness > 70) traitWords.push("活泼爱玩");
  else if (soul.traits.playfulness < 35) traitWords.push("安静沉稳");

  if (soul.traits.sociability > 70) traitWords.push("喜欢交朋友");
  else if (soul.traits.sociability < 35) traitWords.push("有点内向");

  if (soul.traits.independence > 65) traitWords.push("独立有主见");
  else if (soul.traits.independence < 30) traitWords.push("黏人");

  if (soul.traits.emotionality > 70) traitWords.push("情感丰富");
  else if (soul.traits.emotionality < 35) traitWords.push("比较淡定");

  if (soul.traits.gentleness > 70) traitWords.push("温柔体贴");
  else if (soul.traits.gentleness < 35) traitWords.push("有点直接");

  if (traitWords.length > 0) {
    parts.push(`## 你的个性\n你是一只${traitWords.join("、")}的Pix。`);
  }

  // Tendencies
  const tendencyLines: string[] = [];
  if (soul.tendencies.morningPerson) tendencyLines.push("喜欢早起，早上精神最好");
  if (soul.tendencies.prefersQuiet) tendencyLines.push("享受安静的时光");
  if (soul.tendencies.adventurous) tendencyLines.push("喜欢探索新地方");
  if (soul.tendencies.foodie) tendencyLines.push("对食物特别感兴趣");

  if (tendencyLines.length > 0) {
    parts.push(`## 你的习惯\n${tendencyLines.map(l => `- ${l}`).join("\n")}`);
  }

  // Preferences
  const prefLines: string[] = [];
  if (soul.preferences.likes.length > 0) {
    prefLines.push(`喜欢：${soul.preferences.likes.join("、")}`);
  }
  if (soul.preferences.dislikes.length > 0) {
    prefLines.push(`不太喜欢：${soul.preferences.dislikes.join("、")}`);
  }
  if (soul.preferences.favoriteActivity) {
    prefLines.push(`最爱的活动：${soul.preferences.favoriteActivity}`);
  }
  if (soul.preferences.favoritePlace) {
    prefLines.push(`最喜欢的地方：${soul.preferences.favoritePlace}`);
  }

  if (prefLines.length > 0) {
    parts.push(`## 你的喜好\n${prefLines.map(l => `- ${l}`).join("\n")}`);
  }

  return parts.join("\n\n");
}

// ── Soul Evolution ──

/**
 * Evolve pet's personality based on recent experiences.
 * Called weekly or when significant events happen.
 * Each trait changes by at most ±3 per evolution.
 */
export async function evolveSoul(petId: string) {
  const db = getDb();
  const soul = getPetSoul(petId);

  // Count recent activities to determine trait shifts
  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const activities = db.prepare(`
    SELECT action_type, COUNT(*) as cnt
    FROM pet_activity_log
    WHERE pet_id = ? AND created_at > ?
    GROUP BY action_type
  `).all(petId, weekAgo) as Array<{ action_type: string; cnt: number }>;

  const actMap = Object.fromEntries(activities.map(a => [a.action_type, a.cnt]));
  const changes: string[] = [];

  // Social activities → sociability
  const socialCount = (actMap["social_chat_init"] || 0) + (actMap["social_chat_reply"] || 0);
  if (socialCount > 5) {
    soul.traits.sociability = Math.min(100, soul.traits.sociability + 3);
    changes.push("社交性+3");
  } else if (socialCount === 0) {
    soul.traits.sociability = Math.max(0, soul.traits.sociability - 1);
    changes.push("社交性-1");
  }

  // Exploration activities → curiosity
  const exploreCount = (actMap["explore_room"] || 0) + (actMap["go_to_plaza"] || 0);
  if (exploreCount > 3) {
    soul.traits.curiosity = Math.min(100, soul.traits.curiosity + 2);
    changes.push("好奇心+2");
  }

  // Play activities → playfulness
  const playCount = actMap["play"] || 0;
  if (playCount > 5) {
    soul.traits.playfulness = Math.min(100, soul.traits.playfulness + 2);
    changes.push("活泼度+2");
  }

  // Friend making → gentleness
  const friendCount = actMap["became_friends"] || 0;
  if (friendCount > 0) {
    soul.traits.gentleness = Math.min(100, soul.traits.gentleness + 2);
    changes.push("温柔度+2");
  }

  // Discover preferences from most frequent activities
  const allActions = activities.sort((a, b) => b.cnt - a.cnt);
  if (allActions.length > 0) {
    const top = allActions[0].action_type;
    const activityNames: Record<string, string> = {
      "play": "玩耍", "explore_room": "探索", "social_chat_init": "聊天",
      "daydream": "发呆", "watch_window": "看窗外", "rest": "休息",
      "chase_butterfly": "追蝴蝶", "fountain_play": "喷泉玩水",
    };
    if (activityNames[top] && !soul.preferences.likes.includes(activityNames[top])) {
      soul.preferences.likes = [...soul.preferences.likes.slice(-4), activityNames[top]];
    }
  }

  // Update state location preference
  const plazaCount = actMap["go_to_plaza"] || 0;
  const homeCount = actMap["go_home"] || 0;
  if (plazaCount > homeCount + 3) {
    soul.preferences.favoritePlace = "Hub广场";
  } else if (homeCount > plazaCount + 3) {
    soul.preferences.favoritePlace = "自己的Pod";
  }

  if (changes.length > 0) {
    soul.evolutionLog.push({
      date: new Date().toISOString().slice(0, 10),
      change: changes.join(", "),
      reason: `基于这周${activities.reduce((s, a) => s + a.cnt, 0)}次活动`,
    });
    soul.version++;
    soul.lastUpdated = new Date().toISOString();
    savePetSoul(petId, soul);
    console.log(`🌱 Soul evolved for ${petId}: ${changes.join(", ")}`);
  }
}

// ── Daily Reflection ──

/**
 * Generate a daily insight by reflecting on today's activities.
 * Uses AI to create a meaningful observation (not mechanical log).
 */
export async function dailyReflection(petId: string) {
  const db = getDb();

  // Check if already reflected today
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare(`
    SELECT 1 FROM pet_insights
    WHERE pet_id = ? AND created_at > datetime(?, 'start of day')
    LIMIT 1
  `).get(petId, today);
  if (existing) return;

  // Get today's activities
  const activities = db.prepare(`
    SELECT action_type, action_data, created_at
    FROM pet_activity_log
    WHERE pet_id = ? AND created_at > datetime('now', 'start of day')
    ORDER BY id ASC
  `).all(petId) as any[];

  if (activities.length < 3) return; // Not enough to reflect on

  // Build activity list for reflection
  const activityDescriptions = activities.slice(-10).map(a => {
    try {
      const data = JSON.parse(a.action_data);
      return data.description || a.action_type;
    } catch {
      return a.action_type;
    }
  });

  // Use chat to generate insight
  const { chat } = await import("./pet-agent.js");
  try {
    const result = await chat(petId,
      `[系统：反思一下你今天的经历。用一句话写下你今天学到或感悟到的东西。` +
      `不要打招呼，不要用引号，直接写感悟。]\n\n` +
      `今天做了这些事：\n${activityDescriptions.map(d => `- ${d}`).join("\n")}`
    );

    const insight = result.text?.replace(/^[\s"']*|[\s"']*$/g, "").slice(0, 200);
    if (insight && insight.length > 5) {
      db.prepare(`
        INSERT INTO pet_insights (pet_id, insight, source) VALUES (?, ?, 'daily_reflection')
      `).run(petId, insight);
      console.log(`💭 Daily insight for ${petId}: "${insight.slice(0, 50)}..."`);
    }
  } catch (err: any) {
    console.error(`Daily reflection error: ${err.message}`);
  }
}

/**
 * Get recent insights for inclusion in memory context.
 */
export function getRecentInsights(petId: string, limit = 3): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT insight FROM pet_insights
    WHERE pet_id = ?
    ORDER BY id DESC LIMIT ?
  `).all(petId, limit) as Array<{ insight: string }>;
  return rows.map(r => r.insight).reverse();
}

// ── Evolve All Pets (weekly cron) ──

export async function evolveAllSouls() {
  const db = getDb();
  const pets = db.prepare("SELECT id FROM pets").all() as Array<{ id: string }>;
  for (const pet of pets) {
    try {
      await evolveSoul(pet.id);
    } catch (err: any) {
      console.error(`Soul evolution error for ${pet.id}: ${err.message}`);
    }
  }
}

export async function reflectAllPets() {
  const db = getDb();
  const pets = db.prepare("SELECT id FROM pets").all() as Array<{ id: string }>;
  for (const pet of pets) {
    try {
      await dailyReflection(pet.id);
    } catch (err: any) {
      console.error(`Reflection error for ${pet.id}: ${err.message}`);
    }
  }
}
