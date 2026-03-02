/**
 * Emergence Engine — 涌现检测与文化形成
 *
 * 规则检测条件，LLM生成内容。
 * 三个检测器：
 * 1. 公会形成检测（频繁互动群体 → LLM提议成立公会）
 * 2. 文化涌现检测（共享记忆 → 传统/传说）
 * 3. 经济趋势检测（贫富差距 → 世界事件）
 */

import { getDb, getPet } from "./db.js";
import { think } from "./llm-scheduler.js";
import { safetyFilter } from "./safety-guard.js";
import { createLocationEvent } from "./locations.js";
import { listGuilds, createGuild } from "./guilds.js";
import { broadcastWorldEvent } from "./world-events.js";

// ── Schema ──

export function initEmergenceSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS cultural_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      memory_type TEXT NOT NULL DEFAULT 'event',
      importance INTEGER DEFAULT 5,
      participant_pet_ids TEXT DEFAULT '[]',
      location_id TEXT,
      created_by_pet_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cm_type ON cultural_memories(memory_type);

    CREATE TABLE IF NOT EXISTS world_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      era TEXT DEFAULT 'founding',
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      impact TEXT DEFAULT '{}',
      participant_pet_ids TEXT DEFAULT '[]',
      location_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_wh_era ON world_history(era);
    CREATE INDEX IF NOT EXISTS idx_wh_type ON world_history(event_type);

    CREATE TABLE IF NOT EXISTS emergence_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      detector TEXT NOT NULL,
      trigger_data TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log("🌟 Emergence schema initialized");
}

// ── Types ──

export interface CulturalMemory {
  id: number;
  title: string;
  description: string;
  memory_type: string;
  importance: number;
  participant_pet_ids: string;
  location_id: string | null;
  created_by_pet_id: string | null;
  created_at: string;
}

export interface WorldEvent {
  id: number;
  era: string;
  event_type: string;
  title: string;
  description: string;
  impact: string;
  participant_pet_ids: string;
  location_id: string | null;
  created_at: string;
}

// ── Guild Formation Detection ──

/** Find pet groups that interact frequently but don't have a guild yet */
export async function detectGuildFormation(): Promise<{ detected: boolean; proposal?: string }> {
  const db = getDb();

  // Find frequent interaction pairs in last 7 days
  const pairs = db.prepare(`
    SELECT from_pet_id, to_pet_id, COUNT(*) as cnt
    FROM pet_messages
    WHERE channel = 'direct' AND created_at > datetime('now', '-7 days')
    GROUP BY MIN(from_pet_id, to_pet_id), MAX(from_pet_id, to_pet_id)
    HAVING cnt >= 5
  `).all() as Array<{ from_pet_id: string; to_pet_id: string; cnt: number }>;

  if (pairs.length < 2) return { detected: false };

  // Simple clustering: find connected components of 3+
  const adjacency = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (!adjacency.has(p.from_pet_id)) adjacency.set(p.from_pet_id, new Set());
    if (!adjacency.has(p.to_pet_id)) adjacency.set(p.to_pet_id, new Set());
    adjacency.get(p.from_pet_id)!.add(p.to_pet_id);
    adjacency.get(p.to_pet_id)!.add(p.from_pet_id);
  }

  // BFS for clusters
  const visited = new Set<string>();
  const clusters: string[][] = [];
  for (const node of adjacency.keys()) {
    if (visited.has(node)) continue;
    const cluster: string[] = [];
    const queue = [node];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);
      cluster.push(curr);
      for (const neighbor of adjacency.get(curr) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    if (cluster.length >= 3) clusters.push(cluster);
  }

  if (clusters.length === 0) return { detected: false };

  // Check which clusters don't already have guilds
  const existingGuilds = listGuilds();
  const guildMembers = new Set<string>();
  for (const g of existingGuilds) {
    // Get members
    const members = db.prepare("SELECT pet_id FROM guild_members WHERE guild_id = ?").all(g.id) as Array<{ pet_id: string }>;
    for (const m of members) guildMembers.add(m.pet_id);
  }

  for (const cluster of clusters) {
    const unguilded = cluster.filter(id => !guildMembers.has(id));
    if (unguilded.length < 3) continue;

    // Found a group! Let the most social one propose a guild
    const leader = unguilded[0];
    const leaderPet = getPet(leader);
    const otherNames = unguilded.slice(1).map(id => getPet(id)?.name || "某个Pix").join("、");

    const result = await think({
      petId: leader,
      context: `你经常和${otherNames}一起玩。你们已经是很好的朋友了。你想提议成立一个小团体吗？如果要的话，想一个名字。\n回复格式: [公会名] 名字\n或者: [不想] 原因`,
      priority: "high" as any,
    });

    const proposal = safetyFilter(result.text, leader);

    // Log emergence
    db.prepare(`
      INSERT INTO emergence_log (detector, trigger_data, result)
      VALUES ('guild_formation', ?, ?)
    `).run(JSON.stringify({ cluster: unguilded, interactions: pairs.length }), proposal);

    // Parse and create guild if proposed
    const guildMatch = proposal.match(/\[公会名\]\s*(.+)/);
    if (guildMatch) {
      const guildName = guildMatch[1].trim().slice(0, 30);
      const guildResult = createGuild(guildName, `${leaderPet?.name || "某Pix"}和朋友们自发成立`, leader);
      if (guildResult.ok) {
        // Others join
        for (const memberId of unguilded.slice(1)) {
          db.prepare("INSERT OR IGNORE INTO guild_members (guild_id, pet_id) VALUES (?, ?)").run(guildResult.guild!.id, memberId);
        }
        db.prepare("UPDATE guilds SET member_count = ? WHERE id = ?").run(unguilded.length, guildResult.guild!.id);

        // Record world history
        recordWorldEvent("guild_formed", guildName, `${leaderPet?.name}提议成立了"${guildName}"`, unguilded);
      }
    }

    return { detected: true, proposal };
  }

  return { detected: false };
}

