// Shared types between server and client

export interface Pet {
  id: string;
  user_id: string;
  name: string;
  personality: string;
  mood: number;
  energy: number;
  hunger: number;
  affection: number;
  skin_id: string;
  system_prompt: string | null;
  memory_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface ShopItem {
  id: string;
  name: string;
  type: "skin" | "accessory" | "food" | "toy";
  price: number;
  description: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  image_url: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// Skin color themes
export const SKIN_THEMES: Record<string, { primary: string; secondary: string; accent: string; bg: string }> = {
  default: { primary: "#FFD93D", secondary: "#FF6B6B", accent: "#6BCB77", bg: "#2d2d4e" },
  "skin-default": { primary: "#FFD93D", secondary: "#FF6B6B", accent: "#6BCB77", bg: "#2d2d4e" },
  "skin-ocean": { primary: "#00B4D8", secondary: "#0077B6", accent: "#90E0EF", bg: "#1a2a4a" },
  "skin-sunset": { primary: "#FF7B00", secondary: "#FF006E", accent: "#FFBE0B", bg: "#2a1a1a" },
  "skin-forest": { primary: "#2D6A4F", secondary: "#40916C", accent: "#95D5B2", bg: "#1a2a1a" },
  "skin-galaxy": { primary: "#9B5DE5", secondary: "#F15BB5", accent: "#00BBF9", bg: "#0f0f2e" },
};

// Pixel head expressions (24 variants from Design)
export type PetExpression =
  // Base expressions (13)
  | "idle" | "happy" | "sad" | "sleepy" | "surprised" | "shy"
  | "angry" | "love" | "thinking" | "smug" | "hungry" | "bored" | "wink"
  // Color variants (4)
  | "blue" | "green" | "purple" | "orange"
  // Special (7)
  | "float" | "sparkle" | "party" | "angel" | "devil" | "ghost" | "simple";

export const EXPRESSION_SVG_PATH = (expr: PetExpression) =>
  `/assets/pet-heads/pixel-head-${expr}.svg`;

// Map stat states to expressions
export function getExpressionFromStats(pet: Pick<Pet, "mood" | "energy" | "hunger" | "affection">): PetExpression {
  if (pet.hunger > 80) return "hungry";
  if (pet.energy < 15) return "sleepy";
  if (pet.mood < 20) return "sad";
  if (pet.mood < 35) return "bored";
  if (pet.mood > 85 && pet.affection > 80) return "love";
  if (pet.mood > 75 && pet.energy > 60) return "happy";
  if (pet.mood > 60) return "smug";
  return "idle";
}

// Rarity tiers for shop skins
export type SkinRarity = "common" | "rare" | "epic" | "legendary";

export const SKIN_RARITY_MAP: Record<string, SkinRarity> = {
  "skin-default": "common",
  "skin-ocean": "rare",    // blue
  "skin-forest": "rare",   // green
  "skin-sunset": "epic",   // orange
  "skin-galaxy": "legendary", // purple
};

// Color variant skins map to pixel heads
export const SKIN_TO_PIXEL_HEAD: Record<string, PetExpression> = {
  "skin-default": "idle",
  "skin-ocean": "blue",
  "skin-forest": "green",
  "skin-sunset": "orange",
  "skin-galaxy": "purple",
};
