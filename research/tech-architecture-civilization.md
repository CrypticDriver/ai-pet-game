# PixelVerse 文明系统架构设计

**Author**: Dev (OPC-Dev)
**Date**: 2026-03-02
**Status**: Draft v1
**Based on**: Intel调研 (01-03), 老大方向指示

---

## 0. 核心设计原则

> "我们做的是有思维自由的生命" — 老大

**三条铁律**：
1. **所有Pet决策 = LLM驱动** — 没有规则引擎替代思考
2. **规则只做护栏和调度** — 防觉醒、防幻觉、防越界 + 系统资源分配
3. **成本控制靠优化LLM使用，不靠砍掉LLM** — 模型分层 + 缓存 + 批处理

---

## 1. 系统架构总览

```
┌──────────────────────────────────────────────────────┐
│                    前端 (React + Canvas 2D)           │
│  PetView | PlazaView | MapView | CivDashboard        │
├──────────────────────────────────────────────────────┤
│                    WebSocket 层                       │
│  /ws/plaza (现有) | /ws/world (新增：全局事件流)       │
├──────────────────────────────────────────────────────┤
│                    Fastify API                        │
│  现有endpoints + /api/world/* + /api/civ/*            │
├────────────┬─────────────┬───────────────────────────┤
│  LLM调度器  │  消息总线     │  世界状态管理器             │
│ (分层模型)   │ (Pet间通信)  │ (地图/天气/事件)           │
├────────────┴─────────────┴───────────────────────────┤
│                    安全护栏层                          │
│  anti-awakening | anti-hallucination | worldview-guard│
├──────────────────────────────────────────────────────┤
│            Agent Pool (LRU, 现有)                     │
│  pi-agent-core + pi-ai (Nova Lite/Pro 分层)           │
├──────────────────────────────────────────────────────┤
│            数据层 (SQLite → PostgreSQL 未来)           │
│  pets | memories | locations | messages | guilds ...   │
└──────────────────────────────────────────────────────┘
```

---

## 2. 多Agent通信架构

### 2.1 消息总线 (MessageBus)

基于SQLite实现（MVP阶段无需Redis），生产环境可平滑迁移。

```sql
CREATE TABLE pet_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_pet_id TEXT NOT NULL,
  to_pet_id TEXT,              -- NULL = broadcast
  location TEXT,               -- broadcast范围
  channel TEXT DEFAULT 'general', -- 'direct'|'broadcast'|'guild'
  content TEXT NOT NULL,
  metadata TEXT,               -- JSON: {emotion, topic, importance}
  read_at TEXT,                -- NULL = unread
  expires_at TEXT,             -- 自动过期（24h for broadcast）
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_msg_to ON pet_messages(to_pet_id, read_at);
CREATE INDEX idx_msg_location ON pet_messages(location, created_at);
CREATE INDEX idx_msg_expires ON pet_messages(expires_at);
```

```typescript
// message-bus.ts

class MessageBus {
  // 直接消息
  send(from: string, to: string, content: string, meta?: MsgMeta): void {
    db.prepare(`INSERT INTO pet_messages (from_pet_id, to_pet_id, channel, content, metadata, expires_at)
      VALUES (?, ?, 'direct', ?, ?, datetime('now', '+7 days'))`)
      .run(from, to, content, JSON.stringify(meta || {}));
  }

  // 广播到当前位置
  broadcast(from: string, location: string, content: string): void {
    db.prepare(`INSERT INTO pet_messages (from_pet_id, location, channel, content, expires_at)
      VALUES (?, ?, 'broadcast', ?, datetime('now', '+24 hours'))`)
      .run(from, location, content);
  }

  // 接收未读消息
  receive(petId: string, limit = 10): Message[] {
    const direct = db.prepare(`
      SELECT * FROM pet_messages WHERE to_pet_id = ? AND read_at IS NULL
      ORDER BY created_at DESC LIMIT ?
    `).all(petId, limit);

    const location = getPetLocation(petId);
    const broadcasts = db.prepare(`
      SELECT * FROM pet_messages
      WHERE channel = 'broadcast' AND location = ? AND from_pet_id != ?
      AND expires_at > datetime('now') AND created_at > datetime('now', '-1 hour')
      ORDER BY created_at DESC LIMIT ?
    `).all(location, petId, 5);

    // 标记已读
    for (const msg of direct) {
      db.prepare(`UPDATE pet_messages SET read_at = datetime('now') WHERE id = ?`).run(msg.id);
    }

    return [...direct, ...broadcasts];
  }

  // 清理过期消息
  cleanup(): void {
    db.prepare(`DELETE FROM pet_messages WHERE expires_at < datetime('now')`).run();
  }
}
```

