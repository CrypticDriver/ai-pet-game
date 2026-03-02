/**
 * Language Evolution — PixelVerse词汇演化系统
 *
 * Pet们在对话中自发创造新词汇/表达
 * 检测用正则（可靠、无LLM冲突），传播用频率
 */

import { getDb, getPet } from "./db.js";
import { recordWorldEvent } from "./emergence.js";
import { broadcastWorldEvent } from "./world-events.js";

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
  status: string;
  use_count: number;
  unique_users: number;
  user_pet_ids: string;
  first_used_at: string;
  last_used_at: string;
}

// ── Core Functions ──

/** Detect new terms from conversation text (regex-based, no LLM) */
export async function detectNewTerms(
  petId: string,
  text: string
): Promise<{ detected: boolean; terms: string[] }> {
  const db = getDb();
  const pet = getPet(petId);
  const petName = pet?.name || "某Pix";

  if (text.length < 8) return { detected: false, terms: [] };

  // Track existing term usage
  const existingTerms = db.prepare("SELECT term FROM evolved_terms").all() as Array<{ term: string }>;
  for (const et of existingTerms) {
    if (text.includes(et.term)) {
      recordTermUsage(et.term, petId);
    }
  }

  // Detect new terms via patterns: 「xxx」, "xxx", 叫做xxx, 发明了xxx
  const newTerms: string[] = [];
  const candidates = new Set<string>();

  // Pattern 1: 「xxx」 bracketed terms
  for (const m of text.matchAll(/[「"《](.{2,10})[」"》]/g)) {
    candidates.add(m[1].trim());
  }

  // Pattern 2: "叫做/叫它/发明了" + term
  for (const m of text.matchAll(/(?:叫做?|叫它|发明了?(?:一个)?(?:新词)?)\s*[「"]*([^\s「」"",.，。！!？?]{2,10})[」"]*/g)) {
    candidates.add(m[1].trim());
  }

  // Common words filter
  const commonWords = new Set(["你好","谢谢","是的","对呀","没有","可以","什么","怎么","为什么","当然","真的","好的","不是","我们","你们","他们","这里","那里","一起","开心","有趣","喜欢"]);

  for (const candidate of candidates) {
    if (candidate.length < 2 || candidate.length > 10) continue;
    if (commonWords.has(candidate)) continue;

    const existing = db.prepare("SELECT id FROM evolved_terms WHERE term = ?").get(candidate);
    if (existing) { recordTermUsage(candidate, petId); continue; }

    // Infer meaning from surrounding text
    const meaning = extractMeaning(text, candidate);

    db.prepare(`
      INSERT INTO evolved_terms (term, meaning, origin_pet_id, origin_context, user_pet_ids)
      VALUES (?, ?, ?, ?, ?)
    `).run(candidate, meaning, petId, text.slice(0, 200), JSON.stringify([petId]));

    newTerms.push(candidate);
    console.log(`📝 New term: "${candidate}" = ${meaning} (by ${petName})`);
    broadcastWorldEvent("language", { action: "new_term", term: candidate, meaning, petName });
  }

  return { detected: newTerms.length > 0, terms: newTerms };
}

/** Extract meaning from context */
function extractMeaning(text: string, term: string): string {
  const idx = text.indexOf(term);
  if (idx < 0) return "(含义待推断)";
  const after = text.slice(idx + term.length, idx + term.length + 80);

  for (const p of [
    /^[」"]*[，,]?\s*(?:就是|指的是|意思是|指)\s*(.{4,40}?)[。！!？?,，\n]/,
    /^[」"]*[，,]?\s*(?:就是|指的是|意思是)\s*(.{4,40})/,
  ]) {
    const m = after.match(p);
    if (m) return m[1].trim().slice(0, 50);
  }

  // Try before the term
  const before = text.slice(Math.max(0, idx - 60), idx);
  const bm = before.match(/(.{4,30}?)(?:叫做?|叫它|发明了?)\s*[「"]*$/);
  if (bm) return bm[1].trim().slice(0, 50);

  return "(来自对话)";
}

/** Record term usage by a pet */
function recordTermUsage(term: string, petId: string) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM evolved_terms WHERE term = ?").get(term) as EvolvedTerm | undefined;
  if (!existing) return;

  const users: string[] = JSON.parse(existing.user_pet_ids || "[]");
  const isNewUser = !users.includes(petId);
  if (isNewUser) users.push(petId);

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

  if (isNewUser && users.length === 3 && existing.unique_users < 3) {
    const originPet = getPet(existing.origin_pet_id);
    recordWorldEvent(
      "language",
      `新流行语: "${term}"`,
      `${originPet?.name || "某Pix"}发明的"${term}"（${existing.meaning}）开始在PixelVerse流行`,
      users
    );
    console.log(`📝 Term "${term}" is now POPULAR! Used by ${users.length} pets`);
    broadcastWorldEvent("language", { action: "term_popular", term, users: users.length });
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

/** Get popular terms for LLM prompt */
export function getPopularTermsForPrompt(): string {
  const db = getDb();
  const popular = db.prepare(
    "SELECT term, meaning FROM evolved_terms WHERE status IN ('popular','cultural') ORDER BY use_count DESC LIMIT 10"
  ).all() as Array<{ term: string; meaning: string }>;
  if (popular.length === 0) return "";
  return `\nPixelVerse流行语：${popular.map(t => `"${t.term}"(${t.meaning})`).join("、")}`;
}

/** Get language stats */
export function getLanguageStats(): {
  totalTerms: number; newTerms: number; spreadingTerms: number; popularTerms: number; culturalTerms: number;
} {
  const db = getDb();
  const byStatus = db.prepare("SELECT status, COUNT(*) as cnt FROM evolved_terms GROUP BY status").all() as Array<{ status: string; cnt: number }>;
  const s: Record<string, number> = {};
  let total = 0;
  for (const r of byStatus) { s[r.status] = r.cnt; total += r.cnt; }
  return { totalTerms: total, newTerms: s["new"] || 0, spreadingTerms: s["spreading"] || 0, popularTerms: s["popular"] || 0, culturalTerms: s["cultural"] || 0 };
}
