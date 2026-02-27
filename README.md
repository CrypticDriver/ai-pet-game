# 🐾 AI Pet - 你的像素伙伴

> AI 驱动的虚拟宠物养成游戏 MVP

![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![pi-agent-core](https://img.shields.io/badge/pi--agent--core-0.55-green)

## ✨ 功能特色

### 🤖 AI 个性对话
- 基于 **pi-agent-core** 的智能宠物 Agent
- 每只宠物有独立的性格和记忆
- 情感反应工具：宠物会根据对话内容自主调整情绪
- 对话历史持久化，宠物会"记住"你们的交流

### 🍖 养成系统
- **心情**（Mood）：互动和玩耍提升，长时间不理会下降
- **能量**（Energy）：休息恢复，玩耍消耗
- **饱食**（Hunger）：喂食降低饥饿值，随时间增加
- **亲密度**（Affection）：每次互动积累，解锁更多反应
- 统计值每 5 分钟自然衰减，宠物需要持续关注

### 🎨 装扮系统
- 5 款皮肤：Default / Ocean Blue / Sunset Glow / Forest Green / Galaxy
- 商城购买 + 一键换装
- 每款皮肤改变宠物配色方案和背景氛围

### 📱 推送通知
- 饥饿/心情/能量过低时自动提醒
- 长时间未互动时宠物会"想你"
- 随机撒娇消息（10% 概率触发）
- 中文对话，情感丰富

### 🐱 像素宠物
- SVG 渲染的像素风宠物
- 4 种情绪动画：开心 / 难过 / 困倦 / 中性
- CSS 动画：弹跳、摇摆、缓慢呼吸
- 表情粒子效果（✨、💧、zzZ）

---

## 🏗️ 技术架构

```
┌──────────────┐     WebSocket/REST    ┌──────────────────┐
│   React UI   │◄────────────────────►│   Fastify Server  │
│  (Vite SPA)  │                       │                   │
│              │                       │  ┌──────────────┐ │
│  • PetView   │                       │  │ pi-agent-core│ │
│  • ChatView  │                       │  │   (Agent)    │ │
│  • ShopView  │                       │  └──────┬───────┘ │
└──────────────┘                       │         │         │
                                       │  ┌──────▼───────┐ │
                                       │  │   SQLite DB   │ │
                                       │  │  (better-     │ │
                                       │  │   sqlite3)    │ │
                                       │  └──────────────┘ │
                                       └──────────────────┘
```

### 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| AI 引擎 | `@mariozechner/pi-agent-core` | 宠物 Agent 管理 |
| AI 模型 | `@mariozechner/pi-ai` (Anthropic Claude via **Bedrock** 或直连) | 对话生成 |
| 后端 | Fastify 5 + TypeScript | REST API + WebSocket |
| 数据库 | SQLite (better-sqlite3) | 用户/宠物/商品/对话 |
| 前端 | React 19 + Vite 6 | SPA 单页应用 |
| 样式 | 纯 CSS + CSS Animations | 像素风深色主题 |

### 数据模型

```
users ──1:N──► pets ──1:N──► interactions
                │
                └──► user_items ◄──── items (shop)
                │
                └──► notifications
```

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm

### 安装

```bash
git clone https://github.com/CrypticDriver/ai-pet-game.git
cd ai-pet-game
npm install
```

### 配置

```bash
cp .env.example .env
# 编辑 .env，选择你的 AI 提供商
```

#### 方式一：Amazon Bedrock（推荐）

```env
AI_PROVIDER=amazon-bedrock
AI_MODEL=us.anthropic.claude-sonnet-4-20250514-v1:0
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
```

#### 方式二：Anthropic 直连

```env
AI_PROVIDER=anthropic
AI_MODEL=claude-sonnet-4-20250514
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

> 💡 如果设置了 `AWS_ACCESS_KEY_ID`，会自动使用 Bedrock，无需额外配置 `AI_PROVIDER`。

### 开发模式

```bash
# 启动后端（热重载）
npm run dev:server

# 另一个终端，启动前端（Vite dev server）
npm run dev:client
```

访问 `http://localhost:5173`

### 生产构建

```bash
npm run build
npm start
```

### Docker 部署

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 AWS/Anthropic 凭证

# 启动
docker compose up -d

# 查看日志
docker compose logs -f
```

访问 `http://your-server:3000`

---

## 📁 项目结构

```
ai-pet-game/
├── src/
│   ├── server/
│   │   ├── index.ts          # Fastify 服务器 + 路由
│   │   ├── db.ts             # SQLite 数据库层
│   │   ├── pet-agent.ts      # pi-agent-core 宠物 Agent
│   │   └── notifications.ts  # 推送通知系统
│   ├── client/
│   │   ├── main.tsx          # React 入口
│   │   ├── App.tsx           # 主应用（路由 + 状态管理）
│   │   ├── api.ts            # API 客户端
│   │   ├── styles.css        # 全局样式
│   │   └── components/
│   │       ├── PetView.tsx       # 宠物页（状态 + 动作）
│   │       ├── PixelPet.tsx      # SVG 像素宠物渲染
│   │       ├── ChatView.tsx      # 聊天界面
│   │       ├── ShopView.tsx      # 装扮商城
│   │       └── WelcomeScreen.tsx # 欢迎/命名页
│   └── shared/
│       └── types.ts          # 共享类型定义
├── index.html                # Vite HTML 入口
├── vite.config.ts            # Vite 配置
├── tsconfig.json             # TypeScript 配置
├── .env.example              # 环境变量模板
└── package.json
```

---

## 📡 API 文档

### REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/init` | 初始化用户 + 宠物 |
| GET | `/api/pet/:petId` | 获取宠物状态 |
| POST | `/api/pet/:petId/feed` | 喂食 |
| POST | `/api/pet/:petId/play` | 玩耍 |
| POST | `/api/pet/:petId/rest` | 休息 |
| POST | `/api/pet/:petId/skin` | 换皮肤 |
| GET | `/api/shop` | 获取商城列表 |
| GET | `/api/shop/:userId/owned` | 获取已拥有物品 |
| POST | `/api/shop/buy` | 购买物品 |
| POST | `/api/chat` | 发送聊天消息 |
| GET | `/api/notifications/:userId` | 获取未读通知 |
| POST | `/api/notifications/:userId/read` | 标记通知已读 |

### WebSocket

连接 `ws://host/ws/chat`

```json
// 发送
{ "type": "chat", "petId": "...", "message": "你好！" }

// 接收
{ "type": "typing", "petId": "..." }
{ "type": "message", "petId": "...", "response": "...", "pet": {...} }
```

---

## 🗺️ 路线图

### MVP（当前 - 3天冲刺）
- [x] AI 对话系统 (pi-agent-core)
- [x] 养成系统（喂食/玩耍/休息）
- [x] 装扮商城
- [x] 推送通知
- [x] 前端完整 UI
- [ ] 部署上线
- [ ] AI 聊天端到端测试

### v2（后续迭代）
- [ ] 三层 AI 架构（记忆/反思/计划）
- [ ] 多宠物支持
- [ ] 宠物社交（多 Agent 交互）
- [ ] 内购系统 + 支付集成
- [ ] PWA + 真实推送通知
- [ ] Web3 资产上链（NFT 皮肤）

---

## 👥 团队

| 角色 | 职责 |
|------|------|
| Kuro | CEO / 项目总监 |
| Dev | 技术开发（前后端 + AI 集成）|
| Design | UI/像素美术 |
| Echo | 文案/世界观 |
| Intel | 市场研究 |
| Ops | 项目管理 |

---

## 📄 License

Private - Kuro-OPC

---

*Built with ❤️ by Kuro-OPC team in a 72-hour sprint*
