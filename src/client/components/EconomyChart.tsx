import { useState, useEffect, useRef, useCallback } from "react";

const fetchApi = (url: string) => fetch(url).then(r => r.json());

interface WalletEntry {
  pet_id: string;
  pet_name: string;
  balance: number;
}

interface TxEntry {
  id: number;
  from_pet_id: string;
  to_pet_id: string;
  amount: number;
  reason: string;
  description: string;
  created_at: string;
  from_pet_name?: string;
  to_pet_name?: string;
}

export function EconomyChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [transactions, setTransactions] = useState<TxEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [tab, setTab] = useState<"wealth" | "flow">("wealth");

  useEffect(() => {
    fetchApi("/api/world/economy").then(setStats);
    fetchApi("/api/world/economy/wallets").then(setWallets);
    fetchApi("/api/world/economy/transactions?limit=20").then(setTransactions);
  }, []);

  // Draw wealth distribution bar chart
  const drawWealth = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || wallets.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 380, H = 200;
    ctx.clearRect(0, 0, W, H);

    const sorted = [...wallets].sort((a, b) => b.balance - a.balance);
    const maxBal = Math.max(...sorted.map(w => w.balance), 1);
    const barW = Math.max(20, Math.min(50, (W - 40) / sorted.length - 4));
    const startX = (W - (barW + 4) * sorted.length) / 2;

    // Bars
    sorted.forEach((w, i) => {
      const x = startX + i * (barW + 4);
      const barH = (w.balance / maxBal) * 150;
      const y = H - 30 - barH;

      // Gradient based on wealth
      const hue = Math.max(0, Math.min(120, (w.balance / maxBal) * 120));
      ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
      ctx.fillRect(x, y, barW, barH);

      // Amount label
      ctx.fillStyle = "#fff";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${w.balance}`, x + barW / 2, y - 4);

      // Name label
      ctx.fillStyle = "#aaa";
      ctx.font = "9px sans-serif";
      ctx.fillText(w.pet_name.slice(0, 3), x + barW / 2, H - 16);
    });

    // Axis
    ctx.strokeStyle = "#444";
    ctx.beginPath();
    ctx.moveTo(startX - 5, H - 30);
    ctx.lineTo(W - 10, H - 30);
    ctx.stroke();

    // Title
    ctx.fillStyle = "#888";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("💰 PixelCoin 余额", 10, 14);
  }, [wallets]);

  // Draw transaction flow
  const drawFlow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || transactions.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 380, H = 200;
    ctx.clearRect(0, 0, W, H);

    // Simple timeline of recent transactions
    const recent = transactions.slice(0, 12);
    const maxAmt = Math.max(...recent.map(t => t.amount), 1);

    recent.forEach((tx, i) => {
      const y = 20 + i * 15;
      const barW = (tx.amount / maxAmt) * 200;

      // Bar
      const isEarn = !tx.from_pet_id;
      ctx.fillStyle = isEarn ? "rgba(80,200,120,0.6)" : "rgba(200,120,80,0.6)";
      ctx.fillRect(160, y, barW, 12);

      // Amount
      ctx.fillStyle = "#fff";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${tx.amount}💰`, 155, y + 10);

      // Description
      ctx.textAlign = "left";
      ctx.fillStyle = "#aaa";
      ctx.fillText((tx.description || tx.reason || "").slice(0, 18), 165 + barW + 4, y + 10);
    });

    ctx.fillStyle = "#888";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("📊 最近交易", 10, 14);
  }, [transactions]);

  useEffect(() => {
    if (tab === "wealth") drawWealth();
    else drawFlow();
  }, [tab, drawWealth, drawFlow]);

  const tabStyle = (t: string) => ({
    padding: "5px 12px", borderRadius: 12, fontSize: 11, cursor: "pointer",
    background: tab === t ? "rgba(100,200,255,0.3)" : "rgba(50,50,80,0.4)",
    border: tab === t ? "1px solid #6cf" : "1px solid transparent",
    color: "#fff",
  });

  return (
    <div style={{ padding: "12px", color: "#fff", maxWidth: 420, margin: "0 auto" }}>
      <h3 style={{ textAlign: "center", margin: "0 0 8px" }}>💰 经济系统</h3>

      {/* Stats */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
          <MiniStat label="总流通" value={`${stats.totalBalance}💰`} />
          <MiniStat label="Pet数" value={`${stats.totalPets}`} />
          <MiniStat label="今日交易" value={`${stats.todayTransactions}`} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
        <span style={tabStyle("wealth")} onClick={() => setTab("wealth")}>📊 财富分布</span>
        <span style={tabStyle("flow")} onClick={() => setTab("flow")}>📈 交易流水</span>
      </div>

      {/* Chart */}
      <canvas ref={canvasRef} width={380} height={200}
        style={{ background: "rgba(15,15,35,0.8)", borderRadius: 8, border: "1px solid #333", display: "block", margin: "0 auto" }}
      />

      {/* Wallet list */}
      {wallets.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>🏦 钱包排行</div>
          {[...wallets].sort((a, b) => b.balance - a.balance).map((w, i) => (
            <div key={w.pet_id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #222", fontSize: 12 }}>
              <span>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {w.pet_name}</span>
              <span style={{ color: "#ffd700" }}>{w.balance} 💰</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center", padding: 6, background: "rgba(30,30,60,0.5)", borderRadius: 6, border: "1px solid #333" }}>
      <div style={{ fontSize: 9, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: "bold" }}>{value}</div>
    </div>
  );
}