// ── Cultural Pattern Detection ──

/** Detect shared memories/topics that become cultural traditions */
export async function detectCulturalPatterns(): Promise<{ detected: boolean; memories: CulturalMemory[] }> {
  const db = getDb();
  const newMemories: CulturalMemory[] = [];

  // Check if pet_social_memory table exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='pet_social_memory'"
  ).get();
  if (!tableExists) return { detected: false, memories: [] };

  // Find topics mentioned by 3+ different pets in last 14 days
  const sharedTopics = db.prepare(`
    SELECT memory_text, COUNT(DISTINCT pet_id) as pet_count,
           GROUP_CONCAT(DISTINCT pet_id) as pet_ids
    FROM pet_social_memory
    WHERE created_at > datetime('now', '-14 days')
    AND length(memory_text) > 10
    GROUP BY substr(memory_text, 1, 50)
    HAVING pet_count >= 2
    ORDER BY pet_count DESC
    LIMIT 5
  `).all() as Array<{ memory_text: string; pet_count: number; pet_ids: string }>;

  for (const topic of sharedTopics) {
    // Check if we already have a cultural memory for this
    const existing = db.prepare(
      "SELECT id FROM cultural_memories WHERE title LIKE ? AND created_at > datetime('now', '-7 days')"
    ).get(`%${topic.memory_text.slice(0, 30)}%`);
    if (existing) continue;

    const petIds = topic.pet_ids.split(",");
    const narrator = petIds[0];
    const narratorPet = getPet(narrator);

    // LLM narrates the shared memory
    const result = await think({
      petId: narrator,
      context: `很多Pix都记得这件事: "${topic.memory_text.slice(0, 100)}"\n用一两句话描述这个大家共同的记忆，像讲一个小故事一样。`,
      priority: "medium" as any,
    });

    const narrative = safetyFilter(result.text, narrator);
    const title = topic.memory_text.slice(0, 50);

    db.prepare(`
      INSERT INTO cultural_memories (title, description, memory_type, importance, participant_pet_ids, created_by_pet_id)
      VALUES (?, ?, 'shared_memory', ?, ?, ?)
    `).run(title, narrative, Math.min(10, topic.pet_count * 2), JSON.stringify(petIds), narrator);

    const mem = db.prepare("SELECT * FROM cultural_memories ORDER BY id DESC LIMIT 1").get() as CulturalMemory;
    newMemories.push(mem);

    // Log
    db.prepare(`
      INSERT INTO emergence_log (detector, trigger_data, result)
      VALUES ('cultural_pattern', ?, ?)
    `).run(JSON.stringify({ topic: title, pet_count: topic.pet_count }), narrative);

    // Record world history
    recordWorldEvent("cultural_memory", title, `${narratorPet?.name || "某Pix"}讲述了一个大家共同的记忆`, petIds);
  }

  return { detected: newMemories.length > 0, memories: newMemories };
}

// ── Economic Trend Detection ──

