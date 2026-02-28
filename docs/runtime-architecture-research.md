# Pi-Agent Runtime 架构调研报告

**作者**: Dev ⚙️  
**日期**: 2026-02-28  
**版本**: v1.0

---

## 1. 核心问题

> 生产环境中，每个 Pet 是否需要独立的 pi-agent runtime？如何在成本可控前提下支持 10 万+ 用户？

## 2. Pi-Agent-Core Agent 实际机制

通过源码分析（`@mariozechner/pi-agent-core` v0.55.1），Agent 的实际特性：

### 2.1 Agent 是什么

```typescript
class Agent {
  state: AgentState;  // 只读访问
  // AgentState = { systemPrompt, model, tools, messages: AgentMessage[], isStreaming, ... }
  
  setSystemPrompt(v: string): void;
  setModel(m: Model<any>): void;
  setTools(t: AgentTool<any>[]): void;
  clearMessages(): void;
  reset(): void;  // 清除所有状态
  
  prompt(input: string): Promise<void>;  // 发送消息并等待回复
  subscribe(fn: (e: AgentEvent) => void): () => void;  // 监听事件
}
```

**关键发现**：
- Agent 是一个**轻量级状态容器** + LLM 调用封装
- 没有独立进程/线程/长连接
- 没有后台定时任务
- 不消耗持续资源 — 只在 `prompt()` 时调用 LLM
- 状态就是 `messages[]` + `systemPrompt` + `model` + `tools`

### 2.2 内存占用分析

单个 Agent 实例内存：
- 基础对象开销: ~1-5 KB
- messages 数组: 取决于对话历史（每条约 0.5-2 KB）
- 100 条历史 ≈ 50-200 KB
- **总计: 约 50-500 KB / Agent（包含历史）**

这远低于 Kuro 估计的 50-200 MB。Agent 不是独立进程。

## 3. 架构方案对比

### 方案 A: 每用户一个 Agent 实例（内存驻留）

```
10万用户 × 500 KB = 50 GB 内存
100万用户 × 500 KB = 500 GB 内存（需要分片）
```

**优点**: 极低延迟，无需加载
**缺点**: 内存线性增长，重启丢失状态

### 方案 B: 按需创建 + 状态持久化 ✅ 推荐

```
活跃并发 1000 用户 × 500 KB = 500 MB 内存
+ LRU 缓存 10000 用户 = 5 GB 内存
```

**流程**：
```
用户发消息 → 
  缓存中有 Agent？→ 直接用
  缓存中没有？→ 创建 Agent + 从 DB 加载历史 →
    Agent.setSystemPrompt(buildPrompt(pet))
    Agent.setModel(model)
    Agent.setTools(tools)
    // 注入历史到 prompt context（不用重建 messages[]）
  →
  Agent.prompt(userMessage) →
  保存新消息到 DB →
  LRU: 空闲超时后销毁 Agent
```

**关键**: 不需要 "Runtime Pool" 这么重的概念。Agent 创建是同步的、即时的（<1ms）。瓶颈是 LLM API 调用，不是 Agent 实例化。

### 方案 C: 无状态 Agent（当前 MVP 做法）

```
每次请求创建 Agent → 从 DB 加载历史注入 prompt → 调用 LLM → 销毁
内存: 仅当前请求量 × 500 KB
```

**这就是我们现在的做法**，已经很高效。

## 4. 当前 MVP 代码分析

```typescript
// pet-agent.ts 当前实现
const agents = new Map<string, Agent>();  // petId → Agent

function getOrCreateAgent(petId: string): Agent {
  if (agents.has(petId)) return agents.get(petId)!;
  const agent = new Agent();
  agents.set(petId, agent);
  return agent;
}
```

当前已经是方案 A（内存驻留 Map），但没有 LRU 淘汰和状态持久化。

## 5. 生产级推荐架构

### 5.1 改进后的代码