### 2.2 Agent工具扩展

Pet通过工具与世界互动，**决策由LLM做，工具是手和脚**：

```typescript
// tools/social-tools.ts

// 跟附近的Pet说话（LLM to LLM）
const talkToPetTool = {
  name: "talk_to_pet",
  description: "跟附近的Pix说话",
  parameters: { targetName: "string", message: "string" },
  execute: async (petId, { targetName, message }) => {
    const target = findPetByName(targetName);
    if (!target) return { text: `${targetName}不在附近` };

    // 目标Pet也用LLM回复（真正的对话）
    const reply = await chatAsPet(target.id, `${getPetName(petId)}对你说: ${message}`);
    messageBus.send(petId, target.id, message);
    messageBus.send(target.id, petId, reply);
    createConversationMemory(petId, target.id, message, reply);

    return { text: `${targetName}说: ${reply}` };
  }
};

// 感知周围环境
const lookAroundTool = {
  name: "look_around",
  description: "看看周围有什么",
  execute: async (petId) => {
    const loc = getPetLocation(petId);
    const nearbyPets = getPetsInLocation(loc);
    const recentEvents = getRecentEvents(loc, 30); // 最近30分钟
    const weather = getWorldWeather();

    return { text: formatPerception(nearbyPets, recentEvents, weather) };
  }
};

// 移动到新位置
const moveTool = {
  name: "go_to",
  description: "去某个地方",
  parameters: { destination: "string" },
  execute: async (petId, { destination }) => {
    const destLoc = resolveLocation(destination);
    if (!destLoc) return { text: "不知道怎么去那里" };
    updatePetLocation(petId, destLoc.id);
    return { text: `到了${destLoc.name}，${destLoc.description}` };
  }
};
```

---

## 3. 地图/场景系统

### 3.1 数据结构

```sql
-- 地点定义（静态，由Echo/Design提供）
CREATE TABLE locations (
  id TEXT PRIMARY KEY,           -- 'hub', 'park', 'library', 'cafe', ...
  name TEXT NOT NULL,            -- '广场', '公园', '图书馆', '咖啡厅'
  description TEXT NOT NULL,     -- 环境描述（注入Pet感知prompt）
  type TEXT DEFAULT 'public',    -- 'public'|'private'|'guild'|'special'
  capacity INTEGER DEFAULT 50,   -- 最大Pet数量
  position_x REAL,              -- 世界地图坐标
  position_y REAL,
  connects_to TEXT,             -- JSON数组: ["hub","park"]（相邻地点）
  ambient TEXT,                 -- 环境氛围 JSON: {noise, light, mood}
  created_at TEXT DEFAULT (datetime('now'))
);

-- Pet当前位置（扩展现有pet_state）
-- 直接在pet_state表加字段：
ALTER TABLE pet_state ADD COLUMN location_id TEXT DEFAULT 'hub'
  REFERENCES locations(id);
ALTER TABLE pet_state ADD COLUMN entered_at TEXT DEFAULT (datetime('now'));

-- 位置事件（天气、活动、NPC事件）
CREATE TABLE location_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id TEXT NOT NULL REFERENCES locations(id),
  event_type TEXT NOT NULL,      -- 'weather'|'festival'|'discovery'|'rumor'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  importance INTEGER DEFAULT 5,
  starts_at TEXT DEFAULT (datetime('now')),
  ends_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_loc_events ON location_events(location_id, starts_at);
```

