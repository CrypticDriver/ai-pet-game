/**
 * Plaza system — real-time pet social area
 * Pets can enter/leave the plaza, see others, interact, and make friends
 */

import type { WebSocket } from "@fastify/websocket";
import { getDb, getPet } from "./db.js";
import { chat } from "./pet-agent.js";

// ── DB Schema ──

export function initPlazaSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      pet_id TEXT NOT NULL,
      friend_pet_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (pet_id, friend_pet_id)
    );

    CREATE TABLE IF NOT EXISTS plaza_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_pet_id TEXT NOT NULL,
      to_pet_id TEXT NOT NULL,
      action TEXT NOT NULL,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── In-memory plaza state ──

interface PlazaPet {
  petId: string;
  userId: string;
  name: string;
  skin: string;
  expression: string;
  x: number;
  y: number;
  mood: number;
  animation: string;
  socket: WebSocket;
  lastActivity: number;
}

const plazaPets = new Map<string, PlazaPet>();

function broadcastToPlaza(message: object, excludePetId?: string) {
  const json = JSON.stringify(message);
  for (const [pid, pet] of plazaPets) {
    if (pid !== excludePetId && pet.socket.readyState === 1) {
      pet.socket.send(json);
    }
  }
}

function getPublicPetInfo(p: PlazaPet) {
  return {
    petId: p.petId,
    name: p.name,
    skin: p.skin,
    expression: p.expression,
    x: p.x,
    y: p.y,
    mood: p.mood,
    animation: p.animation,
  };
}

// ── Plaza REST API ──

export function getPlazaPets() {
  return Array.from(plazaPets.values()).map(getPublicPetInfo);
}

export function getFriends(petId: string) {
  const db = getDb();
  return db.prepare(`
    SELECT f.friend_pet_id, p.name, p.skin_id as skin, p.mood
    FROM friends f
    JOIN pets p ON f.friend_pet_id = p.id
    WHERE f.pet_id = ?
  `).all(petId);
}

export function addFriend(petId: string, friendPetId: string): { ok: boolean; error?: string } {
  const db = getDb();
  if (petId === friendPetId) return { ok: false, error: "Cannot friend yourself" };

  const exists = db.prepare("SELECT 1 FROM friends WHERE pet_id = ? AND friend_pet_id = ?").get(petId, friendPetId);
  if (exists) return { ok: false, error: "Already friends" };

  // Bidirectional friendship
  db.prepare("INSERT OR IGNORE INTO friends (pet_id, friend_pet_id) VALUES (?, ?)").run(petId, friendPetId);
  db.prepare("INSERT OR IGNORE INTO friends (pet_id, friend_pet_id) VALUES (?, ?)").run(friendPetId, petId);

  return { ok: true };
}

export function removeFriend(petId: string, friendPetId: string) {
  const db = getDb();
  db.prepare("DELETE FROM friends WHERE pet_id = ? AND friend_pet_id = ?").run(petId, friendPetId);
  db.prepare("DELETE FROM friends WHERE pet_id = ? AND friend_pet_id = ?").run(friendPetId, petId);
}

// ── Plaza WebSocket handler ──

