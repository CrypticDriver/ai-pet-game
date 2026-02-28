/**
 * Plaza Background — outdoor social area drawn with Canvas 2D
 * Features: sky, grass, trees, fountain, benches, paths
 */

const PIXEL = 3;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x * PIXEL, y * PIXEL, w * PIXEL, h * PIXEL);
}

export function renderPlazaBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeOfDay: "day" | "sunset" | "night" = "day",
): void {
  const cols = Math.ceil(width / PIXEL);
  const rows = Math.ceil(height / PIXEL);
  const skyH = Math.floor(rows * 0.35);

  // ── Sky ──
  const skyColors = {
    day: ["#87CEEB", "#B0E0FF"],
    sunset: ["#FF6B35", "#FFB88C"],
    night: ["#0a0a2e", "#1a1a4e"],
  };
  const [skyTop, skyBot] = skyColors[timeOfDay];
  const skyGrad = ctx.createLinearGradient(0, 0, 0, skyH * PIXEL);
  skyGrad.addColorStop(0, skyTop);
  skyGrad.addColorStop(1, skyBot);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, skyH * PIXEL);

  // Sun/Moon
  if (timeOfDay === "day") {
    ctx.globalAlpha = 0.9;
    px(ctx, cols - 12, 4, 4, 4, "#FFD700");
    px(ctx, cols - 13, 5, 1, 2, "#FFD700");
    px(ctx, cols - 8, 5, 1, 2, "#FFD700");
    ctx.globalAlpha = 1;
  } else if (timeOfDay === "night") {
    ctx.globalAlpha = 0.9;
    px(ctx, cols - 14, 3, 3, 3, "#F0E68C");
    px(ctx, cols - 14, 3, 1, 1, "#0a0a2e"); // crescent
    ctx.globalAlpha = 1;
    // Stars
    ctx.globalAlpha = 0.6;
    const starPositions = [[5, 2], [15, 5], [25, 3], [35, 6], [45, 2], [55, 4], [65, 3], [75, 5], [85, 2]];
    for (const [sx, sy] of starPositions) {
      if (sx < cols && sy < skyH) px(ctx, sx, sy, 1, 1, "#ffffff");
    }
    ctx.globalAlpha = 1;
  }

  // Clouds (day/sunset only)
  if (timeOfDay !== "night") {
    ctx.globalAlpha = 0.6;
    // Cloud 1
    px(ctx, 8, 6, 6, 2, "#ffffff");
    px(ctx, 9, 5, 4, 1, "#ffffff");
    // Cloud 2
    px(ctx, 30, 4, 5, 2, "#ffffff");
    px(ctx, 31, 3, 3, 1, "#ffffff");
    // Cloud 3
    px(ctx, 55, 7, 7, 2, "#ffffff");
    px(ctx, 56, 6, 5, 1, "#ffffff");
    ctx.globalAlpha = 1;
  }

  // ── Grass ──
  const grassColor = timeOfDay === "night" ? "#1a3a1a" : timeOfDay === "sunset" ? "#2a5a2a" : "#4a8c4a";
  const grassAlt = timeOfDay === "night" ? "#153015" : timeOfDay === "sunset" ? "#245524" : "#3d7a3d";
  for (let y = skyH; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = (x + y) % 3 === 0 ? grassAlt : grassColor;
      px(ctx, x, y, 1, 1, c);
    }
  }

  // ── Central path (stone) ──
  const pathX = Math.floor(cols * 0.3);
  const pathW = Math.floor(cols * 0.4);
  const pathY = skyH + 2;
  const pathH = rows - skyH - 4;
  const stoneColor = timeOfDay === "night" ? "#3a3a4a" : "#9a9a8a";
  const stoneAlt = timeOfDay === "night" ? "#333340" : "#8a8a7a";
  for (let y = pathY; y < pathY + pathH; y++) {
    for (let x = pathX; x < pathX + pathW; x++) {
      const c = (x + y) % 2 === 0 ? stoneColor : stoneAlt;
      px(ctx, x, y, 1, 1, c);
    }
  }

  // ── Trees (left and right) ──
  const treeColor = timeOfDay === "night" ? "#1a4a1a" : "#2d6b2d";
  const treeTrunk = "#6B4226";

  // Left tree
  const ltx = 5, lty = skyH - 3;
  px(ctx, ltx + 2, lty + 6, 2, 5, treeTrunk);
  px(ctx, ltx, lty + 2, 6, 4, treeColor);
  px(ctx, ltx + 1, lty, 4, 2, treeColor);

  // Right tree
  const rtx = cols - 11, rty = skyH - 4;
  px(ctx, rtx + 2, rty + 7, 2, 5, treeTrunk);
  px(ctx, rtx, rty + 3, 6, 4, treeColor);
  px(ctx, rtx + 1, rty + 1, 4, 2, treeColor);
  px(ctx, rtx + 2, rty, 2, 1, treeColor);

  // ── Fountain (center) ──
  const fX = Math.floor(cols / 2) - 3;
  const fY = skyH + Math.floor(pathH * 0.3);
  const fountainColor = timeOfDay === "night" ? "#4a4a5a" : "#8a8a9a";
  const waterColor = timeOfDay === "night" ? "#2a4a6a" : "#5a9aca";

  // Base
  px(ctx, fX, fY + 2, 6, 2, fountainColor);
  px(ctx, fX + 1, fY + 1, 4, 1, fountainColor);
  // Water
  px(ctx, fX + 1, fY + 2, 4, 1, waterColor);
  // Spout
  px(ctx, fX + 2, fY - 1, 2, 2, fountainColor);
  // Water spray
  ctx.globalAlpha = 0.5;
  px(ctx, fX + 2, fY - 2, 1, 1, waterColor);
  px(ctx, fX + 3, fY - 3, 1, 1, waterColor);
  px(ctx, fX + 1, fY - 2, 1, 1, waterColor);
  ctx.globalAlpha = 1;

  // ── Benches ──
  const benchColor = timeOfDay === "night" ? "#4a3020" : "#8B6914";
  // Left bench
  px(ctx, pathX - 4, skyH + 6, 3, 2, benchColor);
  px(ctx, pathX - 4, skyH + 5, 1, 1, benchColor);
  px(ctx, pathX - 2, skyH + 5, 1, 1, benchColor);
  // Right bench
  px(ctx, pathX + pathW + 1, skyH + 8, 3, 2, benchColor);
  px(ctx, pathX + pathW + 1, skyH + 7, 1, 1, benchColor);
  px(ctx, pathX + pathW + 3, skyH + 7, 1, 1, benchColor);

  // ── Flowers ──
  if (timeOfDay !== "night") {
    const flowers = [
      [pathX - 2, rows - 5, "#ff69b4"],
      [pathX - 3, rows - 4, "#ff69b4"],
      [pathX + pathW + 2, rows - 6, "#FFD700"],
      [pathX + pathW + 3, rows - 5, "#FFD700"],
      [3, rows - 3, "#ff6b9d"],
      [cols - 4, rows - 4, "#9b59b6"],
    ];
    for (const [fx, fy, fc] of flowers) {
      px(ctx, fx as number, fy as number, 1, 1, fc as string);
    }
  }

  // ── Lamp posts (sunset/night glow) ──
  if (timeOfDay === "sunset" || timeOfDay === "night") {
    const lampColor = "#FFD700";
    const lampX1 = pathX - 1;
    const lampX2 = pathX + pathW;
    const lampY = skyH + 2;

    // Posts
    px(ctx, lampX1, lampY, 1, 6, "#555");
    px(ctx, lampX2, lampY, 1, 6, "#555");
    // Lights
    px(ctx, lampX1 - 1, lampY - 1, 3, 2, lampColor);
    px(ctx, lampX2 - 1, lampY - 1, 3, 2, lampColor);

    // Glow
    ctx.globalAlpha = 0.08;
    const glowR = 15 * PIXEL;
    for (const lx of [lampX1, lampX2]) {
      const gx = (lx + 0.5) * PIXEL;
      const gy = (lampY - 0.5) * PIXEL;
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, glowR);
      grad.addColorStop(0, lampColor);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(gx - glowR, gy - glowR, glowR * 2, glowR * 2);
    }
    ctx.globalAlpha = 1;
  }

  // ── Butterflies (day only) ──
  if (timeOfDay === "day") {
    ctx.globalAlpha = 0.7;
    px(ctx, 20, skyH + 3, 1, 1, "#ff69b4");
    px(ctx, 60, skyH + 5, 1, 1, "#FFD700");
    ctx.globalAlpha = 1;
  }
}
