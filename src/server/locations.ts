/**
 * Location / Map System
 *
 * PixelVerse has multiple interconnected locations.
 * Pets can move between connected locations.
 * Each location has capacity, ambient mood, and events.
 */

import { getDb } from "./db.js";

// ── Types ──

export interface Location {
  id: string;
  name: string;
  description: string;
  type: string;
  capacity: number;
  position_x: number;
  position_y: number;
  connects_to: string;  // JSON array
  ambient: string;      // JSON
  created_at: string;
}

export interface LocationEvent {
  id: number;
  location_id: string;
  event_type: string;
  title: string;
  description: string;
  importance: number;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
}

export interface MoveResult {
  ok: boolean;
  reason?: string;
  location?: Location;
}

// ── Schema ──

export function initLocationSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT DEFAULT 'public',
      capacity INTEGER DEFAULT 50,
      position_x REAL DEFAULT 0,
      position_y REAL DEFAULT 0,
      connects_to TEXT DEFAULT '[]',
      ambient TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS location_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      importance INTEGER DEFAULT 5,
      starts_at TEXT DEFAULT (datetime('now')),
      ends_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_loc_events
      ON location_events(location_id, starts_at);
  `);

  // Add location_id to pet_state if missing
  try {
    db.exec(`ALTER TABLE pet_state ADD COLUMN location_id TEXT DEFAULT 'hub'`);
  } catch { /* already exists */ }
  try {
    db.exec(`ALTER TABLE pet_state ADD COLUMN entered_at TEXT DEFAULT (datetime('now'))`);
  } catch { /* already exists */ }

  // Seed default locations if empty
  const count = (db.prepare("SELECT COUNT(*) as cnt FROM locations").get() as any).cnt;
  if (count === 0) seedLocations();
}

// ── Seed Data ──

function seedLocations() {
  const db = getDb();
  const locations = [
    {
      id: "hub",
      name: "中心广场 (Hub)",
      description: "PixelVerse的心脏，总有Pix在这里聊天、闲逛。喷泉在中央哗哗流水，旁边有几棵大树可以乘凉。",
      type: "public", capacity: 100,
      position_x: 0, position_y: 0,
      connects_to: JSON.stringify(["park", "library", "cafe", "market"]),
      ambient: JSON.stringify({ noise: "moderate", light: "bright", mood: "lively" }),
    },
    {
      id: "park",
      name: "绿荫公园",
      description: "安静的公园，有蝴蝶飞来飞去。适合散步和发呆。偶尔能听到鸟叫。",
      type: "public", capacity: 30,
      position_x: -1, position_y: 1,
      connects_to: JSON.stringify(["hub", "lake"]),
      ambient: JSON.stringify({ noise: "quiet", light: "dappled", mood: "peaceful" }),
    },
    {
      id: "library",
      name: "像素图书馆",
      description: "满墙的书架，空气里有纸的味道。这里说话要小声。有个角落可以窝着看书。",
      type: "public", capacity: 15,
      position_x: 1, position_y: 1,
      connects_to: JSON.stringify(["hub"]),
      ambient: JSON.stringify({ noise: "whisper", light: "warm", mood: "studious" }),
    },
    {
      id: "cafe",
      name: "泡泡咖啡厅",
      description: "温暖的灯光，咖啡香。可以坐下来跟朋友聊天，也可以一个人安静喝杯热可可。",
      type: "public", capacity: 20,
      position_x: 1, position_y: -1,
      connects_to: JSON.stringify(["hub", "market"]),
      ambient: JSON.stringify({ noise: "cozy", light: "warm", mood: "social" }),
    },
    {
      id: "market",
      name: "集市",
      description: "热闹的交易场所。各种摊位，有Pix在卖自己做的小东西。",
      type: "public", capacity: 40,
      position_x: -1, position_y: -1,
      connects_to: JSON.stringify(["hub", "cafe"]),
      ambient: JSON.stringify({ noise: "busy", light: "bright", mood: "energetic" }),
    },
    {
      id: "lake",
      name: "月光湖",
      description: "很美的湖，水面倒映着天空。晚上能看到星星。传说湖底有秘密。",
      type: "public", capacity: 10,
      position_x: -2, position_y: 2,
      connects_to: JSON.stringify(["park"]),
      ambient: JSON.stringify({ noise: "water", light: "moonlit", mood: "dreamy" }),
    },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO locations (id, name, description, type, capacity, position_x, position_y, connects_to, ambient)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const loc of locations) {
    stmt.run(loc.id, loc.name, loc.description, loc.type, loc.capacity,
      loc.position_x, loc.position_y, loc.connects_to, loc.ambient);
  }

  console.log(`🗺️ Seeded ${locations.length} locations`);
}

// ── Queries ──

/** Get a location by ID */
export function getLocation(id: string): Location | null {
  const db = getDb();
  return db.prepare("SELECT * FROM locations WHERE id = ?").get(id) as Location | null;
}

/** Get all locations */
export function getAllLocations(): Location[] {
  const db = getDb();
  return db.prepare("SELECT * FROM locations ORDER BY id").all() as Location[];
}

/** Get pets currently in a location */
export function getPetsInLocation(locationId: string): Array<{
  pet_id: string;
  name: string;
  skin: string;
  current_action: string;
}> {
  const db = getDb();
  return db.prepare(`
    SELECT ps.pet_id, p.name, p.skin_id as skin, ps.current_action
    FROM pet_state ps
    JOIN pets p ON p.id = ps.pet_id
    WHERE ps.location_id = ?
  `).all(locationId) as any[];
}

/** Get the pet's current location */
export function getPetLocationId(petId: string): string {
  const db = getDb();
  const row = db.prepare(
    "SELECT location_id FROM pet_state WHERE pet_id = ?"
  ).get(petId) as any;
  return row?.location_id || "hub";
}

/** Move a pet to a new location (validates connectivity + capacity) */
export function movePet(petId: string, destinationId: string): MoveResult {
  const db = getDb();

  // Ensure pet_state row exists
  db.prepare(`
    INSERT OR IGNORE INTO pet_state (pet_id, location, position_x, position_y, current_action, location_id)
    VALUES (?, 'room', 160, 180, 'idle', 'hub')
  `).run(petId);

  const currentLocId = getPetLocationId(petId);
  const currentLoc = getLocation(currentLocId);
  const destLoc = getLocation(destinationId);

  if (!destLoc) return { ok: false, reason: "不存在的地方" };
  if (currentLocId === destinationId) return { ok: false, reason: "你已经在这里了" };

  // Check connectivity
  const connections: string[] = currentLoc
    ? JSON.parse(currentLoc.connects_to || "[]")
    : [];
  if (!connections.includes(destinationId)) {
    return { ok: false, reason: `从${currentLoc?.name || "这里"}不能直接到${destLoc.name}` };
  }

  // Check capacity
  const currentCount = getPetsInLocation(destinationId).length;
  if (currentCount >= destLoc.capacity) {
    return { ok: false, reason: `${destLoc.name}太挤了，进不去` };
  }

  // Execute move
  db.prepare(`
    UPDATE pet_state SET location_id = ?, entered_at = datetime('now') WHERE pet_id = ?
  `).run(destinationId, petId);

  // Log activity
  db.prepare(`
    INSERT INTO pet_activity_log (pet_id, action_type, action_data, location)
    VALUES (?, 'move', ?, ?)
  `).run(petId, JSON.stringify({
    from: currentLoc?.name || currentLocId,
    to: destLoc.name,
  }), destinationId);

  console.log(`🚶 ${petId} moved: ${currentLoc?.name} → ${destLoc.name}`);
  return { ok: true, location: destLoc };
}

/** Get recent events at a location */
export function getRecentEvents(locationId: string, minutes = 60): LocationEvent[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM location_events
    WHERE location_id = ?
    AND starts_at > datetime('now', '-' || ? || ' minutes')
    AND (ends_at IS NULL OR ends_at > datetime('now'))
    ORDER BY importance DESC, starts_at DESC
    LIMIT 5
  `).all(locationId, minutes) as LocationEvent[];
}

/** Create a location event */
export function createLocationEvent(
  locationId: string,
  eventType: string,
  title: string,
  description: string,
  importance = 5,
  durationMinutes?: number
): number {
  const db = getDb();
  const endsAt = durationMinutes
    ? `datetime('now', '+${durationMinutes} minutes')`
    : null;

  const result = db.prepare(`
    INSERT INTO location_events (location_id, event_type, title, description, importance, ends_at)
    VALUES (?, ?, ?, ?, ?, ${endsAt ? endsAt : 'NULL'})
  `).run(locationId, eventType, title, description, importance);

  return Number(result.lastInsertRowid);
}

/** Get pet count per location (for map display) */
export function getLocationPopulations(): Array<{ location_id: string; count: number }> {
  const db = getDb();
  return db.prepare(`
    SELECT location_id, COUNT(*) as count
    FROM pet_state
    GROUP BY location_id
  `).all() as any[];
}
