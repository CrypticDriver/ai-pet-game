import { useState, useEffect, useCallback } from "react";
import { useWorldEvents } from "../hooks/useWorldEvents.js";

const fetchApi = (url: string) => fetch(url).then(r => r.json());

interface LocationData {
  id: string;
  name: string;
  description: string;
  petCount: number;
  connects_to: string[];
  position_x: number;
  position_y: number;
}

// Map position to canvas coords
const POS_MAP: Record<string, { x: number; y: number; emoji: string }> = {
  hub:     { x: 200, y: 160, emoji: "🏛️" },
  park:    { x: 60,  y: 80,  emoji: "🌳" },
  lake:    { x: 60,  y: 240, emoji: "🌊" },
  library: { x: 340, y: 80,  emoji: "📚" },
  cafe:    { x: 340, y: 160, emoji: "☕" },
  market:  { x: 340, y: 240, emoji: "🏪" },
};

export function WorldMapView() {
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [selected, setSelected] = useState<LocationData | null>(null);
  const [pets, setPets] = useState<any[]>([]);

  const loadMap = useCallback(() => { fetchApi("/api/world/map").then(setLocations); }, []);

  useEffect(() => { loadMap(); }, [loadMap]);

  // Auto-refresh on world events
  useWorldEvents((event) => {
    if (event.type === "pet_moved" || event.type === "pet_action") loadMap();
  });

  useEffect(() => {
    if (selected) {
      fetchApi(`/api/world/location/${selected.id}`).then((d: any) => setPets(d.pets || []));
    }
  }, [selected]);

  return (
    <div style={{ padding: "12px", color: "#fff", maxWidth: 420, margin: "0 auto" }}>
      <h3 style={{ textAlign: "center", margin: "0 0 12px" }}>🗺️ PixelVerse 世界地图</h3>

      {/* Map Canvas */}
      <div style={{
        position: "relative", width: 400, height: 300,
        background: "linear-gradient(135deg, #1a1a3e 0%, #0a2a1a 100%)",
        borderRadius: 12, border: "1px solid #333", margin: "0 auto",
        overflow: "hidden"
      }}>
        {/* Connection lines */}
        <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
          {locations.map(loc => {
            const from = POS_MAP[loc.id];
            if (!from) return null;
            return (Array.isArray(loc.connects_to) ? loc.connects_to : []).map(cid => {
              const to = POS_MAP[cid];
              if (!to) return null;
              return (
                <line key={`${loc.id}-${cid}`}
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke="rgba(100,200,255,0.3)" strokeWidth={2} strokeDasharray="4,4"
                />
              );
            });
          })}
        </svg>

        {/* Location nodes */}
        {locations.map(loc => {
          const pos = POS_MAP[loc.id];
          if (!pos) return null;
          const isSelected = selected?.id === loc.id;
          return (
            <div key={loc.id} onClick={() => setSelected(loc)} style={{
              position: "absolute", left: pos.x - 30, top: pos.y - 30,
              width: 60, height: 60, borderRadius: "50%",
              background: isSelected ? "rgba(100,200,255,0.3)" : "rgba(50,50,80,0.6)",
              border: isSelected ? "2px solid #6cf" : "1px solid #555",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              cursor: "pointer", transition: "all 0.2s",
              transform: isSelected ? "scale(1.1)" : "scale(1)",
            }}>
              <span style={{ fontSize: 20 }}>{pos.emoji}</span>
              <span style={{ fontSize: 9, opacity: 0.8 }}>{loc.name.slice(0, 4)}</span>
              {loc.petCount > 0 && (
                <span style={{
                  position: "absolute", top: -4, right: -4,
                  background: "#e44", color: "#fff", borderRadius: "50%",
                  width: 18, height: 18, fontSize: 10, display: "flex",
                  alignItems: "center", justifyContent: "center", fontWeight: "bold"
                }}>{loc.petCount}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected location detail */}
      {selected && (
        <div style={{
          marginTop: 12, padding: 12, background: "rgba(30,30,60,0.8)",
          borderRadius: 8, border: "1px solid #444"
        }}>
          <div style={{ fontSize: 16, fontWeight: "bold" }}>
            {POS_MAP[selected.id]?.emoji} {selected.name}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{selected.description}</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>
            {selected.petCount > 0
              ? `${selected.petCount} 只Pix在这里`
              : "暂时没有Pix"}
          </div>
          {pets.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {pets.map((p: any) => (
                <span key={p.pet_id} style={{
                  display: "inline-block", padding: "2px 8px", margin: 2,
                  background: "rgba(100,200,255,0.15)", borderRadius: 12, fontSize: 11
                }}>{p.name} {p.current_action !== "idle" ? `(${p.current_action})` : ""}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
