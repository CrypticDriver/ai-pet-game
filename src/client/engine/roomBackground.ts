/**
 * Pixel Room Background — drawn purely with Canvas 2D
 * Cozy room with floor, wall, window, furniture outlines
 */

export interface RoomTheme {
  wallColor: string;
  floorColor: string;
  floorAlt: string;
  windowColor: string;
  windowFrame: string;
  furnitureColor: string;
  furnitureAccent: string;
  rugColor: string;
  rugAccent: string;
}

export const ROOM_THEMES: Record<string, RoomTheme> = {
  default: {
    wallColor: "#2a2a4a",
    floorColor: "#3d3250",
    floorAlt: "#352d45",
    windowColor: "#4a6fa5",
    windowFrame: "#5a5a7a",
    furnitureColor: "#4a4065",
    furnitureAccent: "#6a5a85",
    rugColor: "#4a3060",
    rugAccent: "#5a4070",
  },
  cozy: {
    wallColor: "#2d2844",
    floorColor: "#3a2e48",
    floorAlt: "#33293f",
    windowColor: "#5580b0",
    windowFrame: "#6a6a8a",
    furnitureColor: "#4d4268",
    furnitureAccent: "#6d5d88",
    rugColor: "#503568",
    rugAccent: "#604578",
  },
};

const PIXEL = 4; // each "pixel" is 4x4 real pixels for chunky pixel look

function drawPixelRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x * PIXEL, y * PIXEL, w * PIXEL, h * PIXEL);
}

function drawPixelBorder(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x * PIXEL + 0.5, y * PIXEL + 0.5, w * PIXEL - 1, h * PIXEL - 1);
}

/**
 * Render a cozy pixel room background
 * Call this BEFORE rendering the pet
 */
