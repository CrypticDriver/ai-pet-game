/**
 * ActivityFeed — Shows what your pet did while you were away
 */

import { useState, useEffect } from "react";
import { api } from "../api.js";

interface ActivityEntry {
  id: number;
  pet_id: string;
  action_type: string;
  action_data: string;
  location: string;
  created_at: string;
}

interface Props {
  petId: string;
}

export function ActivityFeed({ petId }: Props) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api.getActivity(petId).then(setActivities).catch(() => {});
    // Refresh every 60s
    const iv = setInterval(() => {
      api.getActivity(petId).then(setActivities).catch(() => {});
    }, 60000);
    return () => clearInterval(iv);
  }, [petId]);

  if (activities.length === 0) return null;

  const parseData = (raw: string) => {
    try { return JSON.parse(raw); } catch { return { description: raw, emoji: "🐾" }; }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts + "Z");
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}小时前`;
    return `${Math.floor(diffHrs / 24)}天前`;
  };

  const shown = expanded ? activities : activities.slice(0, 3);

  return (
    <div className="activity-feed">
      <div className="activity-header" onClick={() => setExpanded(!expanded)}>
        <span>📋 Pet 日记</span>
        <span className="activity-toggle">{expanded ? "收起 ▲" : "展开 ▼"}</span>
      </div>
      <div className="activity-list">
        {shown.map((a) => {
          const data = parseData(a.action_data);
          return (
            <div key={a.id} className="activity-entry">
              <span className="activity-emoji">{data.emoji || "🐾"}</span>
              <span className="activity-text">{data.description}</span>
              <span className="activity-time">{formatTime(a.created_at)}</span>
            </div>
          );
        })}
      </div>
      {!expanded && activities.length > 3 && (
        <div className="activity-more" onClick={() => setExpanded(true)}>
          还有 {activities.length - 3} 条记录...
        </div>
      )}
    </div>
  );
}
