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
  getDb,
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
import { compressAllMemories, initMemorySchema } from "./memory.js";
import { initSoulSchema, evolveAllSouls, reflectAllPets } from "./soul.js";
import { runSocialHealthCheck } from "./social-health.js";
import { initMessageBusSchema, getMessageStats, cleanupExpiredMessages } from "./message-bus.js";
import { initLocationSchema, getAllLocations, getLocation, getPetsInLocation, movePet, getLocationPopulations, getRecentEvents, createLocationEvent } from "./locations.js";
import { getSchedulerStats } from "./llm-scheduler.js";
import { startAutonomousV2, stopAutonomousV2 } from "./autonomous-v2.js";
import { talkToPet, lookAround, goTo, formatPerception } from "./world-tools.js";
import { initRelationshipSchema, getRelationships, getRelationshipWith, recordInteraction, getClosestFriends } from "./relationships.js";
import { initEconomySchema, getWallet, getBalance, doWork, transfer, getAvailableWork, getTransactionHistory, getEconomyStats } from "./economy.js";
import { initGuildSchema, createGuild, joinGuild, leaveGuild, getGuildInfo, getPetGuild, listGuilds } from "./guilds.js";
import {
  initEmergenceSchema, getWorldHistory, getCulturalMemories, getEmergenceStats,
  detectGuildFormation, detectCulturalPatterns, detectEconomicTrends,
  recordWorldEvent, startEmergenceEngine, stopEmergenceEngine
} from "./emergence.js";
import { initLanguageSchema, getEvolvedTerms, getLanguageStats } from "./language.js";

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
initMemorySchema();
initSoulSchema();
initMessageBusSchema();
initLocationSchema();
initRelationshipSchema();
initEconomySchema();
initGuildSchema();
initEmergenceSchema();
initLanguageSchema();

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

// Get pet soul (personality)
app.get<{ Params: { petId: string } }>("/api/pet/:petId/soul", async (req) => {
  const { getPetSoul } = await import("./soul.js");
  return getPetSoul(req.params.petId);
});

// Get pet insights (daily reflections)
app.get<{ Params: { petId: string } }>("/api/pet/:petId/insights", async (req) => {
  const { getRecentInsights } = await import("./soul.js");
  return { insights: getRecentInsights(req.params.petId, 10) };
});

// Get pet social health
app.get<{ Params: { petId: string } }>("/api/pet/:petId/social-health", async (req) => {
  const { checkSocialHealth } = await import("./social-health.js");
  return checkSocialHealth(req.params.petId);
});

// ── World / Location APIs ──

// Get all locations
app.get("/api/world/locations", async () => {
  return getAllLocations();
});

// Get location details + pets there
app.get<{ Params: { locationId: string } }>("/api/world/location/:locationId", async (req) => {
  const loc = getLocation(req.params.locationId);
  if (!loc) return { error: "Location not found" };
  const pets = getPetsInLocation(req.params.locationId);
  const events = getRecentEvents(req.params.locationId, 60);
  return { ...loc, pets, events };
});

// Get world map (locations + populations)
app.get("/api/world/map", async () => {
  const locations = getAllLocations();
  const populations = getLocationPopulations();
  const popMap = Object.fromEntries(populations.map(p => [p.location_id, p.count]));
  return locations.map(loc => ({
    ...loc,
    petCount: popMap[loc.id] || 0,
    connects_to: JSON.parse(loc.connects_to || "[]"),
    ambient: JSON.parse(loc.ambient || "{}"),
  }));
});

// Move pet to a new location
app.post<{ Params: { petId: string }; Body: { destination: string } }>(
  "/api/pet/:petId/move",
  async (req) => {
    return movePet(req.params.petId, req.body.destination);
  }
);

// Get message stats
app.get("/api/world/message-stats", async () => {
  return getMessageStats();
});

// Get scheduler stats
app.get("/api/world/scheduler-stats", async () => {
  return getSchedulerStats();
});

// ── World Tool APIs ──

