import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
  getOrCreateUser,
  getOrCreatePet,
  getPet,
  updatePetStats,
  updatePetSkin,
  getShopItems,
  getUserItems,
  purchaseItem,
  decayStats,
  getEquippedAccessories,
  equipAccessory,
  unequipAccessory,
  type AccessorySlot,
} from "./db.js";
import { chat, refreshAgent } from "./pet-agent.js";
import {
  initNotifications,
  generateNotifications,
  getUnreadNotifications,
  markNotificationsRead,
} from "./notifications.js";
import {
  initPlazaSchema,
  getPlazaPets,
  getFriends,
  addFriend,
  removeFriend,
  handlePlazaSocket,
} from "./plaza.js";
import {
  initAutonomousSchema,
  executeAutonomousBehavior,
  getPetActivityLog,
  getPetState,
  setPetLocation,
} from "./autonomous.js";
import { getWorldviewInfo } from "./worldview.js";
import { compressAllMemories } from "./memory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists
const dataDir = path.join(__dirname, "../../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const app = Fastify({ logger: true });

await app.register(fastifyCors, { origin: true });
await app.register(fastifyWebsocket);

// Serve static files in production
const distClient = path.join(__dirname, "../../dist/client");
if (fs.existsSync(distClient)) {
  await app.register(fastifyStatic, { root: distClient });
}

// ---- REST API ----

// Get or create user + pet
app.post<{ Body: { userId: string; username: string; petName?: string } }>("/api/init", async (req) => {
  const { userId, username, petName } = req.body;
  const user = getOrCreateUser(userId, username);
  const pet = getOrCreatePet(userId, petName);
  return { user, pet };
});

// Get pet status
app.get<{ Params: { petId: string } }>("/api/pet/:petId", async (req) => {
  const pet = getPet(req.params.petId);
  if (!pet) return { error: "Pet not found" };
  return pet;
});

// Feed pet
app.post<{ Params: { petId: string } }>("/api/pet/:petId/feed", async (req) => {
  const pet = getPet(req.params.petId);
  if (!pet) return { error: "Pet not found" };
  updatePetStats(req.params.petId, {
    hunger: Math.max(0, pet.hunger - 30),
    mood: Math.min(100, pet.mood + 5),
    energy: Math.min(100, pet.energy + 10),
  });
  return getPet(req.params.petId);
});

// Play with pet
app.post<{ Params: { petId: string } }>("/api/pet/:petId/play", async (req) => {
  const pet = getPet(req.params.petId);
  if (!pet) return { error: "Pet not found" };
  updatePetStats(req.params.petId, {
    mood: Math.min(100, pet.mood + 15),
    energy: Math.max(0, pet.energy - 10),
    affection: Math.min(100, pet.affection + 5),
    hunger: Math.min(100, pet.hunger + 5),
  });
  return getPet(req.params.petId);
});

// Rest pet
app.post<{ Params: { petId: string } }>("/api/pet/:petId/rest", async (req) => {
  const pet = getPet(req.params.petId);
  if (!pet) return { error: "Pet not found" };
  updatePetStats(req.params.petId, {
    energy: Math.min(100, pet.energy + 30),
    mood: Math.min(100, pet.mood + 5),
  });
  return getPet(req.params.petId);
});

// Change skin
app.post<{ Params: { petId: string }; Body: { skinId: string } }>("/api/pet/:petId/skin", async (req) => {
  updatePetSkin(req.params.petId, req.body.skinId);
  return getPet(req.params.petId);
});

// Shop
app.get("/api/shop", async () => {
  return getShopItems();
});

app.get<{ Params: { userId: string } }>("/api/shop/:userId/owned", async (req) => {
  return getUserItems(req.params.userId);
});

app.post<{ Body: { userId: string; itemId: string } }>("/api/shop/buy", async (req) => {
  return purchaseItem(req.body.userId, req.body.itemId);
});

// ---- Accessories ----

// Get equipped accessories for a pet
app.get<{ Params: { petId: string } }>("/api/pet/:petId/accessories", async (req) => {
  return getEquippedAccessories(req.params.petId);
});

// Equip an accessory
app.post<{ Params: { petId: string }; Body: { itemId: string; slot: AccessorySlot } }>(
  "/api/pet/:petId/accessories/equip",
  async (req) => {
    return equipAccessory(req.params.petId, req.body.itemId, req.body.slot);
  }
);

// Unequip an accessory slot
app.post<{ Params: { petId: string }; Body: { slot: AccessorySlot } }>(
  "/api/pet/:petId/accessories/unequip",
  async (req) => {
    unequipAccessory(req.params.petId, req.body.slot);
    return { ok: true };
  }
);

// Chat (REST fallback)
app.post<{ Body: { petId: string; message: string } }>("/api/chat", async (req, reply) => {
  const { petId, message } = req.body;
  try {
    const result = await chat(petId, message);
    return { response: result.text, animations: result.animations, pet: getPet(petId) };
  } catch (err: any) {
    console.error("Chat error:", err.message);
    reply.code(500);
    return { error: "Chat failed", detail: err.message, pet: getPet(petId) };
  }
});

// ---- Notifications ----

app.get<{ Params: { userId: string } }>("/api/notifications/:userId", async (req) => {
  return getUnreadNotifications(req.params.userId);
});

app.post<{ Params: { userId: string } }>("/api/notifications/:userId/read", async (req) => {
  markNotificationsRead(req.params.userId);
  return { ok: true };
});

// ---- Plaza (Social Area) ----

// Worldview API (public lore info)
app.get("/api/worldview", async () => {
  return getWorldviewInfo();
});

initPlazaSchema();
initAutonomousSchema();

// Get online pets in plaza
app.get("/api/plaza/pets", async () => {
  return getPlazaPets();
});

// Get friends list
app.get<{ Params: { petId: string } }>("/api/plaza/:petId/friends", async (req) => {
  return getFriends(req.params.petId);
});

// Add friend
app.post<{ Params: { petId: string }; Body: { friendPetId: string } }>(
  "/api/plaza/:petId/friend",
  async (req) => {
    return addFriend(req.params.petId, req.body.friendPetId);
  }
);

// Remove friend
app.post<{ Params: { petId: string }; Body: { friendPetId: string } }>(
  "/api/plaza/:petId/unfriend",
  async (req) => {
    removeFriend(req.params.petId, req.body.friendPetId);
    return { ok: true };
  }
);

// ---- Pet Autonomous Behavior ----

// Get activity log (what pet did while you were away)
app.get<{ Params: { petId: string }; Querystring: { limit?: string } }>(
  "/api/pet/:petId/activity",
  async (req) => {
    const limit = parseInt(req.query.limit || "20");
    return getPetActivityLog(req.params.petId, limit);
  }
);

// Get pet autonomous state (location, position, current action)
app.get<{ Params: { petId: string } }>("/api/pet/:petId/state", async (req) => {
  return getPetState(req.params.petId) || { location: "room", position_x: 160, position_y: 180, current_action: "idle" };
});

// Set pet location (room/plaza)
app.post<{ Params: { petId: string }; Body: { location: "room" | "plaza" } }>(
  "/api/pet/:petId/location",
  async (req) => {
    setPetLocation(req.params.petId, req.body.location);
    return { ok: true };
  }
);

// ---- WebSocket for real-time chat ----

app.register(async function (fastify) {
  fastify.get("/ws/chat", { websocket: true }, (socket, req) => {
    socket.on("message", async (raw: any) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "chat") {
          const { petId, message } = data;
          // Send typing indicator
          socket.send(JSON.stringify({ type: "typing", petId }));

          try {
            const result = await chat(petId, message);
            const pet = getPet(petId);
            socket.send(JSON.stringify({ type: "message", petId, response: result.text, animations: result.animations, pet }));
          } catch (chatErr: any) {
            console.error("WS chat error:", chatErr.message);
            socket.send(JSON.stringify({
              type: "message",
              petId,
              response: "（我有点迷糊了…再跟我说一次？）",
              error: chatErr.message,
            }));
          }
        } else if (data.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
        }
      } catch (err: any) {
        socket.send(JSON.stringify({ type: "error", error: err.message }));
      }
    });
  });
  // Plaza WebSocket
  fastify.get("/ws/plaza", { websocket: true }, (socket, req) => {
    handlePlazaSocket(socket);
  });
});

