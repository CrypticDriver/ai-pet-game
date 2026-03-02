/**
 * Economy System — PixelCoin钱包+交易+工作
 *
 * 每只Pet出生有100 PixelCoin
 * 在特定地点可以"工作"赚钱
 * Pet之间可以送礼/交易
 * 商店购物扣钱
 */

import { getDb, getPet } from "./db.js";
import { getPetLocationId, getLocation } from "./locations.js";

// ── Schema ──

export function initEconomySchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_wallets (
      pet_id TEXT PRIMARY KEY,
      balance INTEGER DEFAULT 100,
      total_earned INTEGER DEFAULT 0,
      total_spent INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_pet_id TEXT,
      to_pet_id TEXT,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      description TEXT,
      location_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(from_pet_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tx_to ON transactions(to_pet_id, created_at);
  `);
  console.log("💰 Economy schema initialized");
}

// ── Types ──

export interface Wallet {
  pet_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  updated_at: string;
}

export interface Transaction {
  id: number;
  from_pet_id: string | null;
  to_pet_id: string | null;
  amount: number;
  reason: string;
  description: string;
  location_id: string | null;
  created_at: string;
}

// ── Wallet ──

/** Get or create wallet for a pet */
export function getWallet(petId: string): Wallet {
  const db = getDb();
  let wallet = db.prepare("SELECT * FROM pet_wallets WHERE pet_id = ?").get(petId) as Wallet | undefined;
  if (!wallet) {
    db.prepare("INSERT INTO pet_wallets (pet_id) VALUES (?)").run(petId);
    wallet = db.prepare("SELECT * FROM pet_wallets WHERE pet_id = ?").get(petId) as Wallet;
  }
  return wallet;
}

/** Get balance */
export function getBalance(petId: string): number {
  return getWallet(petId).balance;
}

// ── Transactions ──

/** System pays a pet (work income, rewards) */
export function systemPay(
  petId: string,
  amount: number,
  reason: string,
  description?: string
): { ok: boolean; balance: number } {
  const db = getDb();
  const wallet = getWallet(petId);
  const locationId = getPetLocationId(petId);

  db.prepare(`
    UPDATE pet_wallets SET balance = balance + ?, total_earned = total_earned + ?, updated_at = datetime('now')
    WHERE pet_id = ?
  `).run(amount, amount, petId);

  db.prepare(`
    INSERT INTO transactions (from_pet_id, to_pet_id, amount, reason, description, location_id)
    VALUES (NULL, ?, ?, ?, ?, ?)
  `).run(petId, amount, reason, description || reason, locationId);

  return { ok: true, balance: wallet.balance + amount };
}

/** Pet spends money (shop, services) */
export function spend(
  petId: string,
  amount: number,
  reason: string,
  description?: string
): { ok: boolean; balance?: number; error?: string } {
  const db = getDb();
  const wallet = getWallet(petId);

  if (wallet.balance < amount) {
    return { ok: false, error: `不够钱！需要${amount}，只有${wallet.balance} PixelCoin` };
  }

  const locationId = getPetLocationId(petId);

  db.prepare(`
    UPDATE pet_wallets SET balance = balance - ?, total_spent = total_spent + ?, updated_at = datetime('now')
    WHERE pet_id = ?
  `).run(amount, amount, petId);

  db.prepare(`
    INSERT INTO transactions (from_pet_id, to_pet_id, amount, reason, description, location_id)
    VALUES (?, NULL, ?, ?, ?, ?)
  `).run(petId, amount, reason, description || reason, locationId);

  return { ok: true, balance: wallet.balance - amount };
}

/** Pet-to-Pet transfer (gift, trade) */
export function transfer(
  fromPetId: string,
  toPetId: string,
  amount: number,
  reason: "gift" | "trade",
  description?: string
): { ok: boolean; fromBalance?: number; toBalance?: number; error?: string } {
  const db = getDb();
  const fromWallet = getWallet(fromPetId);

  if (fromWallet.balance < amount) {
    return { ok: false, error: `不够钱！需要${amount}，只有${fromWallet.balance} PixelCoin` };
  }

  const toPet = getPet(toPetId);
  if (!toPet) {
    return { ok: false, error: "找不到对方" };
  }

  const toWallet = getWallet(toPetId);
  const locationId = getPetLocationId(fromPetId);

  // Atomic transaction
  const txn = db.transaction(() => {
    db.prepare(`
      UPDATE pet_wallets SET balance = balance - ?, total_spent = total_spent + ?, updated_at = datetime('now')
      WHERE pet_id = ?
    `).run(amount, amount, fromPetId);

    db.prepare(`
      UPDATE pet_wallets SET balance = balance + ?, total_earned = total_earned + ?, updated_at = datetime('now')
      WHERE pet_id = ?
    `).run(amount, amount, toPetId);

    db.prepare(`
      INSERT INTO transactions (from_pet_id, to_pet_id, amount, reason, description, location_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(fromPetId, toPetId, amount, reason, description || reason, locationId);
  });
  txn();

  return {
    ok: true,
    fromBalance: fromWallet.balance - amount,
    toBalance: toWallet.balance + amount,
  };
}