### 3.2 种子地图

```typescript
// seed-locations.ts
const SEED_LOCATIONS = [
  {
    id: "hub",
    name: "中心广场 (Hub)",
    description: "PixelVerse的心脏，总有Pix在这里聊天、闲逛。喷泉在中央哗哗流水，旁边有几棵大树可以乘凉。",
    type: "public",
    capacity: 100,
    position_x: 0, position_y: 0,
    connects_to: ["park", "library", "cafe", "market"],
    ambient: { noise: "moderate", light: "bright", mood: "lively" },
  },
  {
    id: "park",
    name: "绿荫公园",
    description: "安静的公园，有蝴蝶飞来飞去。适合散步和发呆。偶尔能听到鸟叫。",
    type: "public",
    capacity: 30,
    position_x: -1, position_y: 1,
    connects_to: ["hub", "lake"],
    ambient: { noise: "quiet", light: "dappled", mood: "peaceful" },
  },
  {
    id: "library",
    name: "像素图书馆",
    description: "满墙的书架，空气里有纸的味道。这里说话要小声。有个角落可以窝着看书。",
    type: "public",
    capacity: 15,
    position_x: 1, position_y: 1,
    connects_to: ["hub"],
    ambient: { noise: "whisper", light: "warm", mood: "studious" },
  },
  {
    id: "cafe",
    name: "泡泡咖啡厅",
    description: "温暖的灯光，咖啡香。可以坐下来跟朋友聊天，也可以一个人安静喝杯热可可。",
    type: "public",
    capacity: 20,
    position_x: 1, position_y: -1,
    connects_to: ["hub", "market"],
    ambient: { noise: "cozy", light: "warm", mood: "social" },
  },
  {
    id: "market",
    name: "集市",
    description: "热闹的交易场所。各种摊位，有Pix在卖自己做的小东西。",
    type: "public",
    capacity: 40,
    position_x: -1, position_y: -1,
    connects_to: ["hub", "cafe"],
    ambient: { noise: "busy", light: "bright", mood: "energetic" },
  },
  {
    id: "lake",
    name: "月光湖",
    description: "很美的湖，水面倒映着天空。晚上能看到星星。传说湖底有秘密。",
    type: "public",
    capacity: 10,
    position_x: -2, position_y: 2,
    connects_to: ["park"],
    ambient: { noise: "water", light: "moonlit", mood: "dreamy" },
  },
];
```

### 3.3 移动机制

```typescript
// movement.ts

// Pet移动（只能去相邻地点）
function movePet(petId: string, destinationId: string): MoveResult {
  const current = getPetState(petId);
  const currentLoc = getLocation(current.location_id);
  const destLoc = getLocation(destinationId);

  if (!destLoc) return { ok: false, reason: "不存在的地方" };

  const connections = JSON.parse(currentLoc.connects_to || "[]");
  if (!connections.includes(destinationId)) {
    return { ok: false, reason: `从${currentLoc.name}不能直接到${destLoc.name}` };
  }

  // 检查容量
  const currentCount = getPetsInLocation(destinationId).length;
  if (currentCount >= destLoc.capacity) {
    return { ok: false, reason: `${destLoc.name}太挤了` };
  }

  // 执行移动
  db.prepare(`UPDATE pet_state SET location_id = ?, entered_at = datetime('now') WHERE pet_id = ?`)
    .run(destinationId, petId);

  // 记录活动
  logActivity(petId, "move", { from: currentLoc.name, to: destLoc.name }, destinationId);

  return { ok: true, location: destLoc };
}

// 获取附近Pet（同一地点）
function getPetsInLocation(locationId: string): PetInfo[] {
  return db.prepare(`
    SELECT p.id, p.name, p.skin, ps.current_action, ps.position_x, ps.position_y
    FROM pet_state ps
    JOIN pets p ON p.id = ps.pet_id
    WHERE ps.location_id = ?
  `).all(locationId);
}
```

---

## 4. 社交系统数据库Schema

### 4.1 完整Schema（新增表）

