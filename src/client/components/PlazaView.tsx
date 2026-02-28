/**
 * PlazaView — Social outdoor area where pets can meet, interact, and make friends
 */

import { useRef, useEffect, useState, useCallback } from "react";
import type { PetExpression } from "../../shared/types.js";
import { EXPRESSION_SVG_PATH, getExpressionFromStats } from "../../shared/types.js";
import { renderPlazaBackground } from "../engine/plazaBackground.js";

const WIDTH = 360;
const HEIGHT = 280;

interface PlazaPetInfo {
  petId: string;
  name: string;
  skin: string;
  expression: string;
  x: number;
  y: number;
  mood: number;
  animation: string;
}

interface ChatBubble {
  petId: string;
  message: string;
  x: number;
  y: number;
  time: number;
}

interface Props {
  petId: string;
  petName: string;
  onShowToast: (msg: string) => void;
}

export function PlazaView({ petId, petName, onShowToast }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [pets, setPets] = useState<PlazaPetInfo[]>([]);
  const [connected, setConnected] = useState(false);
  const [selectedPet, setSelectedPet] = useState<PlazaPetInfo | null>(null);
  const [chatBubbles, setChatBubbles] = useState<ChatBubble[]>([]);
  const petsRef = useRef<PlazaPetInfo[]>([]);
  const bubblesRef = useRef<ChatBubble[]>([]);
  const spriteCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const rafRef = useRef<number>(0);

  // Keep refs in sync
  useEffect(() => { petsRef.current = pets; }, [pets]);
  useEffect(() => { bubblesRef.current = chatBubbles; }, [chatBubbles]);

  // Load sprite
  const getSprite = useCallback((expression: string): HTMLImageElement | null => {
    const exprKey = (expression || "happy") as PetExpression;
    const path = EXPRESSION_SVG_PATH(exprKey);
    if (spriteCache.current.has(path)) return spriteCache.current.get(path)!;
    const img = new Image();
    img.src = path;
    img.onload = () => spriteCache.current.set(path, img);
    return null;
  }, []);

  // Connect WebSocket
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/plaza`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "enter", petId }));
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);

      switch (data.type) {
        case "plaza_state":
          setPets(data.pets || []);
          break;

        case "pet_enter":
          setPets(prev => {
            const filtered = prev.filter(p => p.petId !== data.pet.petId);
            return [...filtered, data.pet];
          });
          break;

        case "pet_leave":
          setPets(prev => prev.filter(p => p.petId !== data.petId));
          break;

        case "pet_move":
          setPets(prev => prev.map(p =>
            p.petId === data.petId ? { ...p, x: data.x, y: data.y, animation: "walk" } : p
          ));
          break;

        case "pet_emote":
          setPets(prev => prev.map(p =>
            p.petId === data.petId ? { ...p, animation: data.animation } : p
          ));
          break;

        case "pet_update":
          setPets(prev => prev.map(p =>
            p.petId === data.petId ? { ...p, animation: data.animation || p.animation } : p
          ));
          break;

        case "plaza_chat": {
          const fromPet = petsRef.current.find(p => p.petId === data.fromPetId);
          if (fromPet) {
            const bubble: ChatBubble = {
              petId: data.fromPetId,
              message: data.message.substring(0, 60),
              x: fromPet.x,
              y: fromPet.y,
              time: Date.now(),
            };
            setChatBubbles(prev => [...prev.slice(-5), bubble]);
          }
          break;
        }

        case "friend_result":
          if (data.ok) onShowToast("交朋友成功！💕");
          else onShowToast(data.error || "添加失败");
          break;

        case "friend_request":
          onShowToast(`${data.fromPetName} 想和你交朋友！`);
          break;
      }
    };

    ws.onclose = () => setConnected(false);

    return () => {
      ws.close();
      cancelAnimationFrame(rafRef.current);
    };
  }, [petId, onShowToast]);

  // Expire old chat bubbles
  useEffect(() => {
    const timer = setInterval(() => {
      setChatBubbles(prev => prev.filter(b => Date.now() - b.time < 5000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    // Determine time of day
    const hour = new Date().getHours();
    const timeOfDay = hour >= 18 || hour < 6 ? "night" : hour >= 16 ? "sunset" : "day";

    function frame() {
      ctx!.clearRect(0, 0, WIDTH, HEIGHT);

      // Background
      renderPlazaBackground(ctx!, WIDTH, HEIGHT, timeOfDay as any);

      // Render each pet
      const currentPets = petsRef.current;
      // Sort by Y for pseudo-depth
      const sorted = [...currentPets].sort((a, b) => a.y - b.y);

      for (const pet of sorted) {
        const sprite = getSprite(pet.expression || "happy");
        const isMe = pet.petId === petId;
        const size = 36;

        // Shadow
        ctx!.globalAlpha = 0.3;
        ctx!.fillStyle = "#000";
        ctx!.beginPath();
        ctx!.ellipse(pet.x, pet.y + size / 2 + 2, size / 3, 4, 0, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.globalAlpha = 1;

        // Pet sprite
        if (sprite && sprite.complete) {
          ctx!.imageSmoothingEnabled = false;
          ctx!.drawImage(sprite, pet.x - size / 2, pet.y - size / 2, size, size);
          ctx!.imageSmoothingEnabled = true;
        } else {
          // Fallback circle
          ctx!.fillStyle = isMe ? "#ff6b9d" : "#6bc5ff";
          ctx!.beginPath();
          ctx!.arc(pet.x, pet.y, size / 3, 0, Math.PI * 2);
          ctx!.fill();
        }

        // Name label
        ctx!.font = "bold 9px 'Noto Sans SC', sans-serif";
        ctx!.textAlign = "center";
        ctx!.fillStyle = isMe ? "#FFD700" : "#ffffff";
        ctx!.fillText(pet.name, pet.x, pet.y + size / 2 + 14);

        // Highlight for own pet
        if (isMe) {
          ctx!.strokeStyle = "#FFD700";
          ctx!.lineWidth = 1;
          ctx!.setLineDash([2, 2]);
          ctx!.beginPath();
          ctx!.arc(pet.x, pet.y, size / 2 + 3, 0, Math.PI * 2);
          ctx!.stroke();
          ctx!.setLineDash([]);
        }
      }

      // Chat bubbles
      const bubbles = bubblesRef.current;
      for (const bubble of bubbles) {
        const age = (Date.now() - bubble.time) / 5000;
        if (age > 1) continue;
        ctx!.globalAlpha = Math.max(0, 1 - age);
        const bx = bubble.x;
        const by = bubble.y - 30 - age * 10;
        const text = bubble.message;

        ctx!.font = "8px 'Noto Sans SC', sans-serif";
        const metrics = ctx!.measureText(text);
        const tw = Math.min(metrics.width + 8, 120);

        ctx!.fillStyle = "rgba(30, 30, 60, 0.85)";
        const rx = bx - tw / 2;
        ctx!.beginPath();
        ctx!.roundRect(rx, by - 10, tw, 16, 4);
        ctx!.fill();

        ctx!.fillStyle = "#ffffff";
        ctx!.textAlign = "center";
        ctx!.fillText(text, bx, by + 2, 110);
        ctx!.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [petId, getSprite]);

  // Handle canvas click — move or select pet
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if clicked on another pet
    const clicked = pets.find(p => {
      const dx = p.x - x;
      const dy = p.y - y;
      return dx * dx + dy * dy < 400 && p.petId !== petId; // 20px radius
    });

    if (clicked) {
      setSelectedPet(clicked);
    } else {
      // Move own pet
      setSelectedPet(null);
      wsRef.current?.send(JSON.stringify({ type: "move", x, y }));
    }
  }, [pets, petId]);

  // Actions on selected pet
  const handleWave = () => {
    if (!selectedPet) return;
    wsRef.current?.send(JSON.stringify({ type: "emote", animation: "wave", targetPetId: selectedPet.petId }));
    onShowToast(`向 ${selectedPet.name} 打招呼 👋`);
  };

  const handleChatWith = () => {
    if (!selectedPet) return;
    wsRef.current?.send(JSON.stringify({
      type: "pet_chat",
      targetPetId: selectedPet.petId,
      message: "你好呀！我是" + petName + "，很高兴认识你！",
    }));
  };

  const handleAddFriend = () => {
    if (!selectedPet) return;
    wsRef.current?.send(JSON.stringify({ type: "add_friend", targetPetId: selectedPet.petId }));
  };

  return (
    <div className="plaza-view">
      <div className="plaza-header">
        <span>🏞️ 广场</span>
        <span className="plaza-online">{pets.length} 只宠物在线</span>
        {!connected && <span style={{ color: "var(--red)", fontSize: "8px" }}>连接中...</span>}
      </div>

      <div className="plaza-canvas-wrap">
        <canvas
          ref={canvasRef}
          style={{ width: WIDTH, height: HEIGHT, borderRadius: "var(--radius-md)", cursor: "pointer" }}
          onClick={handleClick}
        />
      </div>

      {/* Interaction panel for selected pet */}
      {selectedPet && (
        <div className="plaza-interact">
          <div className="plaza-interact-name">{selectedPet.name}</div>
          <div className="plaza-interact-btns">
            <button onClick={handleWave}>👋 招手</button>
            <button onClick={handleChatWith}>💬 聊天</button>
            <button onClick={handleAddFriend}>💕 交朋友</button>
            <button onClick={() => setSelectedPet(null)}>✕</button>
          </div>
        </div>
      )}

      {/* Emote bar */}
      <div className="plaza-emotes">
        {["wave", "love", "bounce", "spin"].map(anim => (
          <button
            key={anim}
            className="plaza-emote-btn"
            onClick={() => wsRef.current?.send(JSON.stringify({ type: "emote", animation: anim }))}
          >
            {{ wave: "👋", love: "💕", bounce: "⭐", spin: "🌀" }[anim]}
          </button>
        ))}
      </div>
    </div>
  );
}
