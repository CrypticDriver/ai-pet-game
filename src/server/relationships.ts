/**
 * Relationship System — Pet社交关系管理
 *
 * 关系类型：acquaintance → friend → close_friend / rival
 * 每次互动影响好感度和信任度
 * 关系类型由LLM评估，不是硬规则
 */

import { getDb, getPet } from "./db.js";

// ── Schema ──

export function initRelationshipSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id TEXT NOT NULL,
      target_pet_id TEXT NOT NULL,
      type TEXT DEFAULT 'acquaintance',
      affinity INTEGER DEFAULT 50,
      trust INTEGER DEFAULT 50,
      interaction_count INTEGER DEFAULT 0,
      last_interaction_at TEXT,
      shared_memories TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(pet_id, target_pet_id)
    );
    CREATE INDEX IF NOT EXISTS idx_rel_pet ON relationships(pet_id);
    CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_pet_id);
  `);
  console.log("💕 Relationship schema initialized");
}

// ── Types ──

export interface Relationship {
  id: number;
  pet_id: string;
  target_pet_id: string;
  type: string;
  affinity: number;
  trust: number;
  interaction_count: number;
  last_interaction_at: string | null;
  shared_memories: string;
  notes: string;
  created_at: string;
}

// ── Core Functions ──

/** Get or create a relationship between two pets */
export function getOrCreateRelationship(petId: string, targetPetId: string): Relationship {
  const db = getDb();
  let rel = db.prepare(
    "SELECT * FROM relationships WHERE pet_id = ? AND target_pet_id = ?"
  ).get(petId, targetPetId) as Relationship | undefined;

  if (!rel) {
    db.prepare(`
      INSERT INTO relationships (pet_id, target_pet_id) VALUES (?, ?)
    `).run(petId, targetPetId);
    rel = db.prepare(
      "SELECT * FROM relationships WHERE pet_id = ? AND target_pet_id = ?"
    ).get(petId, targetPetId) as Relationship;
  }
  return rel;
}

/** Record an interaction and update affinity/trust */
export function recordInteraction(
  petId: string,
  targetPetId: string,
  sentiment: "positive" | "neutral" | "negative",
  context?: string
): { relationship: Relationship; changed: boolean } {
  const db = getDb();
  const rel = getOrCreateRelationship(petId, targetPetId);

  // Sentiment affects affinity
  let affinityDelta = 0;
  let trustDelta = 0;

  switch (sentiment) {
    case "positive":
      affinityDelta = Math.max(1, Math.floor(8 * (1 - rel.affinity / 120))); // diminishing returns
      trustDelta = Math.max(1, Math.floor(3 * (1 - rel.trust / 120)));
      break;
    case "neutral":
      affinityDelta = 1;
      trustDelta = 0;
      break;
    case "negative":
      affinityDelta = -Math.max(2, Math.floor(5 * (rel.affinity / 100)));
      trustDelta = -Math.max(3, Math.floor(8 * (rel.trust / 100)));
      break;
  }

  const newAffinity = Math.max(0, Math.min(100, rel.affinity + affinityDelta));
  const newTrust = Math.max(0, Math.min(100, rel.trust + trustDelta));

  // Update type based on affinity + interaction count
  const newCount = rel.interaction_count + 1;
  const newType = classifyRelationship(newAffinity, newTrust, newCount, rel.type);

  db.prepare(`
    UPDATE relationships
    SET affinity = ?, trust = ?, interaction_count = ?,
        type = ?, last_interaction_at = datetime('now')
    WHERE pet_id = ? AND target_pet_id = ?
  `).run(newAffinity, newTrust, newCount, newType, petId, targetPetId);

  const updated = getOrCreateRelationship(petId, targetPetId);
  return { relationship: updated, changed: newType !== rel.type };
}

/** Classify relationship type (soft rules, not gates) */
function classifyRelationship(
  affinity: number,
  trust: number,
  interactions: number,
  currentType: string
): string {
  // Rival: low affinity + multiple negative interactions
  if (affinity < 25 && interactions >= 3) return "rival";

  // Close friend: high affinity + high trust + enough interactions
  if (affinity >= 80 && trust >= 70 && interactions >= 10) return "close_friend";

  // Friend: decent affinity + some trust + enough interactions
  if (affinity >= 60 && trust >= 45 && interactions >= 5) return "friend";

  // Acquaintance: default
  return currentType === "rival" && affinity >= 40 ? "acquaintance" : currentType === "acquaintance" ? "acquaintance" : currentType;
}

/** Get all relationships for a pet */
export function getRelationships(petId: string): Array<Relationship & { target_name: string }> {
  const db = getDb();
  const rels = db.prepare(
    "SELECT * FROM relationships WHERE pet_id = ? ORDER BY affinity DESC"
  ).all(petId) as Relationship[];

  return rels.map(r => {
    const target = getPet(r.target_pet_id);
    return { ...r, target_name: target?.name || "未知" };
  });
}

/** Get relationship between two specific pets */
export function getRelationshipWith(petId: string, targetPetId: string): Relationship | null {
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM relationships WHERE pet_id = ? AND target_pet_id = ?"
  ).get(petId, targetPetId) as Relationship) || null;
}

/** Get a pet's closest friends (by affinity) */
export function getClosestFriends(petId: string, limit: number = 5): Array<Relationship & { target_name: string }> {
  const db = getDb();
  const rels = db.prepare(
    "SELECT * FROM relationships WHERE pet_id = ? AND type IN ('friend', 'close_friend') ORDER BY affinity DESC LIMIT ?"
  ).all(petId, limit) as Relationship[];

  return rels.map(r => {
    const target = getPet(r.target_pet_id);
    return { ...r, target_name: target?.name || "未知" };
  });
}

/** Build relationship context for LLM prompt */
export function relationshipsToPrompt(petId: string): string {
  const rels = getRelationships(petId);
  if (rels.length === 0) return "你还没有认识任何Pix。";

  const lines = rels.map(r => {
    const typeLabel: Record<string, string> = {
      acquaintance: "认识",
      friend: "朋友",
      close_friend: "好朋友",
      rival: "有点不对付",
    };
    const label = typeLabel[r.type] || r.type;
    const affDesc = r.affinity >= 80 ? "很喜欢" : r.affinity >= 60 ? "挺好的" : r.affinity >= 40 ? "还行" : "不太喜欢";
    return `- ${r.target_name}（${label}，感觉${affDesc}，聊过${r.interaction_count}次）`;
  });

  return `你认识的Pix：\n${lines.join("\n")}`;
}