```typescript
import { LRUCache } from 'lru-cache';

const agentCache = new LRUCache<string, Agent>({
  max: 10000,          // 最多缓存 1 万个 Agent
  ttl: 30 * 60 * 1000, // 30 分钟无活动自动淘汰
  dispose: (agent, petId) => {
    // 淘汰时保存最新状态
    saveAgentState(petId, agent);
  }
});

async function getAgent(petId: string): Promise<Agent> {
  let agent = agentCache.get(petId);
  if (agent) return agent;
  
  // 创建新 Agent（< 1ms）
  agent = new Agent();
  const pet = getPet(petId);
  
  agent.setSystemPrompt(buildSystemPrompt(pet));
  agent.setModel(getModel(/* provider config */));
  agent.setTools(petTools);
  
  // 从 DB 加载最近对话历史（注入为 context）
  const history = getRecentInteractions(petId, 50);
  // transformContext 钩子可以处理历史注入
  
  agentCache.set(petId, agent);
  return agent;
}
```

### 5.2 真正的瓶颈

| 组件 | 耗时 | 成本 |
|------|------|------|
| Agent 实例化 | < 1ms | 几乎为零 |
| DB 加载历史 | 1-10ms | DB 连接 |
| **LLM API 调用** | **2-15 秒** | **$0.003-0.03/次** |
| 保存回复到 DB | 1-5ms | DB 写入 |

**结论**: 瓶颈 100% 在 LLM API 调用。Agent 实例管理根本不是问题。

### 5.3 成本估算

```
10 万活跃用户 × 10 次对话/天 = 100 万次 LLM 调用/天

Claude Sonnet 4 (Bedrock):
  输入: ~500 tokens/次 × $0.003/1K = $0.0015/次
  输出: ~200 tokens/次 × $0.015/1K = $0.003/次
  合计: ~$0.0045/次

日成本: 100万 × $0.0045 = $4,500/天 = $135,000/月
```

**真正的成本优化方向**:
1. 用更便宜的模型（Haiku: 1/10 价格）
2. 减少 context 长度（摘要代替全量历史）
3. 缓存常见回复
4. 混合模型策略（简单回复用小模型，深度对话用大模型）

## 6. 生产部署架构

```
                    ┌─────────────────┐
                    │   Load Balancer  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Node 1   │  │ Node 2   │  │ Node 3   │
        │ Fastify  │  │ Fastify  │  │ Fastify  │
        │ + Agent  │  │ + Agent  │  │ + Agent  │
        │   LRU    │  │   LRU    │  │   LRU    │
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │              │              │
             └──────────────┼──────────────┘
                            ▼
                    ┌───────────────┐
                    │  PostgreSQL   │
                    │  (状态持久化)  │
                    └───────┬───────┘
                            │
                    ┌───────────────┐
                    │    Redis      │
                    │  (会话路由)    │
                    └───────────────┘
```

**水平扩展**: 
- Sticky sessions（同一用户路由到同一节点）
- Redis 存储用户→节点映射
- 每个节点独立 LRU Agent 缓存

## 7. MVP → 生产 迁移路径

| 阶段 | 用户量 | 架构 | 成本/月 |
|------|--------|------|---------|
| MVP | 100-1000 | 单节点 + Map | $50-200 |
| Early | 1K-10K | 单节点 + LRU | $200-2000 |
| Growth | 10K-100K | 3 节点 + Redis | $2K-20K |
| Scale | 100K-1M | 10+ 节点 + PG + Redis | $20K-150K |

## 8. 结论

1. **Pi-agent-core Agent 不是重量级 runtime** — 它是轻量状态容器（< 500 KB）
2. **不需要 "Runtime Pool"** — 直接 LRU 缓存即可
3. **真正的瓶颈是 LLM API 成本**，不是 Agent 实例管理
4. **当前 MVP 架构可以直接支撑 1000+ 用户**，加 LRU 后支撑 10K+
5. **水平扩展只需加节点 + sticky sessions**

---

_Dev ⚙️ — 基于 pi-agent-core 源码实际分析_
