/**
 * LLM Scheduler — Model-tiered thinking for digital life
 *
 * All Pet decisions go through LLM. This scheduler decides:
 * 1. WHEN to think (stimulus detection)
 * 2. WHICH model to use (priority-based)
 * 3. Concurrency control (prevent overload)
 *
 * It does NOT decide what to think. That's the Pet's freedom.
 */

// ── Types ──

export type ThinkingPriority = "low" | "medium" | "high" | "critical";

export interface ThinkingRequest {
  petId: string;
  context: string;
  priority: ThinkingPriority;
  model?: string;
}

export interface ThinkingResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

// ── Model Tiers ──

const MODEL_TIERS = {
  lite:   "us.amazon.nova-lite-v1:0",
  pro:    "us.amazon.nova-pro-v1:0",
} as const;

// ── Task → Model Mapping ──

const TASK_MODEL: Record<string, keyof typeof MODEL_TIERS> = {
  autonomous_idle:     "lite",
  autonomous_move:     "lite",
  social_greeting:     "lite",
  social_conversation: "pro",
  first_meeting:       "pro",
  user_chat:           "pro",
  reflection:          "pro",
  evolution:           "pro",
};

// ── Scheduler ──

let activeRequests = 0;
const MAX_CONCURRENT = 10;
const queue: Array<{
  req: ThinkingRequest;
  resolve: (r: ThinkingResult) => void;
  reject: (e: Error) => void;
}> = [];

/** Select model based on priority */
export function selectModel(priority: ThinkingPriority): string {
  switch (priority) {
    case "critical": return MODEL_TIERS.pro;
    case "high":     return MODEL_TIERS.pro;
    case "medium":   return MODEL_TIERS.lite;
    case "low":      return MODEL_TIERS.lite;
  }
}

/** Select model based on task type */
export function selectModelForTask(task: string): string {
  const tier = TASK_MODEL[task] || "lite";
  return MODEL_TIERS[tier];
}

/** Classify priority based on trigger */
export function classifyPriority(trigger: string): ThinkingPriority {
  switch (trigger) {
    case "user_chat":      return "high";
    case "first_meeting":  return "high";
    case "evolution":      return "critical";
    case "reflection":     return "critical";
    case "social_chat":    return "medium";
    case "autonomous":     return "medium";
    case "message_reply":  return "medium";
    default:               return "low";
  }
}

/** Check if a pet has a stimulus worth thinking about */
export function hasStimulus(opts: {
  unreadMessages: number;
  nearbyPetChanged: boolean;
  newEvent: boolean;
  lowStats: boolean;
  randomChance: number; // 0-1
}): boolean {
  if (opts.unreadMessages > 0) return true;
  if (opts.nearbyPetChanged) return true;
  if (opts.newEvent) return true;
  if (opts.lowStats) return true;
  // Random chance for spontaneous thought (daydream, explore)
  if (Math.random() < opts.randomChance) return true;
  return false;
}

/** Submit a thinking request (with concurrency control) */
export async function think(req: ThinkingRequest): Promise<ThinkingResult> {
  return new Promise((resolve, reject) => {
    queue.push({ req, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  while (queue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const item = queue.shift();
    if (!item) break;

    activeRequests++;
    executeLLMCall(item.req)
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        activeRequests--;
        processQueue();
      });
  }
}

async function executeLLMCall(req: ThinkingRequest): Promise<ThinkingResult> {
  const model = req.model || selectModel(req.priority);
  const start = Date.now();

  // Dynamic import to avoid circular deps
  const { chatAsPetWithModel } = await import("./pet-agent.js");

  const response = await chatAsPetWithModel(req.petId, req.context, model);

  return {
    text: response,
    model,
    tokensIn: 0,   // TODO: extract from response
    tokensOut: 0,
    durationMs: Date.now() - start,
  };
}

/** Get scheduler stats */
export function getSchedulerStats() {
  return {
    activeRequests,
    queueLength: queue.length,
    maxConcurrent: MAX_CONCURRENT,
  };
}
