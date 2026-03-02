/**
 * Message Bus — Pet-to-Pet communication system
 *
 * Supports:
 * - Direct messages (1-to-1)
 * - Broadcast messages (to all pets in a location)
 * - Guild messages (future)
 *
 * All Pet decisions about what to say go through LLM.
 * This is just the transport layer.
 */

import { getDb } from "./db.js";

// ── Types ──

export interface PetMessage {
  id: number;
  from_pet_id: string;
  to_pet_id: string | null;
  location: string | null;
  channel: string;
  content: string;
  metadata: string | null;
  read_at: string | null;
  created_at: string;
}

export interface MessageMeta {
  emotion?: string;
  topic?: string;
  importance?: number;
}

// ── Schema ──

export function initMessageBusSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_pet_id TEXT NOT NULL,
      to_pet_id TEXT,
      location TEXT,
      channel TEXT DEFAULT 'general',
      content TEXT NOT NULL,
      metadata TEXT,
      read_at TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_msg_to ON pet_messages(to_pet_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_msg_location ON pet_messages(location, created_at);
    CREATE INDEX IF NOT EXISTS idx_msg_expires ON pet_messages(expires_at);
  `);
}

// ── MessageBus ──

/** Send a direct message from one pet to another */
export function sendMessage(
  fromPetId: string,
  toPetId: string,
  content: string,
  meta?: MessageMeta
): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO pet_messages (from_pet_id, to_pet_id, channel, content, metadata, expires_at)
    VALUES (?, ?, 'direct', ?, ?, datetime('now', '+7 days'))
  `).run(fromPetId, toPetId, content, meta ? JSON.stringify(meta) : null);

  return Number(result.lastInsertRowid);
}

/** Broadcast a message to all pets in a location */
export function broadcastMessage(
  fromPetId: string,
  location: string,
  content: string,
  meta?: MessageMeta
): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO pet_messages (from_pet_id, location, channel, content, metadata, expires_at)
    VALUES (?, ?, 'broadcast', ?, ?, datetime('now', '+24 hours'))
  `).run(fromPetId, location, content, meta ? JSON.stringify(meta) : null);

  return Number(result.lastInsertRowid);
}

/** Receive unread direct messages for a pet */
export function receiveMessages(petId: string, limit = 10): PetMessage[] {
  const db = getDb();

  // Direct messages
  const direct = db.prepare(`
    SELECT * FROM pet_messages
    WHERE to_pet_id = ? AND read_at IS NULL AND channel = 'direct'
    ORDER BY created_at DESC LIMIT ?
  `).all(petId, limit) as PetMessage[];

  // Mark direct as read
  if (direct.length > 0) {
    const ids = direct.map(m => m.id);
    db.prepare(`
      UPDATE pet_messages SET read_at = datetime('now')
      WHERE id IN (${ids.map(() => "?").join(",")})
    `).run(...ids);
  }

  return direct;
}

/** Get recent broadcasts at a location (not read-tracked, time-based) */
export function getLocationBroadcasts(
  location: string,
  excludePetId: string,
  minutes = 60,
  limit = 5
): PetMessage[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM pet_messages
    WHERE channel = 'broadcast' AND location = ? AND from_pet_id != ?
    AND expires_at > datetime('now')
    AND created_at > datetime('now', '-' || ? || ' minutes')
    ORDER BY created_at DESC LIMIT ?
  `).all(location, excludePetId, minutes, limit) as PetMessage[];
}

/** Get all messages (direct + broadcast) a pet should be aware of */
export function getInbox(petId: string, location: string, limit = 10): PetMessage[] {
  const direct = receiveMessages(petId, limit);
  const broadcasts = getLocationBroadcasts(location, petId, 60, 5);
  return [...direct, ...broadcasts];
}

/** Count unread direct messages */
export function getUnreadCount(petId: string): number {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as cnt FROM pet_messages
    WHERE to_pet_id = ? AND read_at IS NULL AND channel = 'direct'
  `).get(petId) as any;
  return row?.cnt || 0;
}

/** Get conversation history between two pets */
export function getConversationHistory(
  petIdA: string,
  petIdB: string,
  limit = 20
): PetMessage[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM pet_messages
    WHERE channel = 'direct'
    AND ((from_pet_id = ? AND to_pet_id = ?) OR (from_pet_id = ? AND to_pet_id = ?))
    ORDER BY created_at DESC LIMIT ?
  `).all(petIdA, petIdB, petIdB, petIdA, limit) as PetMessage[];
}

/** Clean up expired messages */
export function cleanupExpiredMessages(): number {
  const db = getDb();
  const result = db.prepare(`
    DELETE FROM pet_messages WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
  `).run();
  return result.changes;
}

/** Get message stats for monitoring */
export function getMessageStats(): {
  total: number;
  unread: number;
  today: number;
} {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as cnt FROM pet_messages").get() as any).cnt;
  const unread = (db.prepare(
    "SELECT COUNT(*) as cnt FROM pet_messages WHERE read_at IS NULL AND channel = 'direct'"
  ).get() as any).cnt;
  const today = (db.prepare(
    "SELECT COUNT(*) as cnt FROM pet_messages WHERE created_at > datetime('now', '-1 day')"
  ).get() as any).cnt;
  return { total, unread, today };
}
