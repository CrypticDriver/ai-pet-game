import { SKIN_THEMES } from "../../shared/types.js";

interface Props {
  skinId: string;
  emotion: string;
}

/**
 * Pure CSS pixel pet renderer.
 * Uses box-shadow to draw a 16x16 pixel grid — no images needed.
 * Each skin uses different colors from the theme.
 */
export function PixelPet({ skinId, emotion }: Props) {
  const theme = SKIN_THEMES[skinId] || SKIN_THEMES.default;

  // Eye state based on emotion
  const eyeStyle = emotion === "sleepy" ? "—" : emotion === "sad" ? "╥" : "●";
  const mouthStyle = emotion === "happy" ? "◡" : emotion === "sad" ? "╥" : "─";

  return (
    <svg viewBox="0 0 16 16" width="120" height="120" style={{ imageRendering: "pixelated" }}>
      {/* Body */}
      <rect x="4" y="4" width="8" height="9" rx="1" fill={theme.primary} />

      {/* Head top */}
      <rect x="5" y="2" width="6" height="3" rx="1" fill={theme.primary} />

      {/* Ears */}
      <rect x="4" y="1" width="2" height="3" rx="0.5" fill={theme.primary} />
      <rect x="10" y="1" width="2" height="3" rx="0.5" fill={theme.primary} />
      <rect x="4.5" y="1.5" width="1" height="2" rx="0.3" fill={theme.secondary} />
      <rect x="10.5" y="1.5" width="1" height="2" rx="0.3" fill={theme.secondary} />

      {/* Eyes */}
      {emotion === "sleepy" ? (
        <>
          <line x1="5.5" y1="6" x2="7" y2="6" stroke="#333" strokeWidth="0.5" />
          <line x1="9" y1="6" x2="10.5" y2="6" stroke="#333" strokeWidth="0.5" />
        </>
      ) : emotion === "happy" ? (
        <>
          <text x="6" y="6.5" fontSize="2" textAnchor="middle" fill="#333">◡</text>
          <text x="10" y="6.5" fontSize="2" textAnchor="middle" fill="#333">◡</text>
        </>
      ) : (
        <>
          <circle cx="6.5" cy="6" r="0.8" fill="#333" />
          <circle cx="9.5" cy="6" r="0.8" fill="#333" />
          {/* Eye shine */}
          <circle cx="6.2" cy="5.7" r="0.25" fill="white" />
          <circle cx="9.2" cy="5.7" r="0.25" fill="white" />
        </>
      )}

      {/* Nose */}
      <circle cx="8" cy="7.5" r="0.4" fill={theme.secondary} />

      {/* Mouth */}
      {emotion === "happy" ? (
        <path d="M 6.5 8.5 Q 8 10 9.5 8.5" fill="none" stroke="#333" strokeWidth="0.4" />
      ) : emotion === "sad" ? (
        <path d="M 6.5 9.5 Q 8 8 9.5 9.5" fill="none" stroke="#333" strokeWidth="0.4" />
      ) : (
        <line x1="7" y1="9" x2="9" y2="9" stroke="#333" strokeWidth="0.4" />
      )}

      {/* Cheek blush */}
      <circle cx="5" cy="8" r="0.8" fill={theme.secondary} opacity="0.3" />
      <circle cx="11" cy="8" r="0.8" fill={theme.secondary} opacity="0.3" />

      {/* Arms */}
      <rect x="3" y="7" width="1" height="4" rx="0.5" fill={theme.primary} />
      <rect x="12" y="7" width="1" height="4" rx="0.5" fill={theme.primary} />

      {/* Legs */}
      <rect x="5" y="12" width="2" height="2" rx="0.5" fill={theme.primary} />
      <rect x="9" y="12" width="2" height="2" rx="0.5" fill={theme.primary} />

      {/* Feet */}
      <rect x="4.5" y="13.5" width="3" height="1" rx="0.5" fill={theme.accent} />
      <rect x="8.5" y="13.5" width="3" height="1" rx="0.5" fill={theme.accent} />

      {/* Belly highlight */}
      <ellipse cx="8" cy="9" rx="2" ry="2.5" fill="white" opacity="0.15" />

      {/* Tail */}
      <path d="M 12 10 Q 14 8 13.5 6" fill="none" stroke={theme.accent} strokeWidth="1" strokeLinecap="round" />

      {/* Emotion particles */}
      {emotion === "happy" && (
        <>
          <text x="2" y="3" fontSize="1.5" opacity="0.7">✨</text>
          <text x="13" y="3" fontSize="1.5" opacity="0.7">✨</text>
        </>
      )}
      {emotion === "sleepy" && (
        <>
          <text x="12" y="3" fontSize="1.8" opacity="0.6">z</text>
          <text x="13.5" y="1.5" fontSize="1.2" opacity="0.4">z</text>
        </>
      )}
      {emotion === "sad" && (
        <>
          <text x="5.5" y="7.5" fontSize="0.8" opacity="0.5">💧</text>
        </>
      )}
    </svg>
  );
}
