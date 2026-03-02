/**
 * Language Evolution — PixelVerse词汇演化系统
 *
 * Pet们在对话中自发创造新词汇/表达
 * 词汇通过使用频率传播，最终成为PixelVerse的"方言"
 *
 * 流程：
 * 1. 检测对话中的新词（LLM标记不寻常表达）
 * 2. 追踪使用频率（多少Pet用过）
 * 3. 词汇传播（被3+Pet使用 → 成为流行语）
 * 4. 文化沉淀（流行语 → 文化记忆）
 */

import { getDb, getPet } from "./db.js";
import { think } from "./llm-scheduler.js";
import { safetyFilter } from "./safety-guard.js";
import { recordWorldEvent } from "./emergence.js";

// ── Schema ──

export function initLanguageSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS evolved_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL UNIQUE,
      meaning TEXT NOT NULL,
      origin_pet_id TEXT NOT NULL,
      origin_context TEXT,
      status TEXT DEFAULT 'new',
      use_count INTEGER DEFAULT 1,
      unique_users INTEGER DEFAULT 1,
      user_pet_ids TEXT DEFAULT '[]',
      first_used_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_et_status ON evolved_terms(status);
    CREATE INDEX IF NOT EXISTS idx_et_term ON evolved_terms(term);
  `);
  console.log("📝 Language schema initialized");
}

// ── Types ──

export interface EvolvedTerm {
  id: number;
  term: string;
  meaning: string;
  origin_pet_id: string;
  origin_context: string | null;
  status: string; // 'new' | 'spreading' | 'popular' | 'cultural'
  use_count: number;
  unique_users: number;
  user_pet_ids: string;
  first_used_at: string;
  last_used_at: string;
}

// ── Core Functions ──

/** Detect new terms from a conversation */
export async function detectNewTerms(
  petId: string,
  text: string
): Promise<{ detected: boolean; terms: string[] }> {
  const db = getDb();
  const pet = getPet(petId);
  const petName = pet?.name || "某Pix";

  // Check if text has anything interesting (skip very short)
  if (text.length < 10) return { detected: false, terms: [] };

  // Check for existing evolved terms used in this text
  const existingTerms = db.prepare("SELECT term, id FROM evolved_terms").all() as Array<{ term: string; id: number }>;
  for (const et of existingTerms) {
    if (text.includes(et.term)) {
      recordTermUsage(et.term, petId);
    }
  }

  // Only detect new terms occasionally (1 in 5 conversations)
  if (Math.random() > 0.2) return { detected: false, terms: [] };

  // Ask LLM to identify any creative/unusual expressions
  const result = await think({
    petId,
    context: `${petName}刚才说了: "${text.slice(0, 150)}"\n\n这句话里有没有什么有趣的、创造性的新表达或新词？如果有，列出来。\n回复格式:\n[新词] 词语 = 意思\n如果没有特别的新词，回复: [无]`,
    priority: "low" as any,
  });

  const response = safetyFilter(result.text, petId);
  const newTerms: string[] = [];

  // Parse [新词] responses
  const matches = response.matchAll(/\[新词\]\s*(.+?)\s*=\s*(.+)/g);
  for (const match of matches) {
    const term = match[1].trim().slice(0, 20);
    const meaning = match[2].trim().slice(0, 100);

    if (term.length < 2 || term.length > 20) continue;

    // Check if already exists
    const existing = db.prepare("SELECT id FROM evolved_terms WHERE term = ?").get(term);
    if (existing) {
      recordTermUsage(term, petId);
      continue;
    }

    // New term discovered!
    db.prepare(`
      INSERT INTO evolved_terms (term, meaning, origin_pet_id, origin_context, user_pet_ids)
      VALUES (?, ?, ?, ?, ?)
    `).run(term, meaning, petId, text.slice(0, 200), JSON.stringify([petId]));

    newTerms.push(term);
    console.log(`📝 New term: "${term}" = ${meaning} (by ${petName})`);
  }

  return { detected: newTerms.length > 0, terms: newTerms };
}

/** Record that a pet used an existing term */
function recordTermUsage(term: string, petId: string) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM evolved_terms WHERE term = ?").get(term) as EvolvedTerm | undefined;
  if (!existing) return;

  const users: string[] = JSON.parse(existing.user_pet_ids || "[]");
  const isNewUser = !users.includes(petId);

  if (isNewUser) {
    users.push(petId);
  }

  db.prepare(`
    UPDATE evolved_terms
    SET use_count = use_count + 1,
        unique_users = ?,
        user_pet_ids = ?,
        last_used_at = datetime('now'),
        status = CASE
          WHEN ? >= 5 THEN 'cultural'
          WHEN ? >= 3 THEN 'popular'
          WHEN ? >= 2 THEN 'spreading'
          ELSE status
        END
    WHERE term = ?
  `).run(users.length, JSON.stringify(users), users.length, users.length, users.length, term);

  // If just became popular, record world event
  if (isNewUser && users.length === 3 && existing.unique_users < 3) {
    const originPet = getPet(existing.origin_pet_id);
    recordWorldEvent(
      "language",
      `新流行语: "${term}"`,
      `${originPet?.name || "某Pix"}发明的"${term}"（意思是${existing.meaning}）开始在PixelVerse流行`,
      users
    );
    console.log(`📝 Term "${term}" is now POPULAR! Used by ${users.length} pets`);
  }
}

/** Get all evolved terms */
export function getEvolvedTerms(status?: string): EvolvedTerm[] {
  const db = getDb();
  if (status) {
    return db.prepare("SELECT * FROM evolved_terms WHERE status = ? ORDER BY use_count DESC").all(status) as EvolvedTerm[];
  }
  return db.prepare("SELECT * FROM evolved_terms ORDER BY use_count DESC").all() as EvolvedTerm[];
}

/** Get popular terms for LLM prompt injection */
export function getPopularTermsForPrompt(): string {
  const db = getDb();
  const popular = db.prepare(
    "SELECT term, meaning FROM evolved_terms WHERE status IN ('popular', 'cultural') ORDER BY use_count DESC LIMIT 10"
  ).all() as Array<{ term: string; meaning: string }>;

  if (popular.length === 0) return "";

  return `\nPixelVerse流行语：${popular.map(t => `"${t.term}"(${t.meaning})`).join("、")}。你可以自然地使用这些词。`;
}

/** Get language stats */
export function getLanguageStats(): {
  totalTerms: number;
  newTerms: number;
  spreadingTerms: number;
  popularTerms: number;
  culturalTerms: number;
} {
  const db = getDb();
  const all = (db.prepare("SELECT COUNT(*) as cnt FROM evolved_terms").get() as any).cnt;
  const byStatus = db.prepare(
    "SELECT status, COUNT(*) as cnt FROM evolved_terms GROUP BY status"
  ).all() as Array<{ status: string; cnt: number }>;

  const statusMap: Record<string, number> = {};
  for (const s of byStatus) statusMap[s.status] = s.cnt;

  return {
    totalTerms: all,
    newTerms: statusMap["new"] || 0,
    spreadingTerms: statusMap["spreading"] || 0,
    popularTerms: statusMap["popular"] || 0,
    culturalTerms: statusMap["cultural"] || 0,
  };
}