export function handlePlazaSocket(socket: WebSocket) {
  let myPetId = "";

  socket.on("message", async (raw: any) => {
    try {
      const data = JSON.parse(raw.toString());

      switch (data.type) {
        // ── Enter plaza ──
        case "enter": {
          const pet = getPet(data.petId);
          if (!pet) {
            socket.send(JSON.stringify({ type: "error", error: "Pet not found" }));
            return;
          }
          myPetId = data.petId;

          // Remove old connection if exists
          const old = plazaPets.get(myPetId);
          if (old && old.socket !== socket) {
            old.socket.close();
          }

          const plazaPet: PlazaPet = {
            petId: pet.id,
            userId: pet.user_id,
            name: pet.name,
            skin: pet.skin_id,
            expression: "happy",
            x: 120 + Math.random() * 160,
            y: 140 + Math.random() * 80,
            mood: pet.mood,
            animation: "idle",
            socket,
            lastActivity: Date.now(),
          };
          plazaPets.set(myPetId, plazaPet);

          // Send current plaza state to new pet
          socket.send(JSON.stringify({
            type: "plaza_state",
            pets: Array.from(plazaPets.values()).map(getPublicPetInfo),
            friends: getFriends(myPetId),
          }));

          // Broadcast new arrival to others
          broadcastToPlaza({
            type: "pet_enter",
            pet: getPublicPetInfo(plazaPet),
          }, myPetId);
          break;
        }

        // ── Move ──
        case "move": {
          if (!myPetId) return;
          const pet = plazaPets.get(myPetId);
          if (!pet) return;
          pet.x = Math.max(20, Math.min(380, data.x));
          pet.y = Math.max(120, Math.min(260, data.y));
          pet.animation = "walk";
          pet.lastActivity = Date.now();

          // Reset to idle after a short delay
          setTimeout(() => {
            if (plazaPets.has(myPetId!)) {
              plazaPets.get(myPetId!)!.animation = "idle";
              broadcastToPlaza({
                type: "pet_update",
                petId: myPetId,
                animation: "idle",
              });
            }
          }, 1000);

          broadcastToPlaza({
            type: "pet_move",
            petId: myPetId,
            x: pet.x,
            y: pet.y,
          });
          break;
        }

        // ── Emote (wave, love, etc.) ──
        case "emote": {
          if (!myPetId) return;
          const pet = plazaPets.get(myPetId);
          if (!pet) return;
          pet.animation = data.animation || "wave";
          pet.lastActivity = Date.now();

          broadcastToPlaza({
            type: "pet_emote",
            petId: myPetId,
            animation: data.animation,
            targetPetId: data.targetPetId || null,
          });

          // Reset to idle
          setTimeout(() => {
            if (plazaPets.has(myPetId!)) {
              plazaPets.get(myPetId!)!.animation = "idle";
            }
          }, 3000);
          break;
        }

        // ── Chat with another pet (AI-to-AI) ──
        case "pet_chat": {
          if (!myPetId) return;
          const targetPetId = data.targetPetId;
          if (!targetPetId || !plazaPets.has(targetPetId)) {
            socket.send(JSON.stringify({ type: "error", error: "Target pet not in plaza" }));
            return;
          }

          // My pet says something
          const myMessage = data.message || "你好呀！";

          // Record interaction
          const db = getDb();
          db.prepare("INSERT INTO plaza_interactions (from_pet_id, to_pet_id, action, message) VALUES (?, ?, 'chat', ?)").run(myPetId, targetPetId, myMessage);

          // Broadcast my message
          broadcastToPlaza({
            type: "plaza_chat",
            fromPetId: myPetId,
            toPetId: targetPetId,
            message: myMessage,
            isAiReply: false,
          });

          // Get AI response from target pet (uses Nova 2 Lite for cost)
          try {
            const result = await chat(targetPetId, `[来自广场上的${plazaPets.get(myPetId)?.name || "宠物"}说]: ${myMessage}`);
            broadcastToPlaza({
              type: "plaza_chat",
              fromPetId: targetPetId,
              toPetId: myPetId,
              message: result.text,
              isAiReply: true,
              animations: result.animations,
            });
          } catch (err: any) {
            console.error("Plaza AI chat error:", err.message);
          }
          break;
        }

        // ── Add friend ──
        case "add_friend": {
          if (!myPetId) return;
          const result = addFriend(myPetId, data.targetPetId);
          socket.send(JSON.stringify({ type: "friend_result", ...result, targetPetId: data.targetPetId }));

          // Notify the other pet
          const target = plazaPets.get(data.targetPetId);
          if (target && target.socket.readyState === 1) {
            const myPet = plazaPets.get(myPetId);
            target.socket.send(JSON.stringify({
              type: "friend_request",
              fromPetId: myPetId,
              fromPetName: myPet?.name || "???",
            }));
          }
          break;
        }

        // ── Ping ──
        case "ping": {
          socket.send(JSON.stringify({ type: "pong" }));
          if (myPetId) {
            const pet = plazaPets.get(myPetId);
            if (pet) pet.lastActivity = Date.now();
          }
          break;
        }
      }
    } catch (err: any) {
      socket.send(JSON.stringify({ type: "error", error: err.message }));
    }
  });

  // ── Disconnect ──
  socket.on("close", () => {
    if (myPetId && plazaPets.has(myPetId)) {
      plazaPets.delete(myPetId);
      broadcastToPlaza({ type: "pet_leave", petId: myPetId });
    }
  });
}

// ── Cleanup inactive pets (every 2 minutes) ──

setInterval(() => {
  const now = Date.now();
  for (const [petId, pet] of plazaPets) {
    if (now - pet.lastActivity > 5 * 60 * 1000) {
      pet.socket.close();
      plazaPets.delete(petId);
      broadcastToPlaza({ type: "pet_leave", petId });
    }
  }
}, 2 * 60 * 1000);