export function renderRoomBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: RoomTheme = ROOM_THEMES.default,
): void {
  const cols = Math.ceil(width / PIXEL);
  const rows = Math.ceil(height / PIXEL);
  const wallHeight = Math.floor(rows * 0.45); // wall takes ~45%

  // ── Wall ──
  drawPixelRect(ctx, 0, 0, cols, wallHeight, theme.wallColor);

  // Wall texture (subtle horizontal lines)
  ctx.globalAlpha = 0.05;
  for (let y = 2; y < wallHeight; y += 3) {
    drawPixelRect(ctx, 0, y, cols, 1, "#ffffff");
  }
  ctx.globalAlpha = 1;

  // ── Floor (checkerboard) ──
  for (let y = wallHeight; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const color = (x + y) % 2 === 0 ? theme.floorColor : theme.floorAlt;
      drawPixelRect(ctx, x, y, 1, 1, color);
    }
  }

  // ── Baseboard (wall-floor border) ──
  drawPixelRect(ctx, 0, wallHeight - 1, cols, 2, theme.furnitureColor);

  // ── Window (centered on wall) ──
  const winW = 12;
  const winH = 10;
  const winX = Math.floor((cols - winW) / 2);
  const winY = Math.floor(wallHeight * 0.2);

  // Window frame
  drawPixelRect(ctx, winX - 1, winY - 1, winW + 2, winH + 2, theme.windowFrame);
  // Window glass
  drawPixelRect(ctx, winX, winY, winW, winH, theme.windowColor);
  // Window cross
  drawPixelRect(ctx, winX + Math.floor(winW / 2), winY, 1, winH, theme.windowFrame);
  drawPixelRect(ctx, winX, winY + Math.floor(winH / 2), winW, 1, theme.windowFrame);

  // Window shine
  ctx.globalAlpha = 0.15;
  drawPixelRect(ctx, winX + 1, winY + 1, 3, 3, "#ffffff");
  ctx.globalAlpha = 1;

  // ── Stars/light through window ──
  ctx.globalAlpha = 0.3;
  drawPixelRect(ctx, winX + 2, winY + 2, 1, 1, "#ffffff");
  drawPixelRect(ctx, winX + winW - 3, winY + 3, 1, 1, "#ffffff");
  drawPixelRect(ctx, winX + 5, winY + 1, 1, 1, "#ffffff");
  ctx.globalAlpha = 1;

  // ── Rug (center of floor, under pet) ──
  const rugW = 16;
  const rugH = 6;
  const rugX = Math.floor((cols - rugW) / 2);
  const rugY = wallHeight + Math.floor((rows - wallHeight) * 0.35);

  // Rug body
  drawPixelRect(ctx, rugX, rugY, rugW, rugH, theme.rugColor);
  // Rug border
  drawPixelRect(ctx, rugX, rugY, rugW, 1, theme.rugAccent);
  drawPixelRect(ctx, rugX, rugY + rugH - 1, rugW, 1, theme.rugAccent);
  drawPixelRect(ctx, rugX, rugY, 1, rugH, theme.rugAccent);
  drawPixelRect(ctx, rugX + rugW - 1, rugY, 1, rugH, theme.rugAccent);

  // Rug pattern (diamond)
  ctx.globalAlpha = 0.2;
  const rugCX = rugX + Math.floor(rugW / 2);
  const rugCY = rugY + Math.floor(rugH / 2);
  drawPixelRect(ctx, rugCX, rugCY - 1, 1, 1, "#ffffff");
  drawPixelRect(ctx, rugCX - 1, rugCY, 1, 1, "#ffffff");
  drawPixelRect(ctx, rugCX + 1, rugCY, 1, 1, "#ffffff");
  drawPixelRect(ctx, rugCX, rugCY + 1, 1, 1, "#ffffff");
  ctx.globalAlpha = 1;

  // ── Food bowl (bottom-right) ──
  const bowlX = cols - 10;
  const bowlY = rows - 6;
  drawPixelRect(ctx, bowlX, bowlY + 1, 6, 3, theme.furnitureColor);
  drawPixelRect(ctx, bowlX + 1, bowlY, 4, 1, theme.furnitureColor);
  // Food in bowl
  drawPixelRect(ctx, bowlX + 1, bowlY + 1, 4, 1, theme.furnitureAccent);

  // ── Bed/cushion (bottom-left) ──
  const bedX = 2;
  const bedY = rows - 7;
  drawPixelRect(ctx, bedX, bedY + 1, 8, 4, theme.furnitureColor);
  drawPixelRect(ctx, bedX + 1, bedY, 6, 1, theme.furnitureAccent); // pillow
  // Bed texture
  ctx.globalAlpha = 0.1;
  drawPixelRect(ctx, bedX + 1, bedY + 2, 6, 1, "#ffffff");
  ctx.globalAlpha = 1;

  // ── Toy ball (floor, near center-right) ──
  const toyX = cols - 16;
  const toyY = wallHeight + 4;
  ctx.globalAlpha = 0.8;
  drawPixelRect(ctx, toyX, toyY, 2, 2, "#ff6b9d");
  drawPixelRect(ctx, toyX, toyY, 1, 1, "#ff9abc"); // shine
  ctx.globalAlpha = 1;

  // ── Plant pot (top-left corner of wall) ──
  const plantX = 3;
  const plantY = wallHeight - 6;
  // Pot
  drawPixelRect(ctx, plantX, plantY + 2, 4, 3, "#8B6914");
  drawPixelRect(ctx, plantX + 1, plantY + 1, 2, 1, "#8B6914");
  // Leaves
  drawPixelRect(ctx, plantX + 1, plantY - 1, 2, 2, "#4a8c5c");
  drawPixelRect(ctx, plantX, plantY, 1, 1, "#4a8c5c");
  drawPixelRect(ctx, plantX + 3, plantY, 1, 1, "#4a8c5c");

  // ── Shelf on wall (right side) ──
  const shelfX = cols - 12;
  const shelfY = Math.floor(wallHeight * 0.3);
  drawPixelRect(ctx, shelfX, shelfY, 8, 1, theme.furnitureColor);
  // Books on shelf
  drawPixelRect(ctx, shelfX + 1, shelfY - 3, 1, 3, "#6a5acd");
  drawPixelRect(ctx, shelfX + 2, shelfY - 2, 1, 2, "#cd5a6a");
  drawPixelRect(ctx, shelfX + 3, shelfY - 3, 1, 3, "#5acd6a");
  drawPixelRect(ctx, shelfX + 5, shelfY - 2, 2, 2, "#cdcd5a"); // box

  // ── Ambient glow (subtle vignette) ──
  const gradient = ctx.createRadialGradient(
    width / 2, height * 0.5, width * 0.15,
    width / 2, height * 0.5, width * 0.6,
  );
  gradient.addColorStop(0, "rgba(255, 200, 150, 0.04)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.08)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}