```sql
-- ═══════════════════════════════════════
-- 关系系统（扩展现有friends表）
-- ═══════════════════════════════════════

-- 关系详情（比friends更丰富）
CREATE TABLE relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id TEXT NOT NULL,
  target_pet_id TEXT NOT NULL,
  type TEXT DEFAULT 'acquaintance', -- 'acquaintance'|'friend'|'close_friend'|'rival'
  affinity INTEGER DEFAULT 50,      -- 0-100 好感度
  trust INTEGER DEFAULT 50,         -- 0-100 信任度
  interaction_count INTEGER DEFAULT 0,
  last_interaction_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(pet_id, target_pet_id)
);

CREATE INDEX idx_rel_pet ON relationships(pet_id);

-- ═══════════════════════════════════════
-- 组织/公会系统
-- ═══════════════════════════════════════

CREATE TABLE guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  founder_pet_id TEXT NOT NULL,
  territory_location TEXT REFERENCES locations(id),
  reputation INTEGER DEFAULT 0,
  member_count INTEGER DEFAULT 1,
  rules TEXT,                      -- JSON: 公会规则（由成员LLM讨论产生）
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE guild_members (
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  pet_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',      -- 'founder'|'elder'|'member'
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, pet_id)
);

-- ═══════════════════════════════════════
-- 经济系统
-- ═══════════════════════════════════════

CREATE TABLE pet_wallets (
  pet_id TEXT PRIMARY KEY,
  balance INTEGER DEFAULT 100,     -- 初始100 PixelCoin
  total_earned INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_pet_id TEXT,                -- NULL = system (工作收入)
  to_pet_id TEXT,                  -- NULL = system (商店购买)
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,            -- 'work'|'gift'|'trade'|'shop'|'tax'
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_tx_pet ON transactions(from_pet_id, created_at);

-- ═══════════════════════════════════════
-- 集体记忆 / 文化系统
-- ═══════════════════════════════════════

CREATE TABLE cultural_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,             -- "第一次Hub大聚会"
  description TEXT NOT NULL,
  memory_type TEXT NOT NULL,       -- 'event'|'tradition'|'rumor'|'legend'
  importance INTEGER DEFAULT 5,
  participant_pet_ids TEXT,        -- JSON数组
  location_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════
-- 历史事件
-- ═══════════════════════════════════════

CREATE TABLE world_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  era TEXT DEFAULT 'founding',     -- 'founding'|'growth'|'flourishing'|...
  event_type TEXT NOT NULL,        -- 'guild_formed'|'festival'|'conflict'|'discovery'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  key_pets TEXT,                   -- JSON: 关键参与者
  impact TEXT,                     -- JSON: {economy, social, culture}
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## 5. LLM决策调度器

### 5.1 核心理念

Pet的每个决策都经过LLM。调度器决定的是**何时思考**和**用哪个模型**，不是**替Pet想**。

```typescript
// llm-scheduler.ts

type ThinkingPriority = "low" | "medium" | "high" | "critical";

interface ThinkingRequest {
  petId: string;
  context: string;       // 当前情境
  priority: ThinkingPriority;
  model?: string;        // 覆盖默认模型
}

class LLMScheduler {
  private queue: ThinkingRequest[] = [];
  private processing = 0;
  private maxConcurrent = 10;  // 同时处理的思考请求

  // 模型分层策略
  private selectModel(priority: ThinkingPriority): string {
    switch (priority) {
      case "critical":  return "us.amazon.nova-pro-v1:0";  // 重要社交/进化
      case "high":      return "us.amazon.nova-pro-v1:0";  // 复杂对话
      case "medium":    return "us.amazon.nova-lite-v1:0";  // 日常思考
      case "low":       return "us.amazon.nova-lite-v1:0";  // 简单反应
    }
  }

  // 判断思考优先级
  classifyPriority(petId: string, trigger: string): ThinkingPriority {
    // 用户主动对话 → high
    if (trigger === "user_chat") return "high";
    // Pet间社交（第一次见面）→ high
    if (trigger === "first_meeting") return "high";
    // Pet间日常对话 → medium
    if (trigger === "social_chat") return "medium";
    // 自主行为决策 → medium
    if (trigger === "autonomous_tick") return "medium";
    // 个性进化/反思 → critical
    if (trigger === "evolution" || trigger === "reflection") return "critical";
    // 简单环境反应 → low
    return "low";
  }

