import { chromium } from "playwright";
process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;

const BASE = "http://127.0.0.1:3000";
let shotN = 0;
async function shot(page: any, label: string) {
  shotN++;
  const name = `test-${String(shotN).padStart(2, "0")}-${label}`;
  await page.screenshot({ path: `screenshots/${name}.png` });
  console.log(`📸 ${shotN}. ${label}`);
}

async function run() {
  const browser = await chromium.launch();

  // ── Pet A: 月兔 ──
  const ctxA = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const pageA = await ctxA.newPage();
  await pageA.goto(BASE, { waitUntil: "networkidle" });
  await pageA.evaluate(() => localStorage.clear());
  await pageA.reload({ waitUntil: "networkidle" });
  await pageA.waitForTimeout(500);

  // Create pet
  await pageA.locator("input").nth(0).fill("月兔");
  await pageA.locator("button").last().click();
  await pageA.waitForTimeout(2000);

  // Test 1: Pet room + stats
  await shot(pageA, "pet-room");

  // Test 2: Feed / Play / Rest
  const feedBtn = pageA.locator('button:has-text("🍖")');
  if (await feedBtn.isVisible()) { await feedBtn.click(); await pageA.waitForTimeout(1000); }
  const playBtn = pageA.locator('button:has-text("🎾")');
  if (await playBtn.isVisible()) { await playBtn.click(); await pageA.waitForTimeout(1000); }
  await shot(pageA, "after-feed-play");

  // Test 3: Soul API
  const petId = await pageA.evaluate(async () => {
    const resp = await fetch("/api/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: Object.keys(localStorage).length > 0 ? localStorage.getItem("pet-userId") : "test" }) });
    // Get pet from page state
    const pets = await (await fetch("/api/plaza/pets")).json();
    return null;
  });

  // Get actual petId from API
  const apiTest = await pageA.evaluate(async () => {
    const res: any = {};
    // Find our pet
    const shopResp = await fetch("/api/shop");
    const shop = await shopResp.json();
    res.shopItemCount = shop.length;
    return res;
  });
  console.log(`🛒 Shop: ${apiTest.shopItemCount} items`);

  // Test 4: Chat tab
  await pageA.locator('button:has-text("聊天")').click();
  await pageA.waitForTimeout(500);
  await shot(pageA, "chat-tab");

  // Test 5: Shop tab
  await pageA.locator('button:has-text("商城")').click();
  await pageA.waitForTimeout(500);
  await shot(pageA, "shop-tab");

  // Test 6: Plaza (portrait)
  await pageA.locator('button:has-text("广场")').click();
  await pageA.waitForTimeout(2000);
  await shot(pageA, "plaza-portrait");

  // Test 7: Create Pet B (黑猫) for social testing
  const ctxB = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const pageB = await ctxB.newPage();
  await pageB.goto(BASE, { waitUntil: "networkidle" });
  await pageB.evaluate(() => localStorage.clear());
  await pageB.reload({ waitUntil: "networkidle" });
  await pageB.waitForTimeout(500);
  await pageB.locator("input").nth(0).fill("黑猫");
  await pageB.locator("button").last().click();
  await pageB.waitForTimeout(2000);
  await pageB.locator('button:has-text("广场")').click();
  await pageB.waitForTimeout(2500);

  // Test 8: Two pets in plaza
  await shot(pageA, "plaza-2-pets");

  // Test 9: Click on 黑猫 → interaction panel
  const plazaPets = await pageA.evaluate(async () => (await fetch("/api/plaza/pets")).json());
  const otherPet = (plazaPets as any[]).find((p: any) => p.name === "黑猫");
  if (otherPet) {
    const canvas = pageA.locator("canvas");
    const box = await canvas.boundingBox();
    if (box) {
      const sx = box.width / 360, sy = box.height / 280;
      await pageA.mouse.click(box.x + otherPet.x * sx, box.y + otherPet.y * sy);
      await pageA.waitForTimeout(500);
      await shot(pageA, "interaction-panel");

      // Test 10: Wave
      const waveBtn = pageA.locator('button:has-text("招手")');
      if (await waveBtn.isVisible()) {
        await waveBtn.click();
        await pageA.waitForTimeout(1000);
      }

      // Test 11: Chat
      const chatBtn = pageA.locator('.plaza-interact-btns button:has-text("聊天")');
      if (await chatBtn.isVisible()) {
        await chatBtn.click();
        await pageA.waitForTimeout(2000);
        await shot(pageA, "plaza-chat-bubble");
      }

      // Test 12: Add friend
      const friendBtn = pageA.locator('button:has-text("交朋友")');
      if (await friendBtn.isVisible()) {
        await friendBtn.click();
        await pageA.waitForTimeout(1000);
        await shot(pageA, "add-friend");
      }
    }
  }

  // Test 13: Landscape mode
  await pageA.setViewportSize({ width: 800, height: 430 });
  await pageA.waitForTimeout(1500);
  await shot(pageA, "plaza-landscape");

  // Test 14: Wait for autonomous tick (42s)
  console.log("⏳ Waiting 50s for autonomous behavior...");
  await pageA.setViewportSize({ width: 430, height: 800 });
  await pageA.waitForTimeout(50000);

  // Test 15: Activity feed
  await pageA.locator('button:has-text("宠物")').click();
  await pageA.waitForTimeout(1500);
  await shot(pageA, "activity-feed");

  // Test 16: API tests (soul, insights, social-health)
  const apiResults = await pageA.evaluate(async () => {
    // Find pet IDs
    const allPets = await (await fetch("/api/plaza/pets")).json() as any[];
    const results: any = {};

    for (const p of allPets) {
      // Soul
      try {
        const soul = await (await fetch(`/api/pet/${p.petId}/soul`)).json();
        results[`${p.name}_soul`] = {
          traits: soul.traits,
          tendencies: soul.tendencies,
          version: soul.version,
        };
      } catch (e: any) { results[`${p.name}_soul_error`] = e.message; }

      // Insights
      try {
        const insights = await (await fetch(`/api/pet/${p.petId}/insights`)).json();
        results[`${p.name}_insights`] = insights;
      } catch (e: any) { results[`${p.name}_insights_error`] = e.message; }

      // Social health
      try {
        const health = await (await fetch(`/api/pet/${p.petId}/social-health`)).json();
        results[`${p.name}_health`] = {
          status: health.status,
          friendCount: health.friendCount,
          recentSocialCount: health.recentSocialCount,
        };
      } catch (e: any) { results[`${p.name}_health_error`] = e.message; }
    }

    // Worldview
    try {
      const wv = await (await fetch("/api/worldview")).json();
      results.worldview_version = wv.version;
      results.worldview_name = wv.world_name;
    } catch {}

    return results;
  });

  console.log("\n📊 API Test Results:");
  console.log(JSON.stringify(apiResults, null, 2));

  // Cleanup
  await pageA.close();
  await pageB.close();
  await ctxA.close();
  await ctxB.close();
  await browser.close();

  console.log(`\n✅ All tests complete! ${shotN} screenshots`);
}

run().catch(e => { console.error(e); process.exit(1); });