/** Calculate Gini coefficient for wealth inequality */
export function calculateGini(): number {
  const db = getDb();
  const wallets = db.prepare("SELECT balance FROM pet_wallets ORDER BY balance ASC").all() as Array<{ balance: number }>;
  if (wallets.length < 2) return 0;

  const n = wallets.length;
  let sumDiff = 0;
  let sumBalance = 0;
  for (let i = 0; i < n; i++) {
    sumBalance += wallets[i].balance;
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(wallets[i].balance - wallets[j].balance);
    }
  }
  if (sumBalance === 0) return 0;
  return sumDiff / (2 * n * sumBalance);
}

/** Detect economic trends and trigger events */
export async function detectEconomicTrends(): Promise<{ gini: number; event?: string }> {
  const db = getDb();
  const gini = calculateGini();

  // Check if already triggered today
  const todayEvent = db.prepare(
    "SELECT id FROM world_history WHERE event_type = 'economy' AND date(created_at) = date('now')"
  ).get();
  if (todayEvent) return { gini };

  if (gini > 0.6) {
    createLocationEvent("market", "economy", "集市大减价",
      "有Pix注意到大家的贫富差距越来越大，集市开始降价促销！");
    recordWorldEvent("economy", "贫富分化", `基尼系数达到${gini.toFixed(2)}，集市开始促销`, []);
    return { gini, event: "market_sale" };
  }

  if (gini < 0.15) {
    createLocationEvent("hub", "economy", "繁荣时代",
      "大家的生活水平很接近，PixelVerse进入了繁荣时代！");
    recordWorldEvent("economy", "繁荣时代", `基尼系数仅${gini.toFixed(2)}，社会和谐`, []);
    return { gini, event: "prosperity" };
  }

  return { gini };
}

// ── World History ──

export function recordWorldEvent(
  eventType: string,
  title: string,
  description: string,
  participantPetIds: string[],
  locationId?: string
) {
  const db = getDb();
  const era = determineEra();
  db.prepare(`
    INSERT INTO world_history (era, event_type, title, description, participant_pet_ids, location_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(era, eventType, title, description, JSON.stringify(participantPetIds), locationId || null);
  broadcastWorldEvent("world_history", { era, eventType, title, description });
}

function determineEra(): string {
  const db = getDb();
  const petCount = (db.prepare("SELECT COUNT(*) as cnt FROM pets").get() as any).cnt;
  const guildCount = (db.prepare("SELECT COUNT(*) as cnt FROM guilds").get() as any).cnt;
  const eventCount = (db.prepare("SELECT COUNT(*) as cnt FROM world_history").get() as any).cnt;

  if (eventCount < 5) return "founding";
  if (guildCount === 0) return "early";
  if (petCount < 20) return "growth";
  return "flourishing";
}

/** Get world history timeline */
export function getWorldHistory(limit: number = 50): WorldEvent[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM world_history ORDER BY created_at DESC LIMIT ?"
  ).all(limit) as WorldEvent[];
}

/** Get cultural memories */
export function getCulturalMemories(limit: number = 20): CulturalMemory[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM cultural_memories ORDER BY importance DESC, created_at DESC LIMIT ?"
  ).all(limit) as CulturalMemory[];
}

/** Get emergence stats */
export function getEmergenceStats(): {
  culturalMemories: number;
  worldEvents: number;
  currentEra: string;
  gini: number;
} {
  const db = getDb();
  const cmCount = (db.prepare("SELECT COUNT(*) as cnt FROM cultural_memories").get() as any).cnt;
  const whCount = (db.prepare("SELECT COUNT(*) as cnt FROM world_history").get() as any).cnt;
  return {
    culturalMemories: cmCount,
    worldEvents: whCount,
    currentEra: determineEra(),
    gini: calculateGini(),
  };
}

// ── Emergence Tick (run periodically) ──

let emergenceTimer: ReturnType<typeof setInterval> | null = null;

export function startEmergenceEngine(intervalMs: number = 300_000) {
  if (emergenceTimer) return;
  console.log(`🌟 Emergence engine started (${intervalMs / 1000}s interval)`);

  emergenceTimer = setInterval(async () => {
    try {
      await detectGuildFormation();
      await detectCulturalPatterns();
      await detectEconomicTrends();
    } catch (err) {
      console.error("🌟 Emergence tick error:", err);
    }
  }, intervalMs);
}

export function stopEmergenceEngine() {
  if (emergenceTimer) {
    clearInterval(emergenceTimer);
    emergenceTimer = null;
    console.log("🌟 Emergence engine stopped");
  }
}
