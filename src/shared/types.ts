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
