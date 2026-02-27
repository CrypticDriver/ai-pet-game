import type { Pet } from "../../shared/types.js";
import { SKIN_THEMES } from "../../shared/types.js";
import { PixelPet } from "./PixelPet.js";
import { useState } from "react";

interface Props {
  pet: Pet;
  onAction: (action: "feed" | "play" | "rest") => Promise<void>;
}

// Map emotions to external SVG filenames from Design team
const EMOTION_SVG_MAP: Record<string, string> = {
  happy: "/assets/pet/pet-happy.svg",
  sad: "/assets/pet/pet-sad.svg",
  sleepy: "/assets/pet/pet-sleepy.svg",
  neutral: "/assets/pet/pet-neutral.svg",
  excited: "/assets/pet/pet-excited.svg",
};

export function PetView({ pet, onAction }: Props) {
  const [cooldown, setCooldown] = useState<Record<string, number>>({});
  const theme = SKIN_THEMES[pet.skin_id] || SKIN_THEMES.default;

  const getEmotion = (): string => {
    if (pet.mood < 30) return "sad";
    if (pet.energy < 20) return "sleepy";
    if (pet.mood > 70 && pet.energy > 50) return "happy";
    return "neutral";
  };

  const getEmoji = (): string => {
    const e = getEmotion();
    if (e === "happy") return "😊";
    if (e === "sad") return "😢";
    if (e === "sleepy") return "😴";
    return "🙂";
  };

  const handleAction = async (action: "feed" | "play" | "rest") => {
    if (cooldown[action]) return;
    setCooldown((prev) => ({ ...prev, [action]: 1 }));
    await onAction(action);
    // 10 second cooldown
    setTimeout(() => {
      setCooldown((prev) => {
        const next = { ...prev };
        delete next[action];
        return next;
      });
    }, 10000);
  };

  // Convert hunger to "fullness" for display (hunger 0 = full, 100 = starving)
  const fullness = 100 - pet.hunger;

  return (
    <div className="pet-view">
      {/* Pet Stage */}
      <div className="pet-stage" style={{ background: `radial-gradient(circle, ${theme.bg}, transparent)` }}>
        <div className={`pixel-pet ${getEmotion()}`}>
          <PixelPet skinId={pet.skin_id} emotion={getEmotion()} />
        </div>
        <div className="pet-emotion" key={getEmoji()}>{getEmoji()}</div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatBar label="心情" icon="😊" value={pet.mood} className="mood" />
        <StatBar label="能量" icon="⚡" value={pet.energy} className="energy" />
        <StatBar label="饱食" icon="🍖" value={fullness} className="hunger" />
        <StatBar label="亲密" icon="💕" value={pet.affection} className="affection" />
      </div>

      {/* Actions */}
      <div className="actions">
        <button
          className="action-btn"
          onClick={() => handleAction("feed")}
          disabled={!!cooldown.feed}
        >
          <span className="action-icon">🍖</span>
          喂食
          {cooldown.feed && <span className="action-cooldown">冷却中</span>}
        </button>
        <button
          className="action-btn"
          onClick={() => handleAction("play")}
          disabled={!!cooldown.play}
        >
          <span className="action-icon">🎾</span>
          玩耍
          {cooldown.play && <span className="action-cooldown">冷却中</span>}
        </button>
        <button
          className="action-btn"
          onClick={() => handleAction("rest")}
          disabled={!!cooldown.rest}
        >
          <span className="action-icon">💤</span>
          休息
          {cooldown.rest && <span className="action-cooldown">冷却中</span>}
        </button>
      </div>
    </div>
  );
}

function StatBar({ label, icon, value, className }: { label: string; icon: string; value: number; className: string }) {
  return (
    <div className="stat-bar">
      <div className="stat-label">
        <span>{icon} {label}</span>
        <span>{value}%</span>
      </div>
      <div className="stat-track">
        <div className={`stat-fill ${className}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
