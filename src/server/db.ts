import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../data/pet.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL DEFAULT 'My Pet',
      personality TEXT NOT NULL DEFAULT 'friendly',
      -- Nurturing stats (0-100)
      mood INTEGER NOT NULL DEFAULT 70,
      energy INTEGER NOT NULL DEFAULT 80,
      hunger INTEGER NOT NULL DEFAULT 50,
      affection INTEGER NOT NULL DEFAULT 30,
      -- Appearance
      skin_id TEXT NOT NULL DEFAULT 'default',
      -- AI context
      system_prompt TEXT,
      memory_summary TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id TEXT NOT NULL REFERENCES pets(id),
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('skin', 'accessory', 'food', 'toy')),
      price INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      rarity TEXT DEFAULT 'common' CHECK(rarity IN ('common', 'rare', 'epic', 'legendary')),
      image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS user_items (
      user_id TEXT NOT NULL REFERENCES users(id),
      item_id TEXT NOT NULL REFERENCES items(id),
      acquired_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, item_id)
    );

    -- Seed default skins if not exist
    INSERT OR IGNORE INTO items (id, name, type, price, description, rarity) VALUES
      ('skin-default', 'Default', 'skin', 0, 'Your pet''s natural look', 'common'),
      ('skin-ocean', 'Ocean Blue', 'skin', 50, 'Cool ocean vibes', 'common'),
      ('skin-sunset', 'Sunset Glow', 'skin', 80, 'Warm sunset colors', 'rare'),
      ('skin-forest', 'Forest Green', 'skin', 80, 'Nature spirit', 'rare'),
      ('skin-galaxy', 'Galaxy', 'skin', 200, 'Cosmic sparkle', 'epic');

    -- Pet equipped accessories (many-to-many: pet can wear multiple)
    CREATE TABLE IF NOT EXISTS pet_accessories (
      pet_id TEXT NOT NULL REFERENCES pets(id),
      item_id TEXT NOT NULL REFERENCES items(id),
      slot TEXT NOT NULL CHECK(slot IN ('hat', 'face', 'decoration')),
      equipped_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (pet_id, slot)
    );

    -- Seed accessories
    INSERT OR IGNORE INTO items (id, name, type, price, description, rarity, image_url) VALUES
      ('acc-party-hat',    'Party Hat',    'accessory', 30,  'Time to celebrate! 🎉',       'common',    'accessory-party-hat.svg'),
      ('acc-wizard-hat',   'Wizard Hat',   'accessory', 60,  'Mystical powers ✨',           'rare',      'accessory-wizard-hat.svg'),
      ('acc-crown',        'Golden Crown', 'accessory', 150, 'Royalty! 👑',                 'epic',      'accessory-crown.svg'),
      ('acc-bow',          'Cute Bow',     'accessory', 20,  'Pretty ribbon 🎀',            'common',    'accessory-bow.svg'),
      ('acc-angel-halo',   'Angel Halo',   'accessory', 100, 'Heavenly glow 😇',            'rare',      'accessory-angel-halo.svg'),
      ('acc-devil-horns',  'Devil Horns',  'accessory', 100, 'A little mischief 😈',        'rare',      'accessory-devil-horns.svg'),
      ('acc-glasses',      'Round Glasses', 'accessory', 40, 'Scholarly look 🤓',           'common',    'accessory-glasses.svg'),
      ('acc-mask',         'Mysterious Mask','accessory', 80, 'Who is behind the mask? 🎭', 'rare',      'accessory-mask.svg'),
      ('acc-monocle',      'Monocle',      'accessory', 60,  'Distinguished 🧐',            'rare',      'accessory-monocle.svg'),
      ('acc-star',         'Star Charm',   'accessory', 50,  'Twinkle twinkle ⭐',           'common',    'accessory-star.svg'),
      ('acc-flower',       'Flower Crown', 'accessory', 40,  'Spring vibes 🌸',             'common',    'accessory-flower.svg');
  `);
}

// --- User ops ---

export function getOrCreateUser(userId: string, username: string) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (existing) return existing;
  db.prepare("INSERT INTO users (id, username) VALUES (?, ?)").run(userId, username);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

// --- Pet ops ---

export function getOrCreatePet(userId: string, petName = "Pixel") {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM pets WHERE user_id = ?").get(userId) as any;
  if (existing) return existing;

  const petId = `pet-${userId}-${Date.now()}`;
  db.prepare(`
    INSERT INTO pets (id, user_id, name) VALUES (?, ?, ?)
  `).run(petId, userId, petName);

  // Give user the default skin
  db.prepare("INSERT OR IGNORE INTO user_items (user_id, item_id) VALUES (?, 'skin-default')").run(userId);

  return db.prepare("SELECT * FROM pets WHERE id = ?").get(petId);
}

export function getPet(petId: string) {
  return getDb().prepare("SELECT * FROM pets WHERE id = ?").get(petId) as any;
}

export function updatePetStats(petId: string, stats: Partial<{ mood: number; energy: number; hunger: number; affection: number }>) {
  const db = getDb();
  const fields = Object.entries(stats)
    .filter(([_, v]) => v !== undefined)
    .map(([k]) => `${k} = @${k}`);
  if (fields.length === 0) return;

  const sql = `UPDATE pets SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = @petId`;
  db.prepare(sql).run({ ...stats, petId });
}

export function updatePetSkin(petId: string, skinId: string) {
  getDb().prepare("UPDATE pets SET skin_id = ?, updated_at = datetime('now') WHERE id = ?").run(skinId, petId);
}

export function updatePetMemory(petId: string, memorySummary: string) {
  getDb().prepare("UPDATE pets SET memory_summary = ?, updated_at = datetime('now') WHERE id = ?").run(memorySummary, petId);
}

// --- Interaction history ---

export function addInteraction(petId: string, role: "user" | "assistant" | "system", content: string) {
  getDb().prepare("INSERT INTO interactions (pet_id, role, content) VALUES (?, ?, ?)").run(petId, role, content);
}

export function getRecentInteractions(petId: string, limit = 20) {
  return getDb()
    .prepare("SELECT role, content, created_at FROM interactions WHERE pet_id = ? ORDER BY id DESC LIMIT ?")
    .all(petId, limit)
    .reverse() as Array<{ role: string; content: string; created_at: string }>;
}

// --- Shop ---

export function getShopItems() {
  return getDb().prepare("SELECT * FROM items ORDER BY price ASC").all();
}

export function getUserItems(userId: string) {
  return getDb()
    .prepare(`
      SELECT i.* FROM items i
      JOIN user_items ui ON i.id = ui.item_id
      WHERE ui.user_id = ?
    `)
    .all(userId);
}

export function purchaseItem(userId: string, itemId: string): { ok: boolean; error?: string } {
  const db = getDb();
  const existing = db.prepare("SELECT 1 FROM user_items WHERE user_id = ? AND item_id = ?").get(userId, itemId);
  if (existing) return { ok: false, error: "Already owned" };

  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId) as any;
  if (!item) return { ok: false, error: "Item not found" };

  db.prepare("INSERT INTO user_items (user_id, item_id) VALUES (?, ?)").run(userId, itemId);
  return { ok: true };
}

// --- Stats decay (called periodically) ---

export function decayStats() {
  const db = getDb();
  db.exec(`
    UPDATE pets SET
      mood = MAX(0, mood - 2),
      energy = MAX(0, energy - 3),
      hunger = MIN(100, hunger + 4),
      updated_at = datetime('now')
  `);
}

// --- Accessories ---

export type AccessorySlot = "hat" | "face" | "decoration";

export function getEquippedAccessories(petId: string) {
  return getDb()
    .prepare(`
      SELECT pa.slot, pa.item_id, i.name, i.image_url, i.rarity
      FROM pet_accessories pa
      JOIN items i ON pa.item_id = i.id
      WHERE pa.pet_id = ?
    `)
    .all(petId) as Array<{ slot: AccessorySlot; item_id: string; name: string; image_url: string | null; rarity: string }>;
}

export function equipAccessory(petId: string, itemId: string, slot: AccessorySlot): { ok: boolean; error?: string } {
  const db = getDb();
  const pet = getPet(petId);
  if (!pet) return { ok: false, error: "Pet not found" };

  // Check user owns item
  const owned = db.prepare("SELECT 1 FROM user_items WHERE user_id = ? AND item_id = ?").get(pet.user_id, itemId);
  if (!owned) return { ok: false, error: "Item not owned" };

  // Check item is accessory
  const item = db.prepare("SELECT * FROM items WHERE id = ? AND type = 'accessory'").get(itemId) as any;
  if (!item) return { ok: false, error: "Not an accessory" };

  // Equip (replaces current slot)
  db.prepare(`
    INSERT OR REPLACE INTO pet_accessories (pet_id, item_id, slot) VALUES (?, ?, ?)
  `).run(petId, itemId, slot);

  return { ok: true };
}

export function unequipAccessory(petId: string, slot: AccessorySlot) {
  getDb().prepare("DELETE FROM pet_accessories WHERE pet_id = ? AND slot = ?").run(petId, slot);
}

