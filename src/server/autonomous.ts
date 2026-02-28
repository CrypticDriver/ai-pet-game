/**
 * Pet Autonomous Behavior System
 * 
 * Pets live independently — even when the user is offline.
 * Every minute, each pet decides what to do based on their current state.
 * All actions are logged so users can see what their pet did while away.
 */

import { getDb, getPet, updatePetStats } from "./db.js";

// ── DB Schema ──

export function initAutonomousSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_data TEXT,
      location TEXT NOT NULL DEFAULT 'room',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Pet's current location and autonomous state
    CREATE TABLE IF NOT EXISTS pet_state (
      pet_id TEXT PRIMARY KEY,
      location TEXT NOT NULL DEFAULT 'room',
      position_x REAL NOT NULL DEFAULT 160,
      position_y REAL NOT NULL DEFAULT 180,
      current_action TEXT NOT NULL DEFAULT 'idle',
      last_autonomous_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── Action Types ──

type PetAction = {
  type: string;
  description: string;
  emoji: string;
  statChanges?: Partial<{ mood: number; energy: number; hunger: number; affection: number }>;
  location?: "room" | "plaza";
  moveTarget?: { x: number; y: number };
};

// ── Decision Engine ──

function decidePetAction(pet: any, state: any): PetAction {
  const hour = new Date().getUTCHours();
  const isNight = hour >= 23 || hour < 7;
  const inPlaza = state?.location === "plaza";

  // Priority 1: Critical needs
  if (pet.energy < 10) {
    return {
      type: "sleep",
      description: "累到不行了…趴在地上睡着了 💤",
      emoji: "😴",
      statChanges: { energy: 15, mood: -2 },
      moveTarget: inPlaza ? undefined : { x: 250, y: 220 }, // bed area
    };
  }

  if (pet.hunger > 90) {
    return {
      type: "beg_food",
      description: "饿得不行了…眼巴巴地盯着食盆 🥺",
      emoji: "😿",
      statChanges: { mood: -3, energy: -2 },
      moveTarget: inPlaza ? undefined : { x: 80, y: 230 }, // food bowl area
    };
  }

  // Priority 2: Night behavior
  if (isNight) {
    if (pet.energy < 50) {
      return {
        type: "sleep",
        description: "夜深了，乖乖睡觉了～zzZ 🌙",
        emoji: "😴",
        statChanges: { energy: 20, mood: 3 },
        moveTarget: inPlaza ? undefined : { x: 250, y: 220 },
      };
    }
    return {
      type: "stargaze",
      description: "趴在窗台上看星星… ✨",
      emoji: "🌟",
      statChanges: { mood: 5, energy: -1 },
      moveTarget: inPlaza ? undefined : { x: 160, y: 80 }, // window area
    };
  }

  // Priority 3: Emotional needs
  if (pet.mood < 25) {
    const sadActions: PetAction[] = [
      {
        type: "mope",
        description: "心情不好…缩在角落里不想动 😢",
        emoji: "😢",
        statChanges: { mood: 2, energy: -1 },
        moveTarget: { x: 30, y: 250 },
      },
      {
        type: "sigh",
        description: "叹了口气…望着窗外发呆 😞",
        emoji: "😞",
        statChanges: { mood: 3 },
        moveTarget: inPlaza ? undefined : { x: 160, y: 80 },
      },
    ];
    return sadActions[Math.floor(Math.random() * sadActions.length)];
  }

  // Priority 4: Regular daily activities (weighted random)
  const activities = buildActivityPool(pet, state, inPlaza);
  return activities[Math.floor(Math.random() * activities.length)];
}

function buildActivityPool(pet: any, state: any, inPlaza: boolean): PetAction[] {
  const pool: PetAction[] = [];

  // ── Room activities ──
  if (!inPlaza) {
    // Idle / chill
    pool.push(
      { type: "idle", description: "坐在地上发呆…脑袋里在想什么呢？ 💭", emoji: "💭", statChanges: { mood: 1 } },
      { type: "idle", description: "懒洋洋地伸了个懒腰～ 😽", emoji: "😽", statChanges: { energy: 2, mood: 1 } },
    );

    // Play
    if (pet.energy > 30) {
      pool.push(
        { type: "play_toy", description: "发现了玩具球！追着玩得开心 🎾", emoji: "🎾", statChanges: { mood: 8, energy: -5, hunger: 3 }, moveTarget: { x: 200, y: 240 } },
        { type: "explore", description: "在房间里到处嗅嗅探索 🐾", emoji: "🐾", statChanges: { mood: 3, energy: -2 }, moveTarget: { x: 50 + Math.random() * 220, y: 150 + Math.random() * 80 } },
      );
    }

    // Nap
    if (pet.energy < 40) {
      pool.push(
        { type: "nap", description: "打了个小盹…zzZ 😴", emoji: "😴", statChanges: { energy: 10, mood: 2 }, moveTarget: { x: 250, y: 220 } },
        { type: "nap", description: "趴在窗台上晒太阳打瞌睡 ☀️", emoji: "☀️", statChanges: { energy: 8, mood: 3 }, moveTarget: { x: 160, y: 90 } },
      );
    }

    // Window gazing
    pool.push(
      { type: "window", description: "趴在窗台上看外面的风景 🌤️", emoji: "🌤️", statChanges: { mood: 4 }, moveTarget: { x: 160, y: 80 } },
    );

    // Read bookshelf (Easter egg)
    if (pet.mood > 60) {
      pool.push(
        { type: "read", description: "走到书架旁…假装在看书（其实看不懂）📚", emoji: "📚", statChanges: { mood: 3 }, moveTarget: { x: 40, y: 140 } },
      );
    }

    // Want to go outside
    if (pet.mood > 50 && pet.energy > 40 && Math.random() < 0.15) {
      pool.push(
        { type: "want_plaza", description: "趴在门口…好想去广场玩呀！ 🏞️", emoji: "🏞️", statChanges: { mood: -1 } },
      );
    }
  }

  // ── Plaza activities ──
  if (inPlaza) {
    pool.push(
      { type: "wander", description: "在广场上悠闲地散步～ 🚶", emoji: "🚶", statChanges: { mood: 3, energy: -2 }, moveTarget: { x: 80 + Math.random() * 240, y: 140 + Math.random() * 80 } },
      { type: "fountain", description: "跑到喷泉边玩水！💦", emoji: "💦", statChanges: { mood: 6, energy: -3 }, moveTarget: { x: 180, y: 170 } },
      { type: "bench", description: "坐在长椅上休息一会儿 🪑", emoji: "🪑", statChanges: { energy: 5, mood: 2 }, moveTarget: { x: 60, y: 180 } },
      { type: "butterfly", description: "追着蝴蝶跑！🦋", emoji: "🦋", statChanges: { mood: 7, energy: -4, hunger: 2 }, moveTarget: { x: 100 + Math.random() * 200, y: 150 + Math.random() * 60 } },
    );

    // Social — greet random nearby pets
    if (pet.mood > 40) {
      pool.push(
        { type: "social_wave", description: "向广场上的其他宠物打招呼！👋", emoji: "👋", statChanges: { mood: 5, energy: -1 } },
      );
    }

    // Want to go home
    if (pet.energy < 30 || pet.mood < 35) {
      pool.push(
        { type: "want_room", description: "有点累了…想回家休息 🏠", emoji: "🏠", statChanges: { mood: 1 } },
      );
    }
  }

  // Ensure pool is never empty
  if (pool.length === 0) {
    pool.push({ type: "idle", description: "安静地坐着… 😐", emoji: "😐" });
  }

  return pool;
}

// ── Execute autonomous behavior for ALL pets ──

export function executeAutonomousBehavior() {
  const db = getDb();

  const pets = db.prepare("SELECT * FROM pets").all() as any[];

  for (const pet of pets) {
    try {
      // Get or create pet state
      let state = db.prepare("SELECT * FROM pet_state WHERE pet_id = ?").get(pet.id) as any;
      if (!state) {
        db.prepare("INSERT INTO pet_state (pet_id) VALUES (?)").run(pet.id);
        state = { pet_id: pet.id, location: "room", position_x: 160, position_y: 180, current_action: "idle" };
      }

      // Decide what to do
      const action = decidePetAction(pet, state);

      // Apply stat changes
      if (action.statChanges) {
        const newStats: any = {};
        if (action.statChanges.mood !== undefined)
          newStats.mood = Math.max(0, Math.min(100, pet.mood + action.statChanges.mood));
        if (action.statChanges.energy !== undefined)
          newStats.energy = Math.max(0, Math.min(100, pet.energy + action.statChanges.energy));
        if (action.statChanges.hunger !== undefined)
          newStats.hunger = Math.max(0, Math.min(100, pet.hunger + action.statChanges.hunger));
        if (action.statChanges.affection !== undefined)
          newStats.affection = Math.max(0, Math.min(100, pet.affection + action.statChanges.affection));

        if (Object.keys(newStats).length > 0) {
          updatePetStats(pet.id, newStats);
        }
      }

      // Update position
      const newX = action.moveTarget?.x ?? state.position_x;
      const newY = action.moveTarget?.y ?? state.position_y;

      db.prepare(`
        UPDATE pet_state SET
          current_action = ?,
          position_x = ?,
          position_y = ?,
          last_autonomous_at = datetime('now')
        WHERE pet_id = ?
      `).run(action.type, newX, newY, pet.id);

      // Log the action
      db.prepare(`
        INSERT INTO pet_activity_log (pet_id, action_type, action_data, location)
        VALUES (?, ?, ?, ?)
      `).run(
        pet.id,
        action.type,
        JSON.stringify({ description: action.description, emoji: action.emoji, x: newX, y: newY }),
        state.location,
      );

    } catch (err) {
      console.error(`Autonomous behavior error for pet ${pet.id}:`, err);
    }
  }
}

// ── API helpers ──

export function getPetActivityLog(petId: string, limit = 20) {
  return getDb().prepare(`
    SELECT * FROM pet_activity_log
    WHERE pet_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(petId, limit) as any[];
}

export function getPetState(petId: string) {
  return getDb().prepare("SELECT * FROM pet_state WHERE pet_id = ?").get(petId) as any;
}

export function setPetLocation(petId: string, location: "room" | "plaza") {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO pet_state (pet_id, location, position_x, position_y, current_action, last_autonomous_at)
    VALUES (?, ?, 160, 180, 'idle', datetime('now'))
  `).run(petId, location);
}