// ---- Stats decay timer (every 5 minutes) ----

setInterval(() => {
  try {
    decayStats();
  } catch (e) {
    console.error("Stats decay error:", e);
  }
}, 5 * 60 * 1000);

// ---- Autonomous behavior (every 42 seconds per boss directive) ----

setInterval(() => {
  try {
    executeAutonomousBehavior();
  } catch (e) {
    console.error("Autonomous behavior error:", e);
  }
}, 42 * 1000);

// Run once on startup
setTimeout(() => {
  try { executeAutonomousBehavior(); } catch {}
}, 2000);

// ---- Memory compression (every 5 minutes) ----

setInterval(() => {
  try { compressAllMemories(); } catch (e) { console.error("Memory compression error:", e); }
}, 5 * 60 * 1000);

// Compress once on startup
setTimeout(() => { try { compressAllMemories(); } catch {} }, 5000);

// ---- Notification generation (every 15 minutes) ----

initNotifications();

setInterval(() => {
  try {
    generateNotifications();
  } catch (e) {
    console.error("Notification generation error:", e);
  }
}, 15 * 60 * 1000);

// Run once on startup after a small delay
setTimeout(() => {
  try { generateNotifications(); } catch {}
}, 5000);

// ---- SPA fallback (production) ----

if (fs.existsSync(distClient)) {
  app.setNotFoundHandler(async (_req, reply) => {
    return reply.sendFile("index.html");
  });
}

// ---- Start server ----

const PORT = parseInt(process.env.PORT || "3000");
const HOST = process.env.HOST || "0.0.0.0";

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`🐾 AI Pet MVP server running on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
