/**
 * PetCanvas — Canvas-based pet renderer with animation
 * Uses requestAnimationFrame game loop (inspired by OpenClaw-bot-review)
 */

import { useRef, useEffect, useCallback, useState } from "react";
import type { PetExpression } from "../../shared/types.js";
import { EXPRESSION_SVG_PATH } from "../../shared/types.js";
import {
  type PetAnimState,
  type PetRenderState,
  createPetRenderState,
  updatePetState,
  getAnimTransform,
  renderShadow,
  renderParticles,
  spawnParticles,
  applyHueShift,
  clearSpriteCache,
} from "../engine/petRenderer.js";

interface PetCanvasProps {
  expression: PetExpression;
  animState: PetAnimState;
  hueShift?: number;
  width?: number;
  height?: number;
  onTap?: () => void;
}

// Load SVG as Image (cached)
const imageCache = new Map<string, HTMLImageElement>();

function loadSvgImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached && cached.complete) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export function PetCanvas({
  expression,
  animState,
  hueShift = 0,
  width = 220,
  height = 220,
  onTap,
}: PetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PetRenderState>(createPetRenderState());
  const prevTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Load expression pixel head (this IS the pet)
  useEffect(() => {
    const src = EXPRESSION_SVG_PATH(expression);
    loadSvgImage(src).then((img) => {
      imgRef.current = img;
    });
  }, [expression]);

  // Update animation state
  useEffect(() => {
    const state = stateRef.current;
    if (state.animState !== animState) {
      state.animState = animState;
      state.stateTime = 0;

      // Spawn particles on state change
      const cx = width / 2;
      const cy = height / 2;
      if (animState === "love") spawnParticles(state, "💕", 5, cx, cy);
      if (animState === "eat") spawnParticles(state, "✨", 3, cx, cy);
      if (animState === "bounce") spawnParticles(state, "⭐", 4, cx, cy);
    }
  }, [animState, width, height]);

  // Update hue shift
  useEffect(() => {
    stateRef.current.hueShift = hueShift;
  }, [hueShift]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    function frame(time: number) {
      const dt = prevTimeRef.current ? Math.min((time - prevTimeRef.current) / 1000, 0.1) : 0.016;
      prevTimeRef.current = time;

      const state = stateRef.current;
      updatePetState(state, dt);

      // Clear
      ctx!.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2 + 10;
      const petSize = 140;

      // Get animation transform
      const transform = getAnimTransform(state, cx, cy);

      // Render shadow
      renderShadow(ctx!, cx, cy + petSize / 2 - 10, petSize, transform.translateY);

      // Draw pet with transform
      ctx!.save();
      ctx!.translate(cx, cy + transform.translateY);
      ctx!.rotate(transform.rotation);
      ctx!.scale(transform.scaleX, transform.scaleY);

      // Draw pixel head as the full pet
      if (imgRef.current) {
        const petSize = 120;
        ctx!.imageSmoothingEnabled = false; // crisp pixel art
        ctx!.drawImage(
          imgRef.current,
          -petSize / 2,
          -petSize / 2,
          petSize,
          petSize,
        );
        ctx!.imageSmoothingEnabled = true;
      }

      ctx!.restore();

      // Render particles
      renderParticles(ctx!, state.particles);

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        cursor: "pointer",
        imageRendering: "auto",
      }}
      onClick={onTap}
    />
  );
}
