/**
 * Social Health Monitor
 * 
 * Detects and intervenes when pets are:
 * - Isolated (no social interaction for too long)
 * - Declining relationships (friendship strength dropping)
 * - Overly dependent (only interacting with one pet)
 * 
 * Intervention is gentle: environment events that encourage socialization,
 * not forced behavior changes.
 */

import { getDb } from "./db.js";

// ── Types ──

interface SocialHealthReport {
  petId: string;
  petName: string;
  status: "healthy" | "lonely" | "isolated" | "overly_dependent";
  friendCount: number;
  recentSocialCount: number;  // last 7 days
  daysSinceLastSocial: number;
  topFriend: string | null;
  recommendation: string | null;
}

// ── Health Check ──

/**
 * Generate a social health report for a pet.
 */
export function checkSocialHealth(petId: string): SocialHealthReport {
  const db = getDb();
  const pet = db.prepare("SELECT name FROM pets WHERE id = ?").get(petId) as any;
  if (!pet) throw new Error(`Pet not found: ${petId}`);

  // Friend count
  const friendCount = (db.prepare(
    "SELECT COUNT(*) as cnt FROM friends WHERE pet_id = ?"
  ).get(petId) as any).cnt;

  // Recent social interactions (7 days)
  const recentSocial = (db.prepare(`
    SELECT COUNT(*) as cnt FROM pet_activity_log
    WHERE pet_id = ? AND action_type IN ('social_chat_init', 'social_chat_reply', 'became_friends')
    AND created_at > datetime('now', '-7 days')
  `).get(petId) as any).cnt;

  // Days since last social interaction
  const lastSocial = db.prepare(`
    SELECT created_at FROM pet_activity_log
    WHERE pet_id = ? AND action_type IN ('social_chat_init', 'social_chat_reply', 'became_friends')
    ORDER BY id DESC LIMIT 1
  `).get(petId) as any;

  const daysSinceLastSocial = lastSocial
    ? Math.floor((Date.now() - new Date(lastSocial.created_at).getTime()) / 86400000)
    : 999;

  // Most interacted pet
  const topFriendRow = db.prepare(`
    SELECT target_pet_id, COUNT(*) as cnt FROM pet_social_memory
    WHERE pet_id = ? AND memory_type = 'conversation'
    GROUP BY target_pet_id ORDER BY cnt DESC LIMIT 1
  `).get(petId) as any;

  const topFriend = topFriendRow
    ? (db.prepare("SELECT name FROM pets WHERE id = ?").get(topFriendRow.target_pet_id) as any)?.name || null
    : null;

  // Determine status
  let status: SocialHealthReport["status"] = "healthy";
  let recommendation: string | null = null;

  if (daysSinceLastSocial >= 7) {
    status = "isolated";
    recommendation = "long_alone"; // Trigger: "附近有个Pix看起来也很想找人聊天"
  } else if (daysSinceLastSocial >= 3 || (recentSocial < 2 && friendCount === 0)) {
    status = "lonely";
    recommendation = "encourage_social"; // Trigger: "广场今天好热闹，想去看看吗？"
  } else if (friendCount === 1 && recentSocial > 5 && topFriendRow) {
    // Only one friend and heavily dependent
    const otherInteractions = (db.prepare(`
      SELECT COUNT(*) as cnt FROM pet_social_memory
      WHERE pet_id = ? AND memory_type = 'conversation' AND target_pet_id != ?
    `).get(petId, topFriendRow.target_pet_id) as any).cnt;

    if (otherInteractions === 0) {
      status = "overly_dependent";
      recommendation = "diversify_friends"; // Trigger: "Hub里来了一只新的Pix，好像很有趣"
    }
  }

  return {
    petId,
    petName: pet.name,
    status,
    friendCount,
    recentSocialCount: recentSocial,
    daysSinceLastSocial,
    topFriend,
    recommendation,
  };
}

/**
 * Check all pets and generate interventions for unhealthy ones.
 * Returns list of pets needing attention.
 */
export function checkAllSocialHealth(): SocialHealthReport[] {
  const db = getDb();
  const pets = db.prepare("SELECT id FROM pets").all() as Array<{ id: string }>;
  const reports: SocialHealthReport[] = [];

  for (const pet of pets) {
    try {
      const report = checkSocialHealth(pet.id);
      if (report.status !== "healthy") {
        reports.push(report);
      }
    } catch { /* skip */ }
  }

  return reports;
}

/**
 * Apply gentle interventions for lonely/isolated pets.
 * Creates activity log entries that look like environmental events.
 */
export function applyInterventions(reports: SocialHealthReport[]) {
  const db = getDb();

  for (const report of reports) {
    const interventions: Record<string, { description: string; emoji: string }> = {
      long_alone: {
        description: "听到远处Hub传来欢笑声，有点好奇...",
        emoji: "👂",
      },
      encourage_social: {
        description: "窗外飘来了好闻的味道，好像Hub那边在办活动",
        emoji: "🌸",
      },
      diversify_friends: {
        description: "听说Hub里来了一只从远方来的Pix，好像很有故事",
        emoji: "✨",
      },
    };

    const intervention = report.recommendation ? interventions[report.recommendation] : null;
    if (!intervention) continue;

    // Check if already intervened recently (1 per day max)
    const recent = db.prepare(`
      SELECT 1 FROM pet_activity_log
      WHERE pet_id = ? AND action_type = 'social_nudge'
      AND created_at > datetime('now', '-1 day')
      LIMIT 1
    `).get(report.petId);

    if (recent) continue;

    db.prepare(`
      INSERT INTO pet_activity_log (pet_id, action_type, action_data, location)
      VALUES (?, 'social_nudge', ?, 'room')
    `).run(report.petId, JSON.stringify({
      description: intervention.description,
      emoji: intervention.emoji,
      reason: report.status,
    }));

    console.log(`💝 Social nudge for ${report.petName} (${report.status}): ${intervention.description}`);
  }
}

/**
 * Run social health check and interventions.
 * Called periodically (every few hours).
 */
export function runSocialHealthCheck() {
  const reports = checkAllSocialHealth();
  if (reports.length > 0) {
    console.log(`🏥 Social health: ${reports.length} pets need attention`);
    applyInterventions(reports);
  }
}
