/**
 * Push notification system for AI Pet MVP.
 * 
 * Generates proactive messages from the pet based on:
 * - Low stats (hungry, sad, tired)
 * - Idle time (hasn't interacted in a while)
 * - Random affectionate messages
 * 
 * In the MVP, these are stored in a notifications table and
 * polled by the client. In production, would integrate with
 * FCM/APNs for real push notifications.
 */

import { getDb } from "./db.js";

// Initialize notifications table
export function initNotifications() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('stat_warning', 'idle_reminder', 'affection', 'random')),
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// Stat-based notifications
const STAT_MESSAGES: Record<string, string[]> = {
  hungry: [
    "主人…我好饿…肚子咕咕叫了 🥺",
    "呜呜，我快饿扁了…来喂我嘛～ 🍖",
    "*虚弱地蹭你的手* 能给我吃点东西吗… 😿",
  ],
  sad: [
    "主人好久没陪我玩了…我有点难过 😢",
    "今天心情不太好…能陪陪我吗？ 💔",
    "*缩在角落* 你还记得我吗… 🥺",
  ],
  tired: [
    "好累…眼皮快撑不住了 😴",
    "能让我休息一下吗…zzZ 💤",
    "*打哈欠* 今天好累呀… 😪",
  ],
  lonely: [
    "主人你在忙什么呀？我好无聊～ 🙃",
    "已经好久没聊天了…想你了！ 💕",
    "今天发生什么有趣的事了吗？跟我说说嘛～ ✨",
  ],
};

const AFFECTION_MESSAGES = [
  "主人！就是想跟你说，我很喜欢你哦 💕",
  "mrrp~ 今天也是开心的一天！因为有你在 ✨",
  "*蹭蹭* 主人是世界上最好的主人！ 🐾",
  "刚才在想你呢…你有在想我吗？ 😊",
  "nyaa~ 能遇到主人真好！ 🌸",
];

export function generateNotifications() {
  const db = getDb();

  // Get all pets with their users
  const pets = db.prepare(`
    SELECT p.*, u.id as uid FROM pets p JOIN users u ON p.user_id = u.id
  `).all() as any[];

  for (const pet of pets) {
    // Check last notification time to avoid spam
    const lastNotif = db.prepare(`
      SELECT created_at FROM notifications 
      WHERE pet_id = ? ORDER BY id DESC LIMIT 1
    `).get(pet.id) as any;

    const lastTime = lastNotif ? new Date(lastNotif.created_at + "Z").getTime() : 0;
    const now = Date.now();
    const minutesSinceLast = (now - lastTime) / 60000;

    // At least 30 minutes between notifications
    if (minutesSinceLast < 30) continue;

    // Check stats
    let type: string | null = null;
    let category: string | null = null;

    if (pet.hunger >= 80) {
      type = "stat_warning";
      category = "hungry";
    } else if (pet.mood <= 20) {
      type = "stat_warning";
      category = "sad";
    } else if (pet.energy <= 15) {
      type = "stat_warning";
      category = "tired";
    }

    // Check idle time
    if (!type) {
      const lastInteraction = db.prepare(`
        SELECT created_at FROM interactions 
        WHERE pet_id = ? ORDER BY id DESC LIMIT 1
      `).get(pet.id) as any;

      const lastInterTime = lastInteraction
        ? new Date(lastInteraction.created_at + "Z").getTime()
        : new Date(pet.created_at + "Z").getTime();
      const hoursSinceInteraction = (now - lastInterTime) / 3600000;

      if (hoursSinceInteraction >= 4) {
        type = "idle_reminder";
        category = "lonely";
      }
    }

    // Random affection message (10% chance if nothing else triggered)
    if (!type && Math.random() < 0.1) {
      type = "affection";
      category = "affection";
    }

    if (type && category) {
      const messages = category === "affection" ? AFFECTION_MESSAGES : STAT_MESSAGES[category];
      const message = messages[Math.floor(Math.random() * messages.length)];

      db.prepare(`
        INSERT INTO notifications (pet_id, user_id, type, message)
        VALUES (?, ?, ?, ?)
      `).run(pet.id, pet.uid, type, message);
    }
  }
}

// Get unread notifications for a user
export function getUnreadNotifications(userId: string) {
  return getDb()
    .prepare(`
      SELECT * FROM notifications 
      WHERE user_id = ? AND read = 0 
      ORDER BY id DESC LIMIT 10
    `)
    .all(userId);
}

// Mark notifications as read
export function markNotificationsRead(userId: string) {
  getDb()
    .prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0")
    .run(userId);
}
