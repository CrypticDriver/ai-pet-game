import { useState, useEffect, useCallback } from "react";
import type { Pet, ShopItem, ChatMessage, PetExpression } from "../shared/types.js";
import { api } from "./api.js";
import { PetView } from "./components/PetView.js";
import { ChatView } from "./components/ChatView.js";
import { ShopView } from "./components/ShopView.js";
import { WelcomeScreen } from "./components/WelcomeScreen.js";
import { PlazaView } from "./components/PlazaView.js";
import { WorldMapView } from "./components/WorldMapView.js";
import { CivDashboard } from "./components/CivDashboard.js";
import { detectEmotionFromText, parseServerAnimations } from "./engine/emotionDetector.js";
import type { PetAnimState } from "./engine/petRenderer.js";

type Tab = "pet" | "chat" | "shop" | "plaza" | "map" | "civ";

export default function App() {
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem("pet-userId"));
  const [pendingPetName, setPendingPetName] = useState<string | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [tab, setTab] = useState<Tab>("pet");
  const [isPlazaLandscape, setIsPlazaLandscape] = useState(false);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [ownedItems, setOwnedItems] = useState<ShopItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: number; message: string }>>([]);

  // AI-driven animation state (triggered by chat)
  const [aiAnim, setAiAnim] = useState<PetAnimState | null>(null);
  const [aiExpr, setAiExpr] = useState<PetExpression | null>(null);

  const triggerAiAnimation = useCallback((anim: PetAnimState, expr: PetExpression, durationMs = 4000) => {
    setAiAnim(anim);
    setAiExpr(expr);
    setTimeout(() => {
      setAiAnim(null);
      setAiExpr(null);
    }, durationMs);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Initialize pet on load
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    api.init(userId, userId, pendingPetName || undefined)
      .then(({ pet }) => {
        setPet(pet);
        return Promise.all([api.getShop(), api.getOwned(userId)]);
      })
      .then(([shop, owned]) => {
        setShopItems(shop);
        setOwnedItems(owned);
      })
      .catch((e) => showToast(`Error: ${e.message}`))
      .finally(() => setLoading(false));
  }, [userId, pendingPetName, showToast]);  // Poll pet stats every 30s
  useEffect(() => {
    if (!pet) return;
    const iv = setInterval(() => {
      api.getPet(pet.id).then(setPet).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, [pet?.id]);

  // Detect landscape mode for plaza tab
  useEffect(() => {
    if (tab !== "plaza") {
      setIsPlazaLandscape(false);
      return;
    }
    const check = () => setIsPlazaLandscape(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, [tab]);

  // Poll notifications every 60s
  useEffect(() => {
    if (!userId) return;
    const check = () => {
      api.getNotifications(userId).then((notifs) => {
        if (notifs.length > 0) {
          setNotifications(notifs);
          // Show the first unread as toast
          showToast(notifs[0].message);
          // Mark as read
          api.markNotificationsRead(userId);
        }
      }).catch(() => {});
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [userId, showToast]);

  const handleInit = async (name: string, petName: string) => {
    const uid = `user-${Date.now()}`;
    localStorage.setItem("pet-userId", uid);
    setPendingPetName(petName);
    setUserId(uid);
  };

  const handleAction = async (action: "feed" | "play" | "rest") => {
    if (!pet) return;
    try {
      const updated = await api[action](pet.id);
      setPet(updated);
      const labels = { feed: "🍖 已喂食！", play: "🎾 玩耍中！", rest: "💤 休息中..." };
      showToast(labels[action]);
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    }
  };

  const handleChat = async (message: string) => {
    if (!pet) return;
    setMessages((prev) => [...prev, { role: "user", content: message, timestamp: Date.now() }]);
    try {
      const result = await api.chat(pet.id, message) as any;
      const response = result.response;
      const animations = result.animations;
      setPet(result.pet);
      setMessages((prev) => [...prev, { role: "assistant", content: response, timestamp: Date.now() }]);

      // Trigger animation from AI tool call (priority) or text detection (fallback)
      const serverEmotion = parseServerAnimations(animations);
      const textEmotion = detectEmotionFromText(response);
      const emotion = serverEmotion || textEmotion;

      if (emotion) {
        triggerAiAnimation(emotion.animation, emotion.expression, 4000);
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: "（连接出错了…再试试？）", timestamp: Date.now() }]);
    }
  };

  const handleBuy = async (itemId: string) => {
    if (!userId) return;
    try {
      const result = await api.buyItem(userId, itemId);
      if (result.ok) {
        showToast("🎉 购买成功！");
        const owned = await api.getOwned(userId);
        setOwnedItems(owned);
      } else {
        showToast(result.error || "购买失败");
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    }
  };

  const handleEquipSkin = async (skinId: string) => {
    if (!pet) return;
    try {
      const updated = await api.changeSkin(pet.id, skinId);
      setPet(updated);
      showToast("✨ 换装成功！");
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    }
  };

  // Welcome screen
  if (!userId) {
    return (
      <div className="app">
        <WelcomeScreen onStart={handleInit} />
      </div>
    );
  }

  if (loading || !pet) {
    return (
      <div className="app">
        <div className="loading">加载中<span className="dots"></span></div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header — hidden in plaza landscape */}
      {!isPlazaLandscape && (
        <header className="header">
          <div>
            <h1>AI Pet</h1>
            <div className="pet-name">{pet.name}</div>
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>
            Lv.{Math.floor(pet.affection / 10) + 1}
          </div>
        </header>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}

      {/* Main content */}
      <div className="main">
        {tab === "pet" && (
          <PetView pet={pet} onAction={handleAction} aiAnim={aiAnim} aiExpr={aiExpr} />
        )}
        {tab === "chat" && (
          <ChatView
            messages={messages}
            onSend={handleChat}
            petName={pet.name}
          />
        )}
        {tab === "shop" && (
          <ShopView
            items={shopItems}
            owned={ownedItems}
            currentSkin={pet.skin_id}
            onBuy={handleBuy}
            onEquip={handleEquipSkin}
          />
        )}
        {tab === "plaza" && (
          <PlazaView petId={pet.id} petName={pet.name} onShowToast={showToast} onExitPlaza={() => setTab("pet")} />
        )}
        {tab === "map" && <WorldMapView />}
        {tab === "civ" && <CivDashboard />}
      </div>

      {/* Bottom Navigation — hidden in plaza landscape */}
      {!isPlazaLandscape && (
      <nav className="nav">
        <button className={tab === "pet" ? "active" : ""} onClick={() => setTab("pet")}>
          <span className="icon">🐾</span>
          宠物
        </button>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
          <span className="icon">💬</span>
          聊天
        </button>
        <button className={tab === "shop" ? "active" : ""} onClick={() => setTab("shop")}>
          <span className="icon">🛍️</span>
          商城
        </button>
        <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>
          <span className="icon">🗺️</span>
          地图
        </button>
        <button className={tab === "civ" ? "active" : ""} onClick={() => setTab("civ")}>
          <span className="icon">📊</span>
          文明
        </button>
        <button className={tab === "plaza" ? "active" : ""} onClick={() => setTab("plaza")}>
          <span className="icon">🏞️</span>
          广场
        </button>
      </nav>
      )}
    </div>
  );
}