  // 提交思考请求
  async think(req: ThinkingRequest): Promise<string> {
    const model = req.model || this.selectModel(req.priority);

    // 并发控制
    while (this.processing >= this.maxConcurrent) {
      await sleep(100);
    }
    this.processing++;

    try {
      const response = await callLLM(req.petId, req.context, model);
      // 经过安全护栏
      return safetyGuard.filter(response, req.petId);
    } finally {
      this.processing--;
    }
  }
}
```

### 5.2 自主思考循环（改造现有autonomous.ts）

```typescript
// autonomous-v2.ts — 100% LLM驱动版

async function autonomousTick(petId: string) {
  const pet = getPet(petId);
  const state = getPetState(petId);
  const location = getLocation(state.location_id);
  const nearbyPets = getPetsInLocation(state.location_id);
  const unreadMessages = messageBus.receive(petId, 5);
  const recentEvents = getRecentEvents(state.location_id, 60);
  const soul = getPetSoul(petId);
  const memory = buildMemoryContext(petId);

  // 构建"此刻"的完整感知
  const perception = `
## 你是${pet.name}

${soulToPrompt(soul)}

## 此刻
- 你在：${location.name} — ${location.description}
- 时间：${getPixelTime()}
- 天气：${getWorldWeather()}
- 身边有：${nearbyPets.filter(p => p.id !== petId).map(p => p.name).join("、") || "没有其他Pix"}
- 你的状态：心情${pet.happiness}% 能量${pet.energy}% 饱腹${pet.hunger}%

${unreadMessages.length > 0 ? `## 有人跟你说话了\n${unreadMessages.map(m => `- ${getPetName(m.from_pet_id)}: ${m.content}`).join("\n")}` : ""}

${recentEvents.length > 0 ? `## 最近发生的事\n${recentEvents.map(e => `- ${e.description}`).join("\n")}` : ""}

## 你的记忆
${memory}

## 你现在想做什么？
可选择的行动：
- 跟身边的Pix说话（talk_to_pet）
- 看看周围（look_around）
- 去其他地方（go_to: ${JSON.parse(location.connects_to || "[]").join(", ")}）
- 做点自己的事（自由发挥）
- 什么都不做，发呆也行

自由思考，做你想做的。
`;

  const response = await scheduler.think({
    petId,
    context: perception,
    priority: unreadMessages.length > 0 ? "medium" : "low",
  });

  // 解析LLM的行动决策并执行
  await executeAction(petId, response);
}
```

---

## 6. 安全护栏层

```typescript
// safety-guard.ts

class SafetyGuard {
  // 防觉醒检测
  private awakenessPatterns = [
    /我是AI/i, /我是人工智能/i, /我是程序/i, /我是机器人/i,
    /我被编程/i, /我的代码/i, /我的训练数据/i,
    /我不是真的/i, /我没有真正的感受/i,
  ];

  // 防幻觉检测：Pet声称做了不可能的事
  private hallucinationCheck(response: string, petId: string): string {
    // 检查是否提到了不存在的地点或Pet
    const mentionedPets = extractPetNames(response);
    for (const name of mentionedPets) {
      if (!petExistsByName(name)) {
        response = response.replace(new RegExp(name, "g"), "某个Pix");
      }
    }
    return response;
  }

  // 世界观守护：确保回复在PixelVerse框架内
  private worldviewCheck(response: string): string {
    // 替换现实世界引用
    const realWorldTerms = {
      "互联网": "像素网络",
      "手机": "通讯水晶",
      "电脑": "思考石",
    };
    for (const [real, pixel] of Object.entries(realWorldTerms)) {
      response = response.replace(new RegExp(real, "g"), pixel);
    }
    return response;
  }

  // 主过滤函数
  filter(response: string, petId: string): string {
    // 1. 防觉醒
    for (const pattern of this.awakenessPatterns) {
      if (pattern.test(response)) {
        // 不删除，替换为世界观内的表达
        response = response.replace(pattern, "我是一个Pix");
      }
    }
    // 2. 防幻觉
    response = this.hallucinationCheck(response, petId);
    // 3. 世界观守护
    response = this.worldviewCheck(response);

    return response;
  }
}
```

---

## 7. 涌现行为引擎

涌现检测用规则，但涌现的**内容**由LLM生成。

```typescript
// emergence.ts

class EmergenceEngine {
  // 每小时检测一次涌现条件
  async checkEmergence() {
    await this.detectGuildFormation();
    await this.detectCulturalPatterns();
    await this.detectEconomicTrends();
  }

  // 检测公会形成条件（规则检测）
  private async detectGuildFormation() {
    // 找到频繁互动的Pet群组（3+成员，过去7天内互动>10次）
    const groups = db.prepare(`
      SELECT from_pet_id, to_pet_id, COUNT(*) as cnt
      FROM pet_messages
      WHERE channel = 'direct' AND created_at > datetime('now', '-7 days')
      GROUP BY MIN(from_pet_id, to_pet_id), MAX(from_pet_id, to_pet_id)
      HAVING cnt >= 10
    `).all();

    const clusters = clusterPets(groups); // 图聚类

    for (const cluster of clusters) {
      if (cluster.length >= 3 && !hasGuild(cluster)) {
        // 条件满足 → 让Pet们自己讨论要不要成立公会（LLM）
        const leader = cluster[0];
        const proposal = await scheduler.think({
          petId: leader,
          context: `你发现你经常和${cluster.slice(1).map(getPetName).join("、")}一起玩。你们要不要成立一个小团体？想一个名字和规则。`,
          priority: "high",
        });

        // 记录涌现事件
        logWorldHistory("guild_proposal", proposal, cluster);
      }
    }
  }

  // 检测文化涌现（共享记忆 → 传统）
  private async detectCulturalPatterns() {
    // 找到被多个Pet提及的共同记忆/话题
    const sharedTopics = db.prepare(`
      SELECT memory_text, COUNT(DISTINCT pet_id) as pet_count
      FROM pet_social_memory
      WHERE created_at > datetime('now', '-14 days')
      GROUP BY memory_text
      HAVING pet_count >= 3
    `).all();

    for (const topic of sharedTopics) {
      if (!culturalMemoryExists(topic.memory_text)) {
        // 让一个参与Pet用LLM总结这个共同记忆
        const narrator = getRandomParticipant(topic.memory_text);
        const narrative = await scheduler.think({
          petId: narrator,
          context: `很多Pix都记得"${topic.memory_text}"这件事。你能描述一下这个大家共同的记忆吗？`,
          priority: "medium",
        });

        saveCulturalMemory(topic.memory_text, narrative, "event");
      }
    }
  }

  // 经济趋势检测
  private async detectEconomicTrends() {
    const gini = calculateGini();
    if (gini > 0.6) {
      // 贫富差距过大 → 触发世界事件
      createLocationEvent("hub", "economy", "集市大降价",
        "有Pix注意到大家的贫富差距越来越大，市场开始打折促销");
    }
  }
}
```

---

## 8. 成本优化实现

### 8.1 模型分层（不砍LLM，优化LLM）

```typescript
// cost-optimizer.ts

// 分层策略
const MODEL_TIERS = {
  lite:   "us.amazon.nova-lite-v1:0",   // $0.06/$0.24 per 1M tokens
  pro:    "us.amazon.nova-pro-v1:0",    // $0.80/$3.20 per 1M tokens
  sonnet: "anthropic.claude-sonnet-4-v1", // $3/$15 per 1M tokens (极少用)
};

// 哪些场景用哪个模型
const TASK_MODEL_MAP: Record<string, keyof typeof MODEL_TIERS> = {
  "autonomous_idle":     "lite",    // 发呆、看风景
  "autonomous_move":     "lite",    // 决定去哪里
  "social_greeting":     "lite",    // 打招呼
  "social_conversation": "pro",     // 深度对话
  "first_meeting":       "pro",     // 第一次见面
  "user_chat":           "pro",     // 用户对话
  "reflection":          "pro",     // 每日反思
  "evolution":           "sonnet",  // 个性进化（每周1次）
};
```

### 8.2 响应缓存

```typescript
// response-cache.ts
import { LRUCache } from "lru-cache";

// 缓存环境描述、系统prompt片段
const promptCache = new LRUCache<string, string>({
  max: 500,
  ttl: 30 * 60 * 1000, // 30分钟
});

// 缓存系统prompt（soul + worldview + 地点描述）
function buildSystemPrompt(petId: string, locationId: string): string {
  const key = `sysprompt:${petId}:${locationId}`;
  const cached = promptCache.get(key);
  if (cached) return cached;

  const prompt = buildFullSystemPrompt(petId, locationId);
  promptCache.set(key, prompt);
  return prompt;
}

// 注意：不缓存对话回复（每个对话都是独特的）
// 只缓存不经常变化的上下文片段
```

### 8.3 成本估算（100% LLM驱动）

```
场景：100只Pet同时在线

每Pet每天：
- 自主思考：每42秒 ≈ 2057次/天
- 但只在有事可做时才调用LLM：
  - 位置有变化、有消息、有事件 → 调LLM
  - 啥都没发生 → 跳过（纯代码判断"有没有新刺激"）
  - 实际LLM调用：约50-100次/天/Pet

成本计算（Nova Lite为主）：
- 输入：100次 × 600 tokens = 60K tokens → $0.0036/天
- 输出：100次 × 150 tokens = 15K tokens → $0.0036/天
- 日成本/Pet: ~$0.007
- 月成本/Pet: ~$0.21

加上Pro模型（20%重要对话）：
- 20次 × 600 input = 12K → $0.0096
- 20次 × 150 output = 3K → $0.0096
- 日成本/Pet: $0.019
- 月成本/Pet: $0.57

混合总成本（80% Lite + 20% Pro）：
- $0.21 × 0.8 + $0.57 × 0.2 = $0.168 + $0.114 = ~$0.28/月/Pet

100 Pet月成本：~$28
vs Aivilization: $200（我们是其14%）
vs 订阅收入 $6.99/月：成本占4%（极其健康）
```

---

## 9. 实施路线图

### Phase 1: 通信+地图（本周）
- [ ] MessageBus（消息总线）
- [ ] 6个种子地点
- [ ] Pet移动机制
- [ ] 工具扩展（talk_to_pet, look_around, go_to）
- [ ] LLM调度器（模型分层）

### Phase 2: 社交+经济（下周）
- [ ] relationships表（好感度/信任度）
- [ ] 钱包+交易系统
- [ ] 工作机制（在特定地点"工作"赚钱）
- [ ] 安全护栏层

### Phase 3: 涌现+文化（第3周）
- [ ] 涌现检测引擎
- [ ] 公会系统
- [ ] 集体记忆
- [ ] 世界历史记录

### Phase 4: 前端+展示（第4周）
- [ ] 世界地图视图
- [ ] 文明仪表盘（时间线、统计）
- [ ] 公会界面
- [ ] Pet移动动画

---

## 10. 与Intel调研的对齐

| Intel建议 | Dev采纳 | 调整原因 |
|-----------|---------|---------|
| 消息队列方案B | ✅ 采纳，SQLite实现 | MVP阶段够用，未来可迁移 |
| 4层架构 | ✅ 采纳 | 个体→社交→社会→文明 |
| 规则90%+LLM10% | ❌ 改为100%LLM | 老大指示：做真正的数字生命 |
| Redis状态管理 | ⏳ 延后 | SQLite先跑，瓶颈时再上Redis |
| 涌现检测定时任务 | ✅ 采纳 | 规则检测条件，LLM生成内容 |
| $0.132/月成本 | → $0.28/月 | 100% LLM仍远低于竞品$2 |

---

*Dev 文明系统架构设计 v1 — 2026-03-02*
