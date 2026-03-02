/**
 * Guild System — Pet组织/公会
 *
 * Pets自发组成公会（LLM提议，不是玩家创建）
 * 公会有领地、声望、规则
 * 规则由成员讨论产生（LLM协商）
 */

import { getDb, getPet } from "./db.js";

// ── Schema ──

export function initGuildSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      founder_pet_id TEXT NOT NULL,
      territory_location TEXT,
      reputation INTEGER DEFAULT 0,
      member_count INTEGER DEFAULT 1,
      rules TEXT DEFAULT '[]',
      motto TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS guild_members (
      guild_id TEXT NOT NULL,
      pet_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, pet_id)
    );
    CREATE INDEX IF NOT EXISTS idx_gm_pet ON guild_members(pet_id);
  `);
  console.log("🏰 Guild schema initialized");
}

// ── Types ──

export interface Guild {
  id: string;
  name: string;
  description: string;
  founder_pet_id: string;
  territory_location: string | null;
  reputation: number;
  member_count: number;
  rules: string;
  motto: string;
  created_at: string;
}

export interface GuildMember {
  guild_id: string;
  pet_id: string;
  role: string;
  joined_at: string;
}

// ── Core Functions ──

/** Create a new guild (Pet-initiated) */
export function createGuild(
  name: string,
  description: string,
  founderPetId: string,
  territoryLocation?: string
): { ok: boolean; guild?: Guild; error?: string } {
  const db = getDb();

  // Check if pet is already in a guild
  const existing = db.prepare(
    "SELECT guild_id FROM guild_members WHERE pet_id = ?"
  ).get(founderPetId) as { guild_id: string } | undefined;

  if (existing) {
    return { ok: false, error: "你已经有公会了" };
  }

  const id = `guild-${Date.now()}`;

  db.prepare(`
    INSERT INTO guilds (id, name, description, founder_pet_id, territory_location)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, description, founderPetId, territoryLocation || null);

  db.prepare(`
    INSERT INTO guild_members (guild_id, pet_id, role)
    VALUES (?, ?, 'founder')
  `).run(id, founderPetId);

  const guild = db.prepare("SELECT * FROM guilds WHERE id = ?").get(id) as Guild;
  return { ok: true, guild };
}

/** Join a guild */
export function joinGuild(
  guildId: string,
  petId: string
): { ok: boolean; error?: string } {
  const db = getDb();

  const existing = db.prepare(
    "SELECT guild_id FROM guild_members WHERE pet_id = ?"
  ).get(petId) as { guild_id: string } | undefined;

  if (existing) {
    return { ok: false, error: existing.guild_id === guildId ? "你已经在这个公会了" : "你已经有公会了" };
  }

  const guild = db.prepare("SELECT * FROM guilds WHERE id = ?").get(guildId) as Guild | undefined;
  if (!guild) return { ok: false, error: "公会不存在" };

  db.prepare("INSERT INTO guild_members (guild_id, pet_id) VALUES (?, ?)").run(guildId, petId);
  db.prepare("UPDATE guilds SET member_count = member_count + 1 WHERE id = ?").run(guildId);

  return { ok: true };
}

/** Leave a guild */
export function leaveGuild(petId: string): { ok: boolean; error?: string } {
  const db = getDb();

  const membership = db.prepare(
    "SELECT guild_id, role FROM guild_members WHERE pet_id = ?"
  ).get(petId) as GuildMember | undefined;

  if (!membership) return { ok: false, error: "你不在任何公会" };

  if (membership.role === "founder") {
    // Transfer or dissolve
    const otherMember = db.prepare(
      "SELECT pet_id FROM guild_members WHERE guild_id = ? AND pet_id != ? LIMIT 1"
    ).get(membership.guild_id, petId) as { pet_id: string } | undefined;

    if (otherMember) {
      db.prepare("UPDATE guild_members SET role = 'founder' WHERE guild_id = ? AND pet_id = ?")
        .run(membership.guild_id, otherMember.pet_id);
      db.prepare("UPDATE guilds SET founder_pet_id = ? WHERE id = ?")
        .run(otherMember.pet_id, membership.guild_id);
    } else {
      // Last member — dissolve
      db.prepare("DELETE FROM guilds WHERE id = ?").run(membership.guild_id);
    }
  }

  db.prepare("DELETE FROM guild_members WHERE pet_id = ?").run(petId);
  db.prepare("UPDATE guilds SET member_count = MAX(0, member_count - 1) WHERE id = ?").run(membership.guild_id);

  return { ok: true };
}

/** Get guild info with members */
export function getGuildInfo(guildId: string): (Guild & { members: Array<{ name: string; role: string; pet_id: string }> }) | null {
  const db = getDb();
  const guild = db.prepare("SELECT * FROM guilds WHERE id = ?").get(guildId) as Guild | undefined;
  if (!guild) return null;

  const members = db.prepare(
    "SELECT pet_id, role FROM guild_members WHERE guild_id = ? ORDER BY role DESC, joined_at ASC"
  ).all(guildId) as GuildMember[];

  return {
    ...guild,
    members: members.map(m => {
      const pet = getPet(m.pet_id);
      return { name: pet?.name || "未知", role: m.role, pet_id: m.pet_id };
    }),
  };
}

/** Get pet's guild */
export function getPetGuild(petId: string): Guild | null {
  const db = getDb();
  const membership = db.prepare(
    "SELECT guild_id FROM guild_members WHERE pet_id = ?"
  ).get(petId) as { guild_id: string } | undefined;

  if (!membership) return null;
  return db.prepare("SELECT * FROM guilds WHERE id = ?").get(membership.guild_id) as Guild || null;
}

/** List all guilds */
export function listGuilds(): Array<Guild & { founder_name: string }> {
  const db = getDb();
  const guilds = db.prepare("SELECT * FROM guilds ORDER BY reputation DESC, created_at ASC").all() as Guild[];
  return guilds.map(g => {
    const founder = getPet(g.founder_pet_id);
    return { ...g, founder_name: founder?.name || "未知" };
  });
}

/** Format guild context for LLM prompt */
export function guildToPrompt(petId: string): string {
  const guild = getPetGuild(petId);
  if (!guild) return "你还没有加入任何公会。";

  const info = getGuildInfo(guild.id);
  if (!info) return "你的公会信息丢失了...";

  const memberNames = info.members.map(m =>
    m.pet_id === petId ? `${m.name}（你, ${m.role}）` : `${m.name}（${m.role}）`
  );

  let text = `你的公会：${guild.name}`;
  if (guild.motto) text += `\n口号：${guild.motto}`;
  text += `\n成员：${memberNames.join("、")}`;
  text += `\n声望：${guild.reputation}`;

  return text;
}
