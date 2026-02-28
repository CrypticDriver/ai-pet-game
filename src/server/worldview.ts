/**
 * Worldview System — shared lore injected into all pet AI prompts
 * 
 * - Loads from data/worldview.json (hot-reloadable)
 * - Version-controlled (version field)
 * - Separate from pet personality (worldview = background, personality = individual)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORLDVIEW_PATH = path.join(__dirname, "../../data/worldview.json");

interface Worldview {
  version: string;
  name: string;
  updated_at: string;
  lore: Record<string, any>;
  system_prompt_prefix: string;
  rules: string[];
}

let cachedWorldview: Worldview | null = null;
let cachedMtime: number = 0;

/**
 * Load worldview config — auto-reloads if file changed on disk (hot update)
 */
export function getWorldview(): Worldview {
  try {
    const stat = fs.statSync(WORLDVIEW_PATH);
    const mtime = stat.mtimeMs;

    if (cachedWorldview && mtime === cachedMtime) {
      return cachedWorldview;
    }

    const raw = fs.readFileSync(WORLDVIEW_PATH, "utf-8");
    cachedWorldview = JSON.parse(raw) as Worldview;
    cachedMtime = mtime;

    console.log(`🌍 Worldview loaded: ${cachedWorldview.name} v${cachedWorldview.version}`);
    return cachedWorldview;
  } catch (err) {
    // Fallback if file doesn't exist
    if (!cachedWorldview) {
      cachedWorldview = {
        version: "0.0.0",
        name: "Default",
        updated_at: "",
        lore: {},
        system_prompt_prefix: "你是一只友好的AI宠物。",
        rules: [],
      };
    }
    return cachedWorldview;
  }
}

/**
 * Get the worldview prompt prefix to inject into system prompts
 */
export function getWorldviewPrompt(): string {
  const wv = getWorldview();
  return wv.system_prompt_prefix;
}

/**
 * Get worldview info for API responses
 */
export function getWorldviewInfo() {
  const wv = getWorldview();
  return {
    version: wv.version,
    name: wv.name,
    updated_at: wv.updated_at,
    lore: wv.lore,
  };
}
