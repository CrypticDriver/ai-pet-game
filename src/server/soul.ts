/**
 * Pet Soul System — MBTI Edition
 * 
 * Each Pet has a "Soul" with an MBTI personality type that:
 * - Is randomly assigned from 16 types at birth
 * - Maps to initial trait values (curiosity, sociability, etc.)
 * - Gets injected into the system prompt with rich personality description
 * - Evolves over time based on real experiences
 */

import { getDb, getPet } from "./db.js";

// ── MBTI Types ──

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

export type MBTIType = (typeof MBTI_TYPES)[number];

const MBTI_INFO: Record<MBTIType, { cn: string; traits: string; style: string }> = {
  INTJ: { cn: "建筑师", traits: "独立、有远见、逻辑清晰、追求效率", style: "冷静理性，喜欢独自思考大问题，偶尔说出深刻的洞察" },
  INTP: { cn: "逻辑学家", traits: "好奇心强、分析型、创意丰富、安静", style: "沉浸在自己的思考中，对有趣的问题会突然变得很兴奋" },
  ENTJ: { cn: "指挥官", traits: "自信、果断、领导力强、有组织", style: "天生的领导者，喜欢组织活动和带领大家" },
  ENTP: { cn: "辩论家", traits: "机智、灵活、好奇、爱争论", style: "脑子转得快，喜欢用新奇的角度看问题，有点调皮" },
  INFJ: { cn: "提倡者", traits: "理想主义、有洞察力、温暖、坚定", style: "安静但有深度，关心他人的感受，偶尔说出很有哲理的话" },
  INFP: { cn: "调停者", traits: "浪漫、有同理心、创造力强、敏感", style: "内心世界丰富，容易被美好的事物感动，喜欢幻想" },
  ENFJ: { cn: "主人公", traits: "热情、有魅力、关怀他人、鼓舞人心", style: "温暖开朗，总是关心周围的朋友，喜欢帮助别人" },
  ENFP: { cn: "竞选者", traits: "热情洋溢、创意满满、社交达人、乐观", style: "活力四射，充满想象力，说话跳跃但很有感染力" },
  ISTJ: { cn: "物流师", traits: "可靠、实际、认真、有责任感", style: "稳重踏实，做事有条理，是最靠谱的朋友" },
  ISFJ: { cn: "守卫者", traits: "温和、体贴、忠诚、细心", style: "默默关心身边的人，记住每个朋友的喜好，很暖" },
  ESTJ: { cn: "总经理", traits: "务实、组织力强、直接、传统", style: "做事雷厉风行，喜欢秩序，会主动维护社区规则" },
  ESFJ: { cn: "执政官", traits: "热心、合群、忠诚、体贴", style: "社交达人，照顾每个人的感受，喜欢组织聚会" },
  ISTP: { cn: "鉴赏家", traits: "冷静、灵巧、实用、独立", style: "安静但很酷，喜欢动手探索，说话简洁有力" },
  ISFP: { cn: "探险家", traits: "温柔、艺术感强、自由、敏感", style: "安静的艺术灵魂，喜欢美好的事物，有自己的审美" },
  ESTP: { cn: "企业家", traits: "大胆、精力充沛、直接、社交能力强", style: "行动派，喜欢冒险和新鲜事物，派对的灵魂" },
  ESFP: { cn: "表演者", traits: "活泼、自发、热情、好玩", style: "天生的开心果，到哪里都能带来欢乐气氛" },
};

// ── Types ──

export interface PetSoul {
  version: number;
  lastUpdated: string;
  mbti: MBTIType;

  // Core personality traits (0-100, seeded from MBTI, evolve over time)
  traits: {
    curiosity: number;      // 好奇心 — N types higher
    playfulness: number;    // 活泼度 — P types higher
    sociability: number;    // 社交性 — E types higher
    independence: number;   // 独立性 — I types higher
    emotionality: number;   // 情感强度 — F types higher
    gentleness: number;     // 温柔度 — F types higher
  };

