import type { Pet, PetExpression, EquippedAccessory } from "../../shared/types.js";
import { SKIN_THEMES, EXPRESSION_SVG_PATH, getExpressionFromStats, SKIN_TO_PIXEL_HEAD, SLOT_LAYER_ORDER } from "../../shared/types.js";
import { useState, useCallback, useEffect } from "react";
import { api } from "../api.js";
import { PetCanvas } from "./PetCanvas.js";
import { ActivityFeed } from "./ActivityFeed.js";
import type { PetAnimState } from "../engine/petRenderer.js";

interface Props {
  pet: Pet;
  onAction: (action: "feed" | "play" | "rest") => Promise<void>;
  aiAnim?: PetAnimState | null;
  aiExpr?: PetExpression | null;
}

// Pet body action animations
type BodyAction = "idle" | "bounce" | "headshake" | "wave" | "spin" | "love";

// Map BodyAction to PetAnimState for Canvas renderer
const BODY_TO_CANVAS: Record<BodyAction, PetAnimState> = {
  idle: "idle",
  bounce: "bounce",
  headshake: "wave",
  wave: "wave",
  spin: "spin",
  love: "love",
};

// Map nurture actions to body animations + expression reactions
const NURTURE_MAP: Record<string, { body: BodyAction; expr: PetExpression }> = {
  feed: { body: "love", expr: "happy" },
  play: { body: "bounce", expr: "sparkle" },
  rest: { body: "spin", expr: "sleepy" },
};

export function PetView({ pet, onAction, aiAnim, aiExpr }: Props) {
  const [cooldown, setCooldown] = useState<Record<string, number>>({});
  const [bodyAction, setBodyAction] = useState<BodyAction>("idle");
  const [exprOverride, setExprOverride] = useState<PetExpression | null>(null);
  const [accessories, setAccessories] = useState<EquippedAccessory[]>([]);
  const theme = SKIN_THEMES[pet.skin_id] || SKIN_THEMES.default;

  // Load equipped accessories
  useEffect(() => {
    api.getAccessories(pet.id).then(setAccessories).catch(() => {});
  }, [pet.id, pet.skin_id]);

  // Base expression from stats (skin-aware)
  const baseExpr: PetExpression = SKIN_TO_PIXEL_HEAD[pet.skin_id] || getExpressionFromStats(pet);
  // AI override > manual override > base
  const currentExpr = aiExpr || exprOverride || baseExpr;

  // AI animation override from chat
  useEffect(() => {
    if (aiAnim) {
      const mapped: Record<string, BodyAction> = { bounce: "bounce", wave: "wave", spin: "spin", love: "love" };
      const bodyAct = mapped[aiAnim] || "bounce";
      setBodyAction(bodyAct);
    } else {
      setBodyAction("idle");
    }
  }, [aiAnim]);

  // Trigger a temporary body animation
  const triggerBody = useCallback((action: BodyAction, ms = 3000) => {
    setBodyAction(action);
    setTimeout(() => setBodyAction("idle"), ms);
  }, []);

  // Trigger a temporary expression override
  const triggerExpr = useCallback((expr: PetExpression, ms = 3000) => {
    setExprOverride(expr);
    setTimeout(() => setExprOverride(null), ms);
  }, []);

  const handleAction = async (action: "feed" | "play" | "rest") => {
    if (cooldown[action]) return;
    setCooldown((prev) => ({ ...prev, [action]: 1 }));

    const map = NURTURE_MAP[action];
    triggerBody(map.body, 3000);
    triggerExpr(map.expr, 3000);

    await onAction(action);

    setTimeout(() => {
      setCooldown((prev) => {
        const next = { ...prev };
        delete next[action];
        return next;
      });
    }, 10000);
  };

  const getEmoji = (): string => {
    const e = currentExpr;
    if (e === "happy" || e === "sparkle" || e === "love") return "😊";
    if (e === "sad") return "😢";
    if (e === "sleepy") return "😴";
    if (e === "hungry") return "🍖";
    if (e === "angry") return "😠";
    if (e === "surprised") return "😮";
    return "🙂";
  };

  // Skin hue shifts for Canvas renderer
  const SKIN_HUE: Record<string, number> = {
    "skin-default": 0,
    "skin-ocean": 200,
    "skin-forest": 120,
    "skin-sunset": 30,
    "skin-galaxy": 270,
  };

  const fullness = 100 - pet.hunger;

  return (
    <div className="pet-view">
      {/* Pet Stage: Canvas renderer */}
      <div
        className="pet-stage"
        style={{ background: `radial-gradient(circle, ${theme.bg}, transparent)` }}
      >
        <PetCanvas
          expression={currentExpr}
          animState={BODY_TO_CANVAS[bodyAction]}
          hueShift={SKIN_HUE[pet.skin_id] || 0}
          width={220}
          height={220}
          onTap={() => { triggerBody("wave", 2000); triggerExpr("wink", 2000); }}
        />

        {/* Accessory overlays */}
        {accessories
          .sort((a, b) => (SLOT_LAYER_ORDER[a.slot] || 0) - (SLOT_LAYER_ORDER[b.slot] || 0))
          .map((acc) => (
            <div
              key={acc.slot}
              className={`pet-accessory-layer pet-accessory-${acc.slot}`}
              style={{ zIndex: SLOT_LAYER_ORDER[acc.slot] + 3 }}
            >
              {acc.image_url && (
                <img
                  src={`/assets/pet-accessories/${acc.image_url}`}
                  alt={acc.name}
                  width="64"
                  height="64"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
            </div>
          ))}

        <div className="pet-emotion" key={getEmoji() + Date.now()}>
          {getEmoji()}
        </div>
      </div>

      {/* Expression quick-switch row */}
      <div className="pet-actions-row">
        {(["happy", "sad", "love", "sparkle", "party", "ghost", "angel", "devil"] as PetExpression[]).map((e) => (
          <button
            key={e}
            className={`pet-action-mini ${currentExpr === e ? "active" : ""}`}
            onClick={() => triggerExpr(e, 3000)}
            title={e}
          >
            {e === "happy" ? "😊" : e === "sad" ? "😢" : e === "love" ? "💕"
              : e === "sparkle" ? "✨" : e === "party" ? "🎉" : e === "ghost" ? "👻"
              : e === "angel" ? "😇" : "😈"}
          </button>
        ))}
      </div>

      {/* Body action row */}
      <div className="pet-actions-row">
        {(["bounce", "headshake", "wave", "spin", "love"] as BodyAction[]).map((a) => (
          <button
            key={a}
            className="pet-action-mini"
            onClick={() => triggerBody(a, 2500)}
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

      {/* Activity Feed — what pet did while you were away */}
      <ActivityFeed petId={pet.id} />
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
