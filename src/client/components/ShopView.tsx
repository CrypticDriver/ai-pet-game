import type { ShopItem } from "../../shared/types.js";
import { SKIN_THEMES } from "../../shared/types.js";

interface Props {
  items: ShopItem[];
  owned: ShopItem[];
  currentSkin: string;
  onBuy: (itemId: string) => Promise<void>;
  onEquip: (skinId: string) => Promise<void>;
}

const SKIN_EMOJIS: Record<string, string> = {
  "skin-default": "🐣",
  "skin-ocean": "🌊",
  "skin-sunset": "🌅",
  "skin-forest": "🌲",
  "skin-galaxy": "🌌",
};

export function ShopView({ items, owned, currentSkin, onBuy, onEquip }: Props) {
  const ownedIds = new Set(owned.map((i) => i.id));

  return (
    <div className="shop-view">
      <div className="shop-title">🛍️ 装扮商城</div>

      <div className="shop-grid">
        {items.map((item) => {
          const isOwned = ownedIds.has(item.id);
          const isEquipped = currentSkin === item.id;
          const theme = SKIN_THEMES[item.id] || SKIN_THEMES.default;

          return (
            <div
              key={item.id}
              className={`shop-item ${isOwned ? "owned" : ""} ${isEquipped ? "equipped" : ""}`}
              onClick={async () => {
                if (isEquipped) return;
                if (isOwned) {
                  await onEquip(item.id);
                } else {
                  await onBuy(item.id);
                }
              }}
            >
              <div
                className="item-preview"
                style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
              >
                {SKIN_EMOJIS[item.id] || "🎨"}
              </div>

              <div className="item-name">{item.name}</div>

              <div className={`item-rarity rarity-${item.rarity}`}>
                {item.rarity}
              </div>

              {isEquipped ? (
                <div style={{ fontSize: "8px", color: "var(--yellow)", marginTop: "6px" }}>
                  ✅ 装备中
                </div>
              ) : isOwned ? (
                <button className="shop-buy-btn" style={{ background: "var(--green)" }}>
                  穿上
                </button>
              ) : (
                <button className="shop-buy-btn">
                  💰 {item.price > 0 ? item.price : "免费"}
                </button>
              )}

              {item.description && (
                <div style={{ fontSize: "7px", color: "var(--text-dim)", marginTop: "4px" }}>
                  {item.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
