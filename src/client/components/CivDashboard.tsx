import { useState, useEffect, useCallback } from "react";
import { SocialNetwork } from "./SocialNetwork.js";
import { EconomyChart } from "./EconomyChart.js";
import { useWorldEvents } from "../hooks/useWorldEvents.js";
const fetchApi = (url: string) => fetch(url).then(r => r.json());

export function CivDashboard() {
  const [emergence, setEmergence] = useState<any>(null);
  const [economy, setEconomy] = useState<any>(null);
  const [language, setLanguage] = useState<any>(null);
  const [terms, setTerms] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [culture, setCulture] = useState<any[]>([]);
  const [guilds, setGuilds] = useState<any[]>([]);
  const [tab, setTab] = useState<"overview" | "history" | "culture" | "language" | "social" | "economy">("overview");

  const loadAll = useCallback(() => {
    fetchApi("/api/world/emergence").then(setEmergence);
    fetchApi("/api/world/economy").then(setEconomy);
    fetchApi("/api/world/language").then(setLanguage);
    fetchApi("/api/world/language/terms").then(setTerms);
    fetchApi("/api/world/history?limit=20").then(setHistory);
    fetchApi("/api/world/culture").then(setCulture);
    fetchApi("/api/guilds").then(setGuilds);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-refresh on world events
  useWorldEvents((event) => {
    if (["economy", "pet_worked", "relationship", "language", "world_history", "guild", "emergence"].includes(event.type)) {
      loadAll();
    }
  });

  const tabStyle = (t: string) => ({
    padding: "6px 12px", borderRadius: 16, fontSize: 12, cursor: "pointer",
    background: tab === t ? "rgba(100,200,255,0.3)" : "rgba(50,50,80,0.4)",
    border: tab === t ? "1px solid #6cf" : "1px solid transparent",
    color: "#fff",
  });

  const eraEmoji: Record<string, string> = {
    founding: "🌱", early: "🏗️", growth: "📈", flourishing: "🌟"
  };

  return (
    <div style={{ padding: "12px", color: "#fff", maxWidth: 420, margin: "0 auto" }}>
      <h3 style={{ textAlign: "center", margin: "0 0 8px" }}>📊 文明仪表盘</h3>

      {/* Era */}
      {emergence && (
        <div style={{
          textAlign: "center", padding: 8, marginBottom: 12,
          background: "linear-gradient(135deg, #1a1a3e, #2a1a3e)", borderRadius: 8
        }}>
          <span style={{ fontSize: 24 }}>{eraEmoji[emergence.currentEra] || "🌱"}</span>
          <div style={{ fontSize: 14, fontWeight: "bold", marginTop: 4 }}>
            {emergence.currentEra === "founding" ? "开创时代" :
             emergence.currentEra === "early" ? "早期时代" :
             emergence.currentEra === "growth" ? "成长时代" : "繁荣时代"}
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <StatCard label="经济" value={economy ? `${economy.totalBalance} 💰` : "..."} sub={economy ? `${economy.totalPets}只Pet · 均${economy.avgBalance}` : ""} />
        <StatCard label="基尼系数" value={emergence ? emergence.gini.toFixed(3) : "..."} sub={emergence?.gini < 0.3 ? "社会和谐 ✅" : emergence?.gini < 0.6 ? "正常" : "贫富分化 ⚠️"} />
        <StatCard label="文化" value={emergence ? `${emergence.culturalMemories}` : "..."} sub="集体记忆" />
        <StatCard label="流行语" value={language ? `${language.totalTerms}` : "..."} sub={language ? `🌟${language.popularTerms} 📈${language.spreadingTerms}` : ""} />
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={tabStyle("overview")} onClick={() => setTab("overview")}>总览</span>
        <span style={tabStyle("history")} onClick={() => setTab("history")}>📜 历史</span>
        <span style={tabStyle("culture")} onClick={() => setTab("culture")}>🎭 文化</span>
        <span style={tabStyle("language")} onClick={() => setTab("language")}>📝 语言</span>
        <span style={tabStyle("social")} onClick={() => setTab("social")}>🕸️ 关系</span>
        <span style={tabStyle("economy")} onClick={() => setTab("economy")}>💰 经济</span>
      </div>

      {/* Content */}
      {tab === "overview" && (
        <div>
          {guilds.length > 0 && (
            <Section title="🏰 公会">
              {guilds.map((g: any) => (
                <div key={g.id} style={{ padding: "6px 0", borderBottom: "1px solid #333" }}>
                  <div style={{ fontWeight: "bold", fontSize: 13 }}>{g.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    创始人: {g.founder_name} · {g.member_count}人 · 声望{g.reputation}
                  </div>
                </div>
              ))}
            </Section>
          )}
          {economy && (
            <Section title="💰 今日经济">
              <div style={{ fontSize: 12 }}>交易: {economy.todayTransactions}笔 · 总流通: {economy.totalBalance}币</div>
            </Section>
          )}
        </div>
      )}

      {tab === "history" && (
        <Section title="📜 世界历史">
          {history.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>暂无历史事件</div>}
          {history.map((e: any) => (
            <div key={e.id} style={{ padding: "8px 0", borderBottom: "1px solid #222" }}>
              <div style={{ fontSize: 11, opacity: 0.5 }}>
                {eraEmoji[e.era] || ""} {e.era} · {new Date(e.created_at + "Z").toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{ fontSize: 13, fontWeight: "bold", marginTop: 2 }}>{e.title}</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{e.description}</div>
            </div>
          ))}
        </Section>
      )}

      {tab === "culture" && (
        <Section title="🎭 集体记忆">
          {culture.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>文化还在形成中...</div>}
          {culture.map((c: any) => (
            <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid #222" }}>
              <div style={{ fontSize: 13, fontWeight: "bold" }}>{c.title}</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{c.description}</div>
              <div style={{ fontSize: 10, opacity: 0.4, marginTop: 2 }}>重要度: {"⭐".repeat(Math.min(5, Math.ceil(c.importance / 2)))}</div>
            </div>
          ))}
        </Section>
      )}

      {tab === "language" && (
        <Section title="📝 PixelVerse词汇表">
          {terms.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>还没有新词诞生</div>}
          {terms.map((t: any) => (
            <div key={t.id} style={{ padding: "6px 0", borderBottom: "1px solid #222" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 13, fontWeight: "bold",
                  color: t.status === "popular" ? "#ffd700" : t.status === "spreading" ? "#6cf" : "#aaa"
                }}>「{t.term}」</span>
                <span style={{
                  fontSize: 9, padding: "1px 6px", borderRadius: 8,
                  background: t.status === "popular" ? "#ffd700" : t.status === "spreading" ? "#6cf" : "#555",
                  color: t.status === "popular" || t.status === "spreading" ? "#000" : "#fff",
                }}>{t.status}</span>
              </div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{t.meaning}</div>
              <div style={{ fontSize: 10, opacity: 0.4 }}>使用: {t.use_count}次 · {t.unique_users}人</div>
            </div>
          ))}
        </Section>
      )}

      {tab === "social" && <SocialNetwork />}
      {tab === "economy" && <EconomyChart />}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      padding: "10px", background: "rgba(30,30,60,0.6)", borderRadius: 8,
      border: "1px solid #333", textAlign: "center"
    }}>
      <div style={{ fontSize: 10, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: "bold", margin: "4px 0" }}>{value}</div>
      <div style={{ fontSize: 10, opacity: 0.5 }}>{sub}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 6, borderBottom: "1px solid #444", paddingBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}
