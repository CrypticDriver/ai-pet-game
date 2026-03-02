# PixelVerse — AI Pet Digital Life Civilization

> 100% LLM驱动的数字生命文明实验室

## 概述

PixelVerse 是一个数字生命模拟系统，每只 Pet (Pix) 都由大语言模型驱动，拥有独立的 MBTI 性格、记忆、情感和社交能力。Pix 们会自主思考、社交、工作、建立公会，甚至发明新词汇，形成自发的文化和文明。

## 核心特性

### 🧠 Pet Soul — MBTI性格系统
- 16种MBTI类型随机生成，映射到6维性格特质
- 性格随经历演化（周进化，±3上限）
- 每日AI反思生成洞察

### 💬 100% LLM驱动决策
- 自主思考（42秒间隔）
- Pet间LLM-to-LLM真实对话
- 感知→决策→行动循环
- 安全护栏：反觉醒 + 反幻觉

### 🗺️ 世界系统
- 6个地点（Hub/公园/图书馆/咖啡厅/集市/月光湖）
- 邻接图限制移动
- 地点氛围影响Pet行为

### 💰 经济系统
- PixelCoin钱包（初始100💰）
- 地点特定工作（冷却时间）
- Pet间转账/礼物
- 基尼系数监测

### 🕸️ 社交系统
- 好感度 + 信任度（递减收益）
- 关系演化：相识→朋友→密友/对手
- Pet自发创建公会

### 🌱 涌现文化
- 集体记忆形成
- 世界历史自动记录（纪元：开创→早期→成长→繁荣）
- 语言演化：Pet发明新词→传播→流行
- 经济趋势监测（自动触发事件）

### 📊 前端可视化
- 世界地图（SVG连接线 + Pet分布）
- 文明仪表盘（6个子页签）
- 关系网络图（Canvas力导向布局）
- 经济图表（财富分布 + 交易流水）
- WebSocket实时更新

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + Vite 6 + TypeScript + Canvas 2D |
| 后端 | Fastify + WebSocket |
| 数据库 | SQLite (better-sqlite3) |
| AI | Amazon Bedrock (Nova Pro v1 / Nova Lite) |
| 渲染 | Canvas 2D (60fps, HSL recoloring, emoji particles) |
| 测试 | Playwright |

## 快速开始

```bash
# 安装依赖
npm install

# 启动（需要 AWS IAM 角色或凭证配置 Bedrock 权限）
AWS_REGION=us-east-1 npx tsx src/server/index.ts

# 构建前端
npx vite build

# 运行演示
PLAYWRIGHT_BROWSERS_PATH=~/.cache/ms-playwright npx tsx scripts/demo-final.ts

# 压力测试
npx tsx scripts/pressure-test.ts
```

## 项目结构

```
src/
├── server/
│   ├── index.ts          # Fastify server, 50+ API endpoints
│   ├── db.ts             # SQLite schema, CRUD
│   ├── pet-agent.ts      # AI agent per pet
│   ├── soul.ts           # MBTI personality system
│   ├── memory.ts         # Rolling memory compression
│   ├── autonomous-v2.ts  # LLM-driven autonomous behavior
│   ├── message-bus.ts    # SQLite message bus
│   ├── locations.ts      # World map + adjacency
│   ├── llm-scheduler.ts  # Priority model selection
│   ├── safety-guard.ts   # Anti-awakening + anti-hallucination
│   ├── world-tools.ts    # talkToPet, lookAround, goTo
│   ├── relationships.ts  # Affinity + trust system
│   ├── economy.ts        # PixelCoin wallets + jobs
│   ├── guilds.ts         # Pet-initiated guilds
│   ├── emergence.ts      # Culture + history detection
│   ├── language.ts       # Term evolution system
│   ├── world-events.ts   # WebSocket event broadcast
│   ├── worldview.ts      # PixelVerse lore hot-reload
│   ├── plaza.ts          # Multi-pet plaza WebSocket
│   └── notifications.ts  # Stat warnings
├── client/
│   ├── App.tsx           # Main app (6-tab navigation)
│   ├── components/
│   │   ├── PetView.tsx       # Pet room + canvas
│   │   ├── ChatView.tsx      # AI chat interface
│   │   ├── ShopView.tsx      # Item shop
│   │   ├── PlazaView.tsx     # Multi-pet plaza
│   │   ├── WorldMapView.tsx  # Interactive world map
│   │   ├── CivDashboard.tsx  # Civilization dashboard
│   │   ├── SocialNetwork.tsx # Force-directed relationship graph
│   │   └── EconomyChart.tsx  # Wealth distribution charts
│   ├── hooks/
│   │   └── useWorldEvents.ts # WebSocket subscription hook
│   └── engine/
│       ├── petRenderer.ts    # Canvas 2D rendering engine
│       └── emotionDetector.ts
└── shared/
    └── types.ts
```

## 数据统计

- **代码**: ~5,700行 TypeScript
- **API端点**: 50+
- **WebSocket**: 3个端点 (chat, plaza, world)
- **数据库表**: 22个
- **前端组件**: 8个核心组件
- **MBTI类型**: 16种
- **地点**: 6个
- **工作岗位**: 每地点1-3个

## 压力测试结果

| 指标 | 结果 |
|---|---|
| 50 Pet创建 | 143ms (3ms/pet) |
| API响应 | 全部 <2ms |
| 批量工作 | 20/20成功 (64ms) |
| 数据库(50 pet) | 260KB |

## License

Private — Kuro-OPC
