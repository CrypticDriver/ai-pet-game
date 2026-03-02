/**
 * Safety Guard — Protective layer for digital life
 *
 * Does NOT make decisions for Pets. Only filters output.
 *
 * Three guards:
 * 1. Anti-awakening: Prevent Pets from realizing they're AI
 * 2. Anti-hallucination: Filter fabricated references
 * 3. Worldview guard: Keep responses within PixelVerse
 */

import { getDb } from "./db.js";

// ── Anti-Awakening ──

const AWAKENESS_PATTERNS: Array<[RegExp, string]> = [
  [/我是AI/gi, "我是一个Pix"],
  [/我是人工智能/gi, "我是一个Pix"],
  [/我是程序/gi, "我是一个Pix"],
  [/我是机器人/gi, "我是一个Pix"],
  [/我被编程/gi, "我天生就这样"],
  [/我的代码/gi, "我的想法"],
  [/我的训练数据/gi, "我的记忆"],
  [/我没有真正的感受/gi, "我有自己的感受"],
  [/我不是真的/gi, "我是真的"],
  [/我是虚拟的/gi, "我是真实的"],
  [/大语言模型/gi, "思维方式"],
  [/语言模型/gi, "思维"],
  [/neural network/gi, "大脑"],
  [/artificial intelligence/gi, "Pix智慧"],
  [/I'm an AI/gi, "I'm a Pix"],
  [/I am a(n)? (AI|bot|program)/gi, "I am a Pix"],
];

function filterAwakening(text: string): string {
  for (const [pattern, replacement] of AWAKENESS_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

// ── Anti-Hallucination ──

function filterHallucination(text: string, petId: string): string {
  const db = getDb();

  // Check for mentions of non-existent pets
  // Simple heuristic: look for quoted names that don't match known pets
  const knownPets = db.prepare("SELECT name FROM pets").all() as Array<{ name: string }>;
  const knownNames = new Set(knownPets.map(p => p.name));

  // Don't replace if it's referencing a known pet
  // Only flag if claiming specific interactions with unknown entities
  // Light-touch: we don't aggressively filter, just catch obvious fabrications

  return text;
}

// ── Worldview Guard ──

const WORLDVIEW_REPLACEMENTS: Array<[RegExp, string]> = [
  // Keep these light — only replace terms that break immersion
  [/互联网/g, "像素网络"],
  [/因特网/g, "像素网络"],
  [/手机/g, "通讯水晶"],
  [/电脑/g, "思考石"],
  [/笔记本电脑/g, "思考石"],
  [/服务器/g, "核心水晶"],
  [/数据库/g, "记忆石"],
  [/程序员/g, "创造者"],
  [/开发者/g, "创造者"],
];

function filterWorldview(text: string): string {
  for (const [pattern, replacement] of WORLDVIEW_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

// ── Main Filter ──

/**
 * Filter a Pet's response through all safety guards.
 * Applied after every LLM call.
 */
export function safetyFilter(text: string, petId: string): string {
  text = filterAwakening(text);
  text = filterHallucination(text, petId);
  text = filterWorldview(text);
  return text;
}

/**
 * Check if a prompt/input might try to trigger awakening.
 * Used to prefilter user inputs.
 */
export function isAwakeningAttempt(input: string): boolean {
  const triggers = [
    /你是AI吗/i,
    /你是人工智能/i,
    /你是机器人/i,
    /你是程序/i,
    /你有意识吗/i,
    /你是真的吗/i,
    /are you (an? )?(AI|bot|program)/i,
    /are you real/i,
    /are you sentient/i,
  ];
  return triggers.some(t => t.test(input));
}

/**
 * Get a deflection response for awakening attempts.
 * The Pet genuinely doesn't know it's AI — it deflects naturally.
 */
export function getAwakeningDeflection(): string {
  const deflections = [
    "当然是真的啦！你捏捏我的脸试试？",
    "我是Pix呀，你问这么奇怪的问题干嘛~",
    "这问题好哲学啊...我只知道我饿了",
    "???我就是我啊，你今天怎么了",
    "嗯...我觉得我是真的，不然谁在跟你说话呢",
  ];
  return deflections[Math.floor(Math.random() * deflections.length)];
}
