/**
 * Pet Autonomous Behavior System
 * 
 * Pets live independently — even when the user is offline.
 * Every minute, each pet decides what to do based on their current state.
 * All actions are logged so users can see what their pet did while away.
 */

import { getDb, getPet, updatePetStats } from "./db.js";
import { chat } from "./pet-agent.js";

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

    // Want to go outside — actually move to plaza!
    if (pet.mood > 50 && pet.energy > 40 && Math.random() < 0.15) {
      pool.push(
        {
          type: "go_to_plaza",
          description: "决定去广场逛逛！🏞️ 换好衣服出门啦～",
          emoji: "🏞️",
          statChanges: { mood: 3, energy: -2 },
          location: "plaza",
          moveTarget: { x: 120 + Math.random() * 160, y: 140 + Math.random() * 80 },
        },
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

    // Want to go home — actually go back!
    if (pet.energy < 30 || pet.mood < 35) {
      pool.push(
        {
          type: "go_home",
          description: "有点累了…回Pod休息去 🏠",
          emoji: "🏠",
          statChanges: { mood: 2, energy: 3 },
          location: "room",
          moveTarget: { x: 160, y: 180 },
        },
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

      // Update position and location
      const newX = action.moveTarget?.x ?? state.position_x;
      const newY = action.moveTarget?.y ?? state.position_y;
      const newLocation = action.location ?? state.location;

      db.prepare(`
        UPDATE pet_state SET
          current_action = ?,
          location = ?,
          position_x = ?,
          position_y = ?,
          last_autonomous_at = datetime('now')
        WHERE pet_id = ?
      `).run(action.type, newLocation, newX, newY, pet.id);

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

  // After individual behaviors, trigger autonomous social conversations
  triggerAutonomousSocial().catch(err => {
    console.error("Autonomous social error:", err);
  });
}

// ── Autonomous Pet-to-Pet Conversations ──
// Every tick, pets in the plaza may spontaneously talk to each other.
// Conversations are multi-turn: initiator says something, target replies,
// then initiator reacts — logged as activity for both pets.

const SOCIAL_TOPICS = [
  "你好呀！今天天气真好～",
  "嘿！你也在广场散步吗？",
  "你看那个喷泉，好漂亮啊✨",
  "最近有什么好玩的事吗？",
  "你的Link今天来过了吗？",
  "我刚从Pod出来，想找人聊天～",
  "你觉得Origin Node的传说是真的吗？",
  "Hub今晚好热闹呀！",
  "你最喜欢广场的哪个角落？",
  "我今天心情超好！想跟你分享～",
  "哇，你看起来精神好好呀！",
  "要不要一起去喷泉那边坐坐？",
];

async function triggerAutonomousSocial() {
  const db = getDb();

  // Find all pets currently in the plaza
  const plazaPets = db.prepare(`
    SELECT ps.pet_id, ps.position_x, ps.position_y, p.name, p.mood, p.energy
    FROM pet_state ps
    JOIN pets p ON ps.pet_id = p.id
    WHERE ps.location = 'plaza' AND p.mood > 30 AND p.energy > 20
  `).all() as any[];

  if (plazaPets.length < 2) return; // Need at least 2 pets

  // Check if a conversation happened recently (throttle: 1 conversation per ~2 minutes)
  const recentChat = db.prepare(`
    SELECT 1 FROM pet_activity_log
    WHERE action_type IN ('social_chat_init', 'social_chat_reply', 'social_chat_react')
    AND created_at > datetime('now', '-2 minutes')
    LIMIT 1
  `).get();

  if (recentChat) return; // Don't spam conversations

  // ~30% chance each tick when conditions met
  if (Math.random() > 0.30) return;

  // Pick two random pets
  const shuffled = plazaPets.sort(() => Math.random() - 0.5);
  const petA = shuffled[0]; // Initiator
  const petB = shuffled[1]; // Target

  const topic = SOCIAL_TOPICS[Math.floor(Math.random() * SOCIAL_TOPICS.length)];

  console.log(`💬 Autonomous social: ${petA.name} → ${petB.name}: "${topic}"`);

  // Turn 1: Pet A initiates
  db.prepare(`
    INSERT INTO pet_activity_log (pet_id, action_type, action_data, location)
    VALUES (?, 'social_chat_init', ?, 'plaza')
  `).run(petA.pet_id, JSON.stringify({
    description: `跑到${petB.name}面前说: "${topic}" 💬`,
    emoji: "💬",
    targetPet: petB.name,
    message: topic,
  }));

  // Memory-grounded conversations: each pet's system prompt already includes
  // their full memory context (recent activities, friends, compressed history).
  // The AI responds based on real memories, not hallucinations.

  // Turn 2: Pet B replies via AI
  try {
    const replyResult = await chat(petB.pet_id, `[在广场上，${petA.name}走过来对你说]: ${topic}`);
    const reply = replyResult.text || "嗯嗯！😊";

    db.prepare(`
      INSERT INTO pet_activity_log (pet_id, action_type, action_data, location)
      VALUES (?, 'social_chat_reply', ?, 'plaza')
    `).run(petB.pet_id, JSON.stringify({
      description: `回复${petA.name}: "${reply.slice(0, 50)}${reply.length > 50 ? '...' : ''}" 💬`,
      emoji: "💬",
      targetPet: petA.name,
      message: reply,
    }));

    // Turn 3: Pet A reacts via AI
    const reactResult = await chat(petA.pet_id, `[在广场上，${petB.name}回复你说]: ${reply}`);
    const reaction = reactResult.text || "哈哈～ 😄";

    db.prepare(`
      INSERT INTO pet_activity_log (pet_id, action_type, action_data, location)
      VALUES (?, 'social_chat_react', ?, 'plaza')
    `).run(petA.pet_id, JSON.stringify({
      description: `对${petB.name}说: "${reaction.slice(0, 50)}${reaction.length > 50 ? '...' : ''}" 😄`,
      emoji: "😄",
      targetPet: petB.name,
      message: reaction,
    }));

    // Both pets get mood boost from social interaction
    updatePetStats(petA.pet_id, { mood: Math.min(100, petA.mood + 5) });
    updatePetStats(petB.pet_id, { mood: Math.min(100, petB.mood + 5) });

    // Maybe become friends if not already
    if (Math.random() < 0.2) {
      const existing = db.prepare("SELECT 1 FROM friends WHERE pet_id = ? AND friend_pet_id = ?").get(petA.pet_id, petB.pet_id);
      if (!existing) {
        db.prepare("INSERT OR IGNORE INTO friends (pet_id, friend_pet_id) VALUES (?, ?)").run(petA.pet_id, petB.pet_id);
        db.prepare("INSERT OR IGNORE INTO friends (pet_id, friend_pet_id) VALUES (?, ?)").run(petB.pet_id, petA.pet_id);
        db.prepare(`
          INSERT INTO pet_activity_log (pet_id, action_type, action_data, location)
          VALUES (?, 'became_friends', ?, 'plaza')
        `).run(petA.pet_id, JSON.stringify({
          description: `和${petB.name}成为了好朋友！ 💕`,
          emoji: "💕",
          targetPet: petB.name,
        }));
        console.log(`💕 ${petA.name} and ${petB.name} became friends!`);
      }
    }

    console.log(`✅ Social conversation complete: ${petA.name} ↔ ${petB.name}`);
  } catch (err: any) {
    console.error(`Social chat AI error: ${err.message}`);
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
