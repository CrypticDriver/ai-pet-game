/**
 * World Events — Real-time WebSocket broadcast for world changes
 * 
 * Components can emit events, and all connected /ws/world clients receive them.
 */

import type { WebSocket } from "ws";

type WorldEventType = 
  | "pet_moved"       // Pet changed location
  | "pet_worked"      // Pet earned money
  | "relationship"    // Relationship changed
  | "economy"         // Transaction occurred
  | "language"        // New term detected
  | "emergence"       // Emergence event
  | "world_history"   // New history event
  | "guild"           // Guild created/changed
  | "pet_action";     // Autonomous action

interface WorldEvent {
  type: WorldEventType;
  data: any;
  timestamp: number;
}

const clients = new Set<WebSocket>();

/** Register a new world WS client */
export function addWorldClient(ws: WebSocket) {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
  // Send welcome
  ws.send(JSON.stringify({ type: "connected", clients: clients.size, timestamp: Date.now() }));
}

/** Broadcast an event to all connected world clients */
export function broadcastWorldEvent(type: WorldEventType, data: any) {
  if (clients.size === 0) return;
  const event: WorldEvent = { type, data, timestamp: Date.now() };
  const msg = JSON.stringify(event);
  for (const ws of clients) {
    try { ws.send(msg); } catch { clients.delete(ws); }
  }
}

/** Get current client count */
export function getWorldClientCount(): number {
  return clients.size;
}