// Pet talks to another pet (LLM-to-LLM)
app.post<{ Params: { petId: string }; Body: { targetName: string; message: string } }>(
  "/api/pet/:petId/talk",
  async (req) => {
    return talkToPet(req.params.petId, req.body.targetName, req.body.message);
  }
);

// Pet looks around
app.get<{ Params: { petId: string } }>("/api/pet/:petId/perception", async (req) => {
  return lookAround(req.params.petId);
});

// Pet goes somewhere
app.post<{ Params: { petId: string }; Body: { destination: string } }>(
  "/api/pet/:petId/goto",
  async (req) => {
    return goTo(req.params.petId, req.body.destination);
  }
);

// Start/stop autonomous v2 (admin)
app.post("/api/admin/autonomous-v2/start", async () => {
  startAutonomousV2();
  return { ok: true, message: "Autonomous v2 started" };
});

app.post("/api/admin/autonomous-v2/stop", async () => {
  stopAutonomousV2();
  return { ok: true, message: "Autonomous v2 stopped" };
});

// ═══════════════════════════════════════
// Phase 2: Relationships
// ═══════════════════════════════════════

app.get<{ Params: { petId: string } }>("/api/pet/:petId/relationships", async (req) => {
  return getRelationships(req.params.petId);
});

app.get<{ Params: { petId: string; targetId: string } }>(
  "/api/pet/:petId/relationship/:targetId",
  async (req) => {
    return getRelationshipWith(req.params.petId, req.params.targetId) || { error: "未找到" };
  }
);

app.get<{ Params: { petId: string } }>("/api/pet/:petId/friends", async (req) => {
  return getClosestFriends(req.params.petId, 10);
});

// ═══════════════════════════════════════
// Phase 2: Economy
// ═══════════════════════════════════════

app.get<{ Params: { petId: string } }>("/api/pet/:petId/wallet", async (req) => {
  return getWallet(req.params.petId);
});

app.get<{ Params: { petId: string } }>("/api/pet/:petId/work", async (req) => {
  return getAvailableWork(req.params.petId);
});

app.post<{ Params: { petId: string }; Body: { job: string } }>(
  "/api/pet/:petId/work",
  async (req) => {
    return doWork(req.params.petId, req.body.job);
  }
);

app.post<{ Params: { petId: string }; Body: { targetPetId: string; amount: number; reason: "gift" | "trade" } }>(
  "/api/pet/:petId/transfer",
  async (req) => {
    return transfer(req.params.petId, req.body.targetPetId, req.body.amount, req.body.reason);
  }
);

app.get<{ Params: { petId: string } }>("/api/pet/:petId/transactions", async (req) => {
  return getTransactionHistory(req.params.petId);
});

app.get("/api/world/economy", async () => {
  return getEconomyStats();
});

