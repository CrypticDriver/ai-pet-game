import type { Pet } from "../../shared/types.js";
import { SKIN_THEMES } from "../../shared/types.js";
import { useState } from "react";

interface Props {
  pet: Pet;
  onAction: (action: "feed" | "play" | "rest") => Promise<void>;
}

// Actions that trigger animated SVGs
type PetAction = "idle" | "bounce" | "headshake" | "wave" | "spin" | "love";

// Map actions to SVG filenames
const ACTION_SVG: Record<PetAction, string> = {
  idle: "/assets/pet/pet-refined-idle.svg",
  bounce: "/assets/pet/pet-action-bounce.svg",
  headshake: "/assets/pet/pet-action-headshake.svg",
  wave: "/assets/pet/pet-action-wave.svg",
  spin: "/assets/pet/pet-action-spin.svg",
  love: "/assets/pet/pet-action-love.svg",
};

// Map nurturing actions to pet animations
const NURTURE_ANIMATIONS: Record<string, PetAction> = {
  feed: "love",
  play: "bounce",
  rest: "spin",
};

export function PetView({ pet, onAction }: Props) {
  const [cooldown, setCooldown] = useState<Record<string, number>>({});
  const [currentAction, setCurrentAction] = useState<PetAction>("idle");
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

  const triggerAction = (action: PetAction, durationMs = 3000) => {
    setCurrentAction(action);
    setTimeout(() => setCurrentAction("idle"), durationMs);
  };

  const handleAction = async (action: "feed" | "play" | "rest") => {
    if (cooldown[action]) return;
    setCooldown((prev) => ({ ...prev, [action]: 1 }));

    // Trigger animation
    triggerAction(NURTURE_ANIMATIONS[action] || "bounce", 3000);

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

  // Convert hunger to "fullness" for display
  const fullness = 100 - pet.hunger;

  return (
    <div className="pet-view">
      {/* Pet Stage */}
      <div
        className="pet-stage"
        style={{ background: `radial-gradient(circle, ${theme.bg}, transparent)` }}
        onClick={() => triggerAction("wave", 2000)}
      >
        <div className={`pixel-pet ${getEmotion()}`}>
          <object
            type="image/svg+xml"
            data={ACTION_SVG[currentAction]}
            width="180"
            height="180"
            style={{ imageRendering: "auto", pointerEvents: "none" }}
          >
            {/* Fallback text */}
            🐾
          </object>
        </div>
        <div className="pet-emotion" key={getEmoji() + Date.now()}>
          {getEmoji()}
        </div>
      </div>

      {/* Pet Action Buttons (tap to animate) */}
      <div className="pet-actions-row">
        {(["bounce", "headshake", "wave", "spin", "love"] as PetAction[]).map((a) => (
          <button
            key={a}
            className="pet-action-mini"
            onClick={() => triggerAction(a, 2500)}
            title={a}
          >
            {a === "bounce" ? "🦘" : a === "headshake" ? "🤔" : a === "wave" ? "👋" : a === "spin" ? "🔄" : "💕"}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatBar label="心情" icon="😊" value={pet.mood} className="mood" />
        <StatBar label="能量" icon="⚡" value={pet.energy} className="energy" />
        <StatBar label="饱食" icon="🍖" value={fullness} className="hunger" />
        <StatBar label="亲密" icon="💕" value={pet.affection} className="affection" />
      </div>

      {/* Nurture Actions */}
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

function StatBar({
  label,
  icon,
  value,
  className,
}: {
  label: string;
  icon: string;
  value: number;
  className: string;
}) {
  return (
    <div className="stat-bar">
      <div className="stat-label">
        <span>
          {icon} {label}
        </span>
        <span>{value}%</span>
      </div>
      <div className="stat-track">
        <div className={`stat-fill ${className}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
