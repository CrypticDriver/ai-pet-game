import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3000";
let shotN = 0;

async function shot(page: any, label: string) {
  shotN++;
  const name = `civ-${String(shotN).padStart(2,"0")}-${label}`;
  await page.screenshot({ path: `screenshots/${name}.png` });
  console.log(`📸 ${shotN}. ${label}`);
}

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

async function run() {
  console.log("🎬 Civilization Demo — Phase 1 Test\n");

  // ── Step 1: Create two pets ──
  console.log("=== 1. 创建两只Pet ===");
  const petA = (await api("POST", "/api/init", { userId: "userA", username: "玩家A", petName: "小白" })).pet;
  const petB = (await api("POST", "/api/init", { userId: "userB", username: "玩家B", petName: "黑猫" })).pet;
  console.log(`  小白: ${petA.id}`);
  console.log(`  黑猫: ${petB.id}`);

  // ── Step 2: Check world map ──
  console.log("\n=== 2. 世界地图 ===");
  const map = await api("GET", "/api/world/map");
  for (const loc of map) {
    console.log(`  ${loc.id}: ${loc.name} (${loc.petCount} pets) → ${loc.connects_to.join(", ")}`);
  }

  // ── Step 3: Move 小白 to park ──
  console.log("\n=== 3. 小白移动到公园 ===");
  const moveResult = await api("POST", `/api/pet/${petA.id}/move`, { destination: "park" });
  console.log(`  结果: ok=${moveResult.ok}, 到了${moveResult.location?.name || moveResult.reason}`);

  // ── Step 4: 小白 looks around ──
  console.log("\n=== 4. 小白看看周围 ===");
  const perception = await api("GET", `/api/pet/${petA.id}/perception`);
  console.log(`  位置: ${perception.location.name}`);
  console.log(`  附近Pet: ${perception.nearbyPets.length}`);
  console.log(`  氛围: ${perception.location.mood}`);

  // ── Step 5: Move 黑猫 to park too ──
  console.log("\n=== 5. 黑猫也去公园 ===");
  const moveB = await api("POST", `/api/pet/${petB.id}/move`, { destination: "park" });
  console.log(`  结果: ok=${moveB.ok}, 到了${moveB.location?.name}`);

  // ── Step 6: 小白 talks to 黑猫 (LLM-to-LLM) ──
  console.log("\n=== 6. 小白跟黑猫说话 (LLM对LLM) ===");
  console.log("  等待LLM响应...");
  const talkResult = await api("POST", `/api/pet/${petA.id}/talk`, {
    targetName: "黑猫",
    message: "你好呀！你也来公园了？这里好安静~"
  });
  console.log(`  ok=${talkResult.ok}`);
  if (talkResult.reply) {
    console.log(`  黑猫回复: "${talkResult.reply.slice(0, 100)}"`);
  } else {
    console.log(`  错误: ${talkResult.error}`);
  }

  // ── Step 7: Check messages ──
  console.log("\n=== 7. 消息统计 ===");
  const msgStats = await api("GET", "/api/world/message-stats");
  console.log(`  总消息: ${msgStats.total}`);
  console.log(`  今日: ${msgStats.today}`);

  // ── Step 8: Move 小白 further (park→lake) ──
  console.log("\n=== 8. 小白去月光湖 ===");
  const moveLake = await api("POST", `/api/pet/${petA.id}/move`, { destination: "lake" });
  console.log(`  结果: ok=${moveLake.ok}, 到了${moveLake.location?.name || moveLake.reason}`);

  // ── Step 9: 小白 looks around at lake ──
  console.log("\n=== 9. 小白在月光湖看看 ===");
  const lakePerce = await api("GET", `/api/pet/${petA.id}/perception`);
  console.log(`  位置: ${lakePerce.location.name}`);
  console.log(`  附近Pet: ${lakePerce.nearbyPets.length}`);
  console.log(`  描述: ${lakePerce.location.description?.slice(0, 60)}`);

  // ── Step 10: Check soul ──
  console.log("\n=== 10. Pet灵魂 ===");
  const soulA = await api("GET", `/api/pet/${petA.id}/soul`);
  const soulB = await api("GET", `/api/pet/${petB.id}/soul`);
  console.log(`  小白: 好奇${soulA.traits?.curiosity} 社交${soulA.traits?.sociability} 活泼${soulA.traits?.playfulness}`);
  console.log(`  黑猫: 好奇${soulB.traits?.curiosity} 社交${soulB.traits?.sociability} 活泼${soulB.traits?.playfulness}`);

  // ── Step 11: Check social health ──
  console.log("\n=== 11. 社交健康 ===");
  const healthA = await api("GET", `/api/pet/${petA.id}/social-health`);
  const healthB = await api("GET", `/api/pet/${petB.id}/social-health`);
  console.log(`  小白: ${healthA.status}, 朋友${healthA.friendCount}, 最近社交${healthA.recentSocialCount}`);
  console.log(`  黑猫: ${healthB.status}, 朋友${healthB.friendCount}, 最近社交${healthB.recentSocialCount}`);

  // ── Step 12: Blocked movement test ──
  console.log("\n=== 12. 移动阻断测试 (lake→market) ===");
  const blocked = await api("POST", `/api/pet/${petA.id}/move`, { destination: "market" });
  console.log(`  ok=${blocked.ok}, 原因: ${blocked.reason}`);

  // ── Step 13: Check scheduler ──
  console.log("\n=== 13. 调度器状态 ===");
  const sched = await api("GET", "/api/world/scheduler-stats");
  console.log(`  活跃请求: ${sched.activeRequests}, 队列: ${sched.queueLength}`);

  // ── Browser screenshots ──
  console.log("\n=== 14. 浏览器截图 ===");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const page = await ctx.newPage();

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.locator("input").nth(0).fill("星星");
  await page.locator("button").last().click();
  await page.waitForTimeout(2000);
  await shot(page, "pet-room");

  await page.locator('button:has-text("广场")').click();
  await page.waitForTimeout(2000);
  await shot(page, "plaza");

  await page.setViewportSize({ width: 800, height: 430 });
  await page.waitForTimeout(1000);
  await shot(page, "plaza-landscape");

  await browser.close();

  console.log(`\n✅ Demo完成! ${shotN}张截图`);
}

run().catch(e => { console.error(e); process.exit(1); });