// ── Work System ──

// Location-specific work opportunities
const WORK_OPPORTUNITIES: Record<string, { job: string; pay: number; cooldownMin: number }[]> = {
  library: [
    { job: "整理书架", pay: 5, cooldownMin: 30 },
    { job: "给小Pix讲故事", pay: 8, cooldownMin: 60 },
  ],
  cafe: [
    { job: "帮忙端咖啡", pay: 4, cooldownMin: 20 },
    { job: "弹唱一曲", pay: 10, cooldownMin: 120 },
  ],
  market: [
    { job: "帮摊主看摊", pay: 6, cooldownMin: 30 },
    { job: "搬运货物", pay: 8, cooldownMin: 45 },
    { job: "拍卖叫价", pay: 12, cooldownMin: 180 },
  ],
  park: [
    { job: "打扫落叶", pay: 3, cooldownMin: 20 },
    { job: "种花", pay: 5, cooldownMin: 60 },
  ],
  hub: [
    { job: "在喷泉旁表演", pay: 7, cooldownMin: 60 },
  ],
  lake: [
    { job: "钓鱼", pay: 6, cooldownMin: 45 },
    { job: "画风景", pay: 9, cooldownMin: 90 },
  ],
};

/** Get available work at pet's current location */
export function getAvailableWork(petId: string): Array<{ job: string; pay: number; available: boolean }> {
  const locationId = getPetLocationId(petId);
  const opportunities = WORK_OPPORTUNITIES[locationId] || [];
  const db = getDb();

  return opportunities.map(opp => {
    // Check cooldown
    const lastWork = db.prepare(`
      SELECT created_at FROM transactions
      WHERE to_pet_id = ? AND reason = 'work' AND description = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(petId, opp.job) as { created_at: string } | undefined;

    let available = true;
    if (lastWork) {
      const elapsed = (Date.now() - new Date(lastWork.created_at + "Z").getTime()) / 60_000;
      available = elapsed >= opp.cooldownMin;
    }

    return { job: opp.job, pay: opp.pay, available };
  });
}

/** Pet does work at current location */
export function doWork(
  petId: string,
  jobName: string
): { ok: boolean; pay?: number; balance?: number; error?: string } {
  const locationId = getPetLocationId(petId);
  const opportunities = WORK_OPPORTUNITIES[locationId] || [];
  const job = opportunities.find(o => o.job === jobName);

  if (!job) {
    return { ok: false, error: `在${getLocation(locationId)?.name || "这里"}没有这个工作` };
  }

  // Check cooldown
  const available = getAvailableWork(petId).find(o => o.job === jobName);
  if (!available?.available) {
    return { ok: false, error: "这个工作暂时不能做，休息一会儿再来" };
  }

  const result = systemPay(petId, job.pay, "work", jobName);
  return { ok: true, pay: job.pay, balance: result.balance };
}

// ── Stats ──

/** Get economy overview */
export function getEconomyStats(): {
  totalPets: number;
  totalBalance: number;
  avgBalance: number;
  totalTransactions: number;
  todayTransactions: number;
} {
  const db = getDb();
  const walletStats = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(balance), 0) as total, COALESCE(AVG(balance), 0) as avg
    FROM pet_wallets
  `).get() as any;

  const txTotal = (db.prepare("SELECT COUNT(*) as cnt FROM transactions").get() as any).cnt;
  const txToday = (db.prepare(
    "SELECT COUNT(*) as cnt FROM transactions WHERE date(created_at) = date('now')"
  ).get() as any).cnt;

  return {
    totalPets: walletStats.cnt,
    totalBalance: walletStats.total,
    avgBalance: Math.round(walletStats.avg),
    totalTransactions: txTotal,
    todayTransactions: txToday,
  };
}

/** Get transaction history for a pet */
export function getTransactionHistory(petId: string, limit: number = 20): Transaction[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM transactions
    WHERE from_pet_id = ? OR to_pet_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(petId, petId, limit) as Transaction[];
}

/** Format wallet context for LLM prompt */
export function walletToPrompt(petId: string): string {
  const wallet = getWallet(petId);
  const locationId = getPetLocationId(petId);
  const work = getAvailableWork(petId);
  const loc = getLocation(locationId);

  let text = `你有${wallet.balance}个PixelCoin。`;

  if (work.length > 0) {
    const availableJobs = work.filter(w => w.available);
    if (availableJobs.length > 0) {
      text += `\n在${loc?.name || "这里"}可以打工：${availableJobs.map(w => `${w.job}(${w.pay}币)`).join("、")}`;
    }
  }

  return text;
}