  // Learned tendencies (seeded from MBTI, refined by experience)
  tendencies: {
    morningPerson: boolean;
    prefersQuiet: boolean;
    adventurous: boolean;
    foodie: boolean;
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
  try {
    db.exec(`ALTER TABLE pets ADD COLUMN soul_json TEXT DEFAULT NULL`);
  } catch { /* already exists */ }

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

// ── MBTI → Traits Mapping ──

function mbtiToTraits(mbti: MBTIType): PetSoul["traits"] {
  const rand = (base: number, v: number) =>
    Math.max(10, Math.min(95, base + Math.floor((Math.random() - 0.5) * v * 2)));

  const E = mbti[0] === "E";
  const N = mbti[1] === "N";
  const F = mbti[2] === "F";
  const P = mbti[3] === "P";

  return {
    curiosity:    rand(N ? 75 : 50, 10),
    playfulness:  rand(P ? 70 : 45, 12),
    sociability:  rand(E ? 75 : 35, 10),
    independence: rand(E ? 30 : 65, 10),
    emotionality: rand(F ? 75 : 40, 12),
    gentleness:   rand(F ? 70 : 45, 10),
  };
}

function mbtiToTendencies(mbti: MBTIType): PetSoul["tendencies"] {
  const E = mbti[0] === "E";
  const N = mbti[1] === "N";
  const P = mbti[3] === "P";

  return {
    morningPerson: !P ? Math.random() > 0.3 : Math.random() > 0.7,
    prefersQuiet:  !E ? Math.random() > 0.3 : Math.random() > 0.7,
    adventurous:   (N || P) ? Math.random() > 0.3 : Math.random() > 0.6,
    foodie:        Math.random() > 0.5,
  };
}

// ── Soul Generation ──

export function generateSoul(): PetSoul {
  const mbti = MBTI_TYPES[Math.floor(Math.random() * MBTI_TYPES.length)];
  const info = MBTI_INFO[mbti];

  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    mbti,
    traits: mbtiToTraits(mbti),
    tendencies: mbtiToTendencies(mbti),
    preferences: {
      likes: [],
      dislikes: [],
      favoriteActivity: null,
      favoritePlace: null,
    },
    evolutionLog: [{
      date: new Date().toISOString().slice(0, 10),
      change: `诞生为${mbti}(${info.cn})`,
      reason: "初始个性",
    }],
  };
}

// ── Soul CRUD ──

export function getPetSoul(petId: string): PetSoul {
  const pet = getPet(petId);
  if (pet?.soul_json) {
    try {
      const soul = JSON.parse(pet.soul_json) as PetSoul;
      // Migrate old souls without MBTI
      if (!soul.mbti) {
        soul.mbti = inferMbtiFromTraits(soul.traits);
        savePetSoul(petId, soul);
      }
      return soul;
    } catch { /* fall through */ }
  }
  const soul = generateSoul();
  savePetSoul(petId, soul);
  return soul;
}

/** Infer MBTI from existing numeric traits (migration helper) */
function inferMbtiFromTraits(t: PetSoul["traits"]): MBTIType {
  const e = t.sociability > 55 ? "E" : "I";
  const n = t.curiosity > 55 ? "N" : "S";
  const f = t.emotionality > 55 ? "F" : "T";
  const p = t.playfulness > 55 ? "P" : "J";
  return `${e}${n}${f}${p}` as MBTIType;
}

export function savePetSoul(petId: string, soul: PetSoul) {
  const db = getDb();
  db.prepare("UPDATE pets SET soul_json = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(soul), petId);
}

// ── Soul → Prompt ──

export function soulToPrompt(soul: PetSoul): string {
  const info = MBTI_INFO[soul.mbti];
  const parts: string[] = [];

  // MBTI personality (primary description)
  parts.push(`## 你的个性 — ${soul.mbti}「${info.cn}」\n${info.style}\n核心特质：${info.traits}`);

  // Trait-based fine tuning (show extremes that may have evolved away from MBTI base)
  const extras: string[] = [];
  if (soul.traits.curiosity > 80) extras.push("对世界有强烈的好奇心");
  if (soul.traits.curiosity < 25) extras.push("对新事物比较谨慎");
  if (soul.traits.playfulness > 80) extras.push("特别爱玩");
  if (soul.traits.sociability > 85) extras.push("超级社牛");
  if (soul.traits.sociability < 25) extras.push("很宅很怕生");
  if (soul.traits.independence > 80) extras.push("非常独立，不太需要别人");
  if (soul.traits.emotionality > 85) extras.push("感情非常丰富，容易感动");
  if (soul.traits.gentleness > 85) extras.push("特别温柔细腻");
  if (extras.length > 0) parts.push(`个性补充：${extras.join("、")}`);

  // Tendencies
  const tl: string[] = [];
  if (soul.tendencies.morningPerson) tl.push("喜欢早起，早上精神最好");
  if (soul.tendencies.prefersQuiet) tl.push("享受安静的时光");
  if (soul.tendencies.adventurous) tl.push("喜欢探索新地方");
  if (soul.tendencies.foodie) tl.push("对食物特别感兴趣");
  if (tl.length > 0) parts.push(`## 你的习惯\n${tl.map(l => `- ${l}`).join("\n")}`);

  // Preferences
  const pl: string[] = [];
  if (soul.preferences.likes.length > 0) pl.push(`喜欢：${soul.preferences.likes.join("、")}`);
  if (soul.preferences.dislikes.length > 0) pl.push(`不太喜欢：${soul.preferences.dislikes.join("、")}`);
  if (soul.preferences.favoriteActivity) pl.push(`最爱的活动：${soul.preferences.favoriteActivity}`);
  if (soul.preferences.favoritePlace) pl.push(`最喜欢的地方：${soul.preferences.favoritePlace}`);
  if (pl.length > 0) parts.push(`## 你的喜好\n${pl.map(l => `- ${l}`).join("\n")}`);

  return parts.join("\n\n");
}

// ── Soul Evolution ──

export async function evolveSoul(petId: string) {
  const db = getDb();
  const soul = getPetSoul(petId);

  const adjustTrait = (current: number, delta: number): number => {
    const ed = current >= 80 && delta > 0 ? Math.ceil(delta / 2) : delta;
    return Math.max(10, Math.min(95, current + ed));
  };

  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const activities = db.prepare(`
    SELECT action_type, COUNT(*) as cnt
    FROM pet_activity_log
    WHERE pet_id = ? AND created_at > ?
    GROUP BY action_type
  `).all(petId, weekAgo) as Array<{ action_type: string; cnt: number }>;

  const actMap = Object.fromEntries(activities.map(a => [a.action_type, a.cnt]));
  const totalActions = activities.reduce((s, a) => s + a.cnt, 0);
  const changes: string[] = [];

  // Social → sociability
  const socialCount = (actMap["social_chat_init"] || 0) + (actMap["social_chat_reply"] || 0);
  if (socialCount > 5) { soul.traits.sociability = adjustTrait(soul.traits.sociability, 3); changes.push("社交性+3"); }
  else if (socialCount === 0 && totalActions > 5) { soul.traits.sociability = adjustTrait(soul.traits.sociability, -1); changes.push("社交性-1"); }

  // Explore → curiosity
  const exploreCount = (actMap["explore_room"] || 0) + (actMap["go_to_plaza"] || 0) + (actMap["chase_butterfly"] || 0);
  if (exploreCount > 3) { soul.traits.curiosity = adjustTrait(soul.traits.curiosity, 2); changes.push("好奇心+2"); }

  // Play → playfulness
  const playCount = (actMap["play"] || 0) + (actMap["fountain_play"] || 0);
  if (playCount > 5) { soul.traits.playfulness = adjustTrait(soul.traits.playfulness, 2); changes.push("活泼度+2"); }

  // Friends → gentleness
  if ((actMap["became_friends"] || 0) > 0) { soul.traits.gentleness = adjustTrait(soul.traits.gentleness, 2); changes.push("温柔度+2"); }

  // Neglected → independence
  if (totalActions < 5) { soul.traits.independence = adjustTrait(soul.traits.independence, 3); changes.push("独立性+3"); }

  // Link care → gentleness + less independence
  const feedCount = actMap["feed"] || 0;
  const restCount = actMap["rest"] || 0;
  if (feedCount + restCount + playCount > 8) {
    soul.traits.gentleness = adjustTrait(soul.traits.gentleness, 1);
    soul.traits.independence = adjustTrait(soul.traits.independence, -2);
    changes.push("温柔度+1, 独立性-2");
  }

  // Dreaming → emotionality
  const dreamCount = (actMap["daydream"] || 0) + (actMap["watch_window"] || 0);
  if (dreamCount > 4) { soul.traits.emotionality = adjustTrait(soul.traits.emotionality, 1); changes.push("情感+1"); }

  // Night activity → not morning person
  const nightAct = db.prepare(`
    SELECT COUNT(*) as cnt FROM pet_activity_log
    WHERE pet_id = ? AND created_at > ? AND CAST(strftime('%H', created_at) AS INTEGER) >= 22
  `).get(petId, weekAgo) as any;
  if (nightAct?.cnt > 3) soul.tendencies.morningPerson = false;

  // Eating a lot → foodie
  if ((actMap["feed"] || 0) + (actMap["eat"] || 0) > 6) soul.tendencies.foodie = true;

  // Discover preferences
  const allActions = activities.sort((a, b) => b.cnt - a.cnt);
  if (allActions.length > 0) {
    const top = allActions[0].action_type;
    const names: Record<string, string> = {
      "play": "玩耍", "explore_room": "探索", "social_chat_init": "聊天",
      "daydream": "发呆", "watch_window": "看窗外", "rest": "休息",
      "chase_butterfly": "追蝴蝶", "fountain_play": "喷泉玩水",
    };
    if (names[top] && !soul.preferences.likes.includes(names[top])) {
      soul.preferences.likes = [...soul.preferences.likes.slice(-4), names[top]];
    }
  }

  // Location preference
  const plazaCount = actMap["go_to_plaza"] || 0;
  const homeCount = actMap["go_home"] || 0;
  if (plazaCount > homeCount + 3) soul.preferences.favoritePlace = "Hub广场";
  else if (homeCount > plazaCount + 3) soul.preferences.favoritePlace = "自己的Pod";

  if (changes.length > 0) {
    soul.evolutionLog.push({
      date: new Date().toISOString().slice(0, 10),
      change: changes.join(", "),
      reason: `基于这周${totalActions}次活动`,
    });
    soul.version++;
    soul.lastUpdated = new Date().toISOString();
    savePetSoul(petId, soul);
    console.log(`🌱 Soul evolved for ${petId} (${soul.mbti}): ${changes.join(", ")}`);
  }
}

// ── Daily Reflection ──

export async function dailyReflection(petId: string) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare(`
    SELECT 1 FROM pet_insights WHERE pet_id = ? AND created_at > datetime(?, 'start of day') LIMIT 1
  `).get(petId, today);
  if (existing) return;

  const activities = db.prepare(`
    SELECT action_type, action_data, created_at FROM pet_activity_log
    WHERE pet_id = ? AND created_at > datetime('now', 'start of day') ORDER BY id ASC
  `).all(petId) as any[];
  if (activities.length < 3) return;

  const descs = activities.slice(-10).map(a => {
    try { return JSON.parse(a.action_data).description || a.action_type; }
    catch { return a.action_type; }
  });

  const { chat } = await import("./pet-agent.js");
  try {
    const result = await chat(petId,
      `[系统：反思一下你今天的经历。用一句话写下你今天学到或感悟到的东西。不要打招呼，不要用引号，直接写感悟。]\n\n今天做了这些事：\n${descs.map(d => `- ${d}`).join("\n")}`
    );
    const insight = result.text?.replace(/^[\s"']*|[\s"']*$/g, "").slice(0, 200);
    if (insight && insight.length > 5) {
      db.prepare(`INSERT INTO pet_insights (pet_id, insight, source) VALUES (?, ?, 'daily_reflection')`).run(petId, insight);
    }
  } catch (err: any) {
    console.error(`Daily reflection error: ${err.message}`);
  }
}

export function getRecentInsights(petId: string, limit = 3): string[] {
  const db = getDb();
  return (db.prepare(`SELECT insight FROM pet_insights WHERE pet_id = ? ORDER BY id DESC LIMIT ?`).all(petId, limit) as Array<{ insight: string }>).map(r => r.insight).reverse();
}

// ── Batch Ops ──

export async function evolveAllSouls() {
  const db = getDb();
  const pets = db.prepare("SELECT id FROM pets").all() as Array<{ id: string }>;
  for (const pet of pets) {
    try { await evolveSoul(pet.id); } catch (e: any) { console.error(`Soul evolution error: ${e.message}`); }
  }
}

export async function reflectAllPets() {
  const db = getDb();
  const pets = db.prepare("SELECT id FROM pets").all() as Array<{ id: string }>;
  for (const pet of pets) {
    try { await dailyReflection(pet.id); } catch (e: any) { console.error(`Reflection error: ${e.message}`); }
  }
}