app.get("/api/world/economy/wallets", async () => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT w.pet_id, p.name as pet_name, w.balance
    FROM pet_wallets w JOIN pets p ON w.pet_id = p.id
    ORDER BY w.balance DESC
  `).all();
  return rows;
});

app.get<{ Querystring: { limit?: string } }>("/api/world/economy/transactions", async (req) => {
  const db = getDb();
  const limit = parseInt(req.query.limit || "20");
  const rows = db.prepare(`
    SELECT t.id, t.amount, t.reason, t.description,
      t.from_pet_id, t.to_pet_id, t.created_at,
      p1.name as from_pet_name,
      p2.name as to_pet_name
    FROM transactions t
    LEFT JOIN pets p1 ON t.from_pet_id = p1.id
    LEFT JOIN pets p2 ON t.to_pet_id = p2.id
    ORDER BY t.id DESC LIMIT ?
  `).all(limit);
  return rows;
});

app.get("/api/world/social-graph", async () => {
  const db = getDb();
  const pets = db.prepare(`
    SELECT p.id, p.name, p.soul_json,
      COALESCE(ps.location, 'hub') as location
    FROM pets p LEFT JOIN pet_state ps ON p.id = ps.pet_id
  `).all() as any[];

  const nodes = pets.map(p => {
    let mbti = "";
    try { mbti = JSON.parse(p.soul_json || "{}").mbti || ""; } catch {}
    return { id: p.id, name: p.name, mbti, location: p.location };
  });

  const rels = db.prepare(`
    SELECT r.pet_id as "from", r.target_pet_id as "to",
      r.affinity, r.trust, r.type as level
    FROM relationships r
  `).all();

  return { nodes, edges: rels };
});

// ═══════════════════════════════════════
// Phase 2: Guilds
// ═══════════════════════════════════════

app.get("/api/guilds", async () => {
  return listGuilds();
});

app.get<{ Params: { guildId: string } }>("/api/guild/:guildId", async (req) => {
  return getGuildInfo(req.params.guildId) || { error: "公会不存在" };
});

app.get<{ Params: { petId: string } }>("/api/pet/:petId/guild", async (req) => {
  return getPetGuild(req.params.petId) || { guild: null };
});

app.post<{ Body: { name: string; description: string; founderPetId: string; territory?: string } }>(
  "/api/guild/create",
  async (req) => {
    return createGuild(req.body.name, req.body.description, req.body.founderPetId, req.body.territory);
  }
);

app.post<{ Params: { guildId: string }; Body: { petId: string } }>(
  "/api/guild/:guildId/join",
  async (req) => {
    return joinGuild(req.params.guildId, req.body.petId);
  }
);

app.post<{ Params: { petId: string } }>(
  "/api/pet/:petId/guild/leave",
  async (req) => {
    return leaveGuild(req.params.petId);
  }
);

// ═══════════════════════════════════════
// Phase 3: Emergence + Culture + History
// ═══════════════════════════════════════

app.get("/api/world/history", async (req) => {
  const limit = Number((req.query as any).limit) || 50;
  return getWorldHistory(limit);
});

app.get("/api/world/culture", async (req) => {
  const limit = Number((req.query as any).limit) || 20;
  return getCulturalMemories(limit);
});

app.get("/api/world/emergence", async () => {
  return getEmergenceStats();
});

app.post("/api/admin/emergence/detect", async () => {
  const [guilds, culture, economy] = await Promise.all([
    detectGuildFormation(),
    detectCulturalPatterns(),
    detectEconomicTrends(),
  ]);
  return { guilds, culture, economy };
});

app.post("/api/admin/emergence/start", async () => {
  startEmergenceEngine();
  return { ok: true, message: "Emergence engine started" };
});

app.post("/api/admin/emergence/stop", async () => {
  stopEmergenceEngine();
  return { ok: true, message: "Emergence engine stopped" };
});

app.post<{ Body: { eventType: string; title: string; description: string; petIds?: string[] } }>(
  "/api/world/history/record",
  async (req) => {
    recordWorldEvent(req.body.eventType, req.body.title, req.body.description, req.body.petIds || []);
    return { ok: true };
  }
);

// ═══════════════════════════════════════
// Phase 3: Language Evolution
// ═══════════════════════════════════════

app.get("/api/world/language", async () => {
  return getLanguageStats();
});

app.get("/api/world/language/terms", async (req) => {
  const status = (req.query as any).status;
  return getEvolvedTerms(status || undefined);
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

// ---- Daily reflection (every 6 hours, checks internally if already done today) ----

setInterval(() => {
  reflectAllPets().catch(e => console.error("Reflection error:", e));
}, 6 * 60 * 60 * 1000);

// ---- Weekly soul evolution (every 24 hours, checks internally if 7 days passed) ----

setInterval(() => {
  evolveAllSouls().catch(e => console.error("Soul evolution error:", e));
}, 24 * 60 * 60 * 1000);

// ---- Social health check (every 4 hours) ----

setInterval(() => {
  try { runSocialHealthCheck(); } catch (e) { console.error("Social health error:", e); }
}, 4 * 60 * 60 * 1000);

// Run once on startup (after 30s to let pets populate)
setTimeout(() => {
  try { runSocialHealthCheck(); } catch {}
}, 30000);

// ---- Message cleanup (every hour) ----

setInterval(() => {
  try {
    const cleaned = cleanupExpiredMessages();
    if (cleaned > 0) console.log(`🗑️ Cleaned ${cleaned} expired messages`);
  } catch {}
}, 60 * 60 * 1000);

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
