import { useState } from "react";

interface Props {
  onStart: (name: string, petName: string) => void;
}

export function WelcomeScreen({ onStart }: Props) {
  const [petName, setPetName] = useState("");

  return (
    <div className="welcome">
      <div style={{ fontSize: "64px" }}>🐣</div>
      <h1>AI Pet</h1>
      <p>
        你的像素伙伴在等你！<br />
        给它取个名字吧
      </p>
      <input
        value={petName}
        onChange={(e) => setPetName(e.target.value)}
        placeholder="宠物名字"
        maxLength={20}
        onKeyDown={(e) => {
          if (e.key === "Enter" && petName.trim()) {
            onStart("Player", petName.trim());
          }
        }}
      />
      <button
        onClick={() => onStart("Player", petName.trim() || "Pixel")}
      >
        🎮 开始冒险
      </button>
    </div>
  );
}
