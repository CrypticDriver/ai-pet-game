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
} from "./db.js";
import { chat, refreshAgent } from "./pet-agent.js";

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

// Chat (REST fallback)
app.post<{ Body: { petId: string; message: string } }>("/api/chat", async (req, reply) => {
  const { petId, message } = req.body;
  try {
    const response = await chat(petId, message);
    return { response, pet: getPet(petId) };
  } catch (err: any) {
    console.error("Chat error:", err.message);
    reply.code(500);
    return { error: "Chat failed", detail: err.message, pet: getPet(petId) };
  }
});

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
            const response = await chat(petId, message);
            const pet = getPet(petId);
            socket.send(JSON.stringify({ type: "message", petId, response, pet }));
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
});

// ---- Stats decay timer (every 5 minutes) ----

setInterval(() => {
  try {
    decayStats();
  } catch (e) {
    console.error("Stats decay error:", e);
  }
}, 5 * 60 * 1000);

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
