import { useState, useEffect, useRef, useCallback } from "react";

interface RelNode {
  id: string;
  name: string;
  mbti: string;
  location: string;
}

interface RelEdge {
  from: string;
  to: string;
  affinity: number;
  trust: number;
  level: string;
}

const LEVEL_COLORS: Record<string, string> = {
  acquaintance: "#666",
  friend: "#4ca",
  close_friend: "#f90",
  rival: "#e44",
};

const fetchApi = (url: string) => fetch(url).then(r => r.json());

export function SocialNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<RelNode[]>([]);
  const [edges, setEdges] = useState<RelEdge[]>([]);
  const [selected, setSelected] = useState<RelNode | null>(null);
  const [selectedEdges, setSelectedEdges] = useState<RelEdge[]>([]);
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    fetchApi("/api/world/social-graph").then((data: { nodes: RelNode[]; edges: RelEdge[] }) => {
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    });
  }, []);

  // Layout: simple force-directed in a few iterations
  useEffect(() => {
    if (nodes.length === 0) return;
    const W = 380, H = 300;
    const pos = new Map<string, { x: number; y: number }>();

    // Initial: circle layout
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      pos.set(n.id, { x: W / 2 + Math.cos(angle) * 100, y: H / 2 + Math.sin(angle) * 100 });
    });

    // Simple force simulation (50 iterations)
    for (let iter = 0; iter < 50; iter++) {
      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = pos.get(nodes[i].id)!;
          const b = pos.get(nodes[j].id)!;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.max(20, Math.sqrt(dx * dx + dy * dy));
          const force = 2000 / (dist * dist);
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.x -= fx; a.y -= fy;
          b.x += fx; b.y += fy;
        }
      }
      // Attraction along edges
      for (const e of edges) {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ideal = 80;
        const force = (dist - ideal) * 0.05;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.x += fx; a.y += fy;
        b.x -= fx; b.y -= fy;
      }
      // Center gravity
      for (const n of nodes) {
        const p = pos.get(n.id)!;
        p.x += (W / 2 - p.x) * 0.02;
        p.y += (H / 2 - p.y) * 0.02;
        p.x = Math.max(25, Math.min(W - 25, p.x));
        p.y = Math.max(25, Math.min(H - 25, p.y));
      }
    }

    posRef.current = pos;
    draw();
  }, [nodes, edges]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = posRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw edges
    for (const e of edges) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = LEVEL_COLORS[e.level] || "#555";
      ctx.lineWidth = Math.max(1, e.affinity / 25);
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Label
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ctx.fillStyle = LEVEL_COLORS[e.level] || "#888";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`♡${e.affinity}`, mx, my - 3);
    }

    // Draw nodes
    for (const n of nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      const isSelected = selected?.id === n.id;

      // Circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, isSelected ? 20 : 16, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "rgba(100,200,255,0.3)" : "rgba(40,40,70,0.8)";
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#6cf" : "#666";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Name
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(n.name.slice(0, 4), p.x, p.y + 3);

      // MBTI badge
      ctx.fillStyle = "#aaa";
      ctx.font = "8px sans-serif";
      ctx.fillText(n.mbti || "", p.x, p.y + 13);
    }
  }, [nodes, edges, selected]);

  useEffect(() => { draw(); }, [draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    for (const n of nodes) {
      const p = posRef.current.get(n.id);
      if (!p) continue;
      const dx = p.x - x, dy = p.y - y;
      if (dx * dx + dy * dy < 400) {
        setSelected(n);
        setSelectedEdges(edges.filter(ed => ed.from === n.id || ed.to === n.id));
        return;
      }
    }
    setSelected(null);
    setSelectedEdges([]);
  }, [nodes, edges]);

  if (nodes.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#888" }}>
        <h3 style={{ color: "#fff" }}>🕸️ 关系网络</h3>
        <div style={{ fontSize: 13 }}>还没有Pet之间的关系数据</div>
        <div style={{ fontSize: 11, marginTop: 8, opacity: 0.6 }}>Pet们需要在广场互动才会建立关系</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px", color: "#fff", maxWidth: 420, margin: "0 auto" }}>
      <h3 style={{ textAlign: "center", margin: "0 0 8px" }}>🕸️ 关系网络</h3>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 8, fontSize: 10 }}>
        <span><span style={{ color: "#666" }}>●</span> 相识</span>
        <span><span style={{ color: "#4ca" }}>●</span> 朋友</span>
        <span><span style={{ color: "#f90" }}>●</span> 密友</span>
        <span><span style={{ color: "#e44" }}>●</span> 对手</span>
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} width={380} height={300} onClick={handleClick}
        style={{ background: "rgba(15,15,35,0.8)", borderRadius: 8, border: "1px solid #333", display: "block", margin: "0 auto", cursor: "pointer" }}
      />

      {/* Selected node detail */}
      {selected && (
        <div style={{ marginTop: 10, padding: 10, background: "rgba(30,30,60,0.8)", borderRadius: 8, border: "1px solid #444" }}>
          <div style={{ fontSize: 14, fontWeight: "bold" }}>{selected.name} <span style={{ fontSize: 11, color: "#aaa" }}>{selected.mbti}</span></div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>📍 {selected.location}</div>
          {selectedEdges.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {selectedEdges.map((e, i) => {
                const other = e.from === selected.id ? e.to : e.from;
                const otherNode = nodes.find(n => n.id === other);
                return (
                  <div key={i} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid #333" }}>
                    → {otherNode?.name || "?"}: <span style={{ color: LEVEL_COLORS[e.level] || "#888" }}>
                      {e.level === "acquaintance" ? "相识" : e.level === "friend" ? "朋友" : e.level === "close_friend" ? "密友" : "对手"}
                    </span> (♡{e.affinity} 信任{e.trust})
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ textAlign: "center", fontSize: 10, opacity: 0.4, marginTop: 8 }}>
        {nodes.length}只Pix · {edges.length}条关系 · 点击查看详情
      </div>
    </div>
  );
}
