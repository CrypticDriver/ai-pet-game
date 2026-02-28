/**
 * AI Emotion Detection — detect emotion from AI response text
 * Used as fallback when the AI doesn't call react_emotionally tool
 */

import type { PetAnimState } from "../engine/petRenderer.js";
import type { PetExpression } from "../../shared/types.js";

interface DetectedEmotion {
  animation: PetAnimState;
  expression: PetExpression;
}

// Keyword → emotion mapping (Chinese + English)
const EMOTION_KEYWORDS: Array<{ keywords: string[]; animation: PetAnimState; expression: PetExpression }> = [
  // Happy/Excited
  { keywords: ["开心", "好开心", "太好了", "太棒了", "哈哈", "嘻嘻", "😊", "😆", "🎉", "happy", "excited", "yay", "haha"],
    animation: "bounce", expression: "happy" },
  // Love/Affection
  { keywords: ["喜欢你", "爱你", "最喜欢", "想你", "蹭蹭", "抱抱", "💕", "💙", "❤️", "🥰", "love", "miss you", "hug"],
    animation: "love", expression: "love" },
  // Sleepy/Tired
  { keywords: ["困了", "好困", "睡觉", "晚安", "打哈欠", "😴", "💤", "Zzz", "sleepy", "tired", "goodnight", "yawn"],
    animation: "sleep", expression: "sleepy" },
  // Hungry/Eating
  { keywords: ["好饿", "想吃", "吃东西", "饿了", "好吃", "美味", "🍖", "🍕", "yummy", "hungry", "eat", "food", "delicious"],
    animation: "eat", expression: "hungry" },
  // Sad
  { keywords: ["难过", "伤心", "哭", "呜呜", "😢", "😭", "💔", "sad", "cry", "upset"],
    animation: "idle", expression: "sad" },
  // Curious/Thinking
  { keywords: ["想想", "思考", "嗯", "好奇", "为什么", "🤔", "curious", "thinking", "wonder", "hmm"],
    animation: "wave", expression: "thinking" },
  // Shy
  { keywords: ["害羞", "不好意思", "脸红", "😳", "🥺", "shy", "blush", "embarrass"],
    animation: "idle", expression: "shy" },
  // Surprised
  { keywords: ["哇", "天哪", "不会吧", "真的吗", "😮", "😲", "wow", "surprise", "really", "omg"],
    animation: "bounce", expression: "surprised" },
];

/**
 * Detect emotion from AI response text
 */
export function detectEmotionFromText(text: string): DetectedEmotion | null {
  const lowerText = text.toLowerCase();

  for (const entry of EMOTION_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return { animation: entry.animation, expression: entry.expression };
      }
    }
  }

  return null;
}

/**
 * Parse server animation data (from react_emotionally tool)
 */
export function parseServerAnimations(
  animations: Array<{ emotion: string; animation: string; intensity: number }> | undefined,
): DetectedEmotion | null {
  if (!animations || animations.length === 0) return null;

  const anim = animations[0]; // Use first animation
  const animMap: Record<string, PetAnimState> = {
    bounce: "bounce",
    wave: "wave",
    spin: "spin",
    love: "love",
    sleep: "sleep",
    eat: "eat",
    idle: "idle",
  };

  const exprMap: Record<string, PetExpression> = {
    happy: "happy",
    sad: "sad",
    excited: "sparkle",
    tired: "sleepy",
    loved: "love",
    hungry: "hungry",
    curious: "thinking",
    shy: "shy",
  };

  return {
    animation: animMap[anim.animation] || "bounce",
    expression: exprMap[anim.emotion] || "happy",
  };
}
