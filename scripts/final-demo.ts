import { chromium } from "playwright";
process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;

let shotNum = 0;
async function shot(page: any, label: string) {
  shotNum++;
  const name = `final-${String(shotNum).padStart(2, "0")}-${label}`;
  await page.screenshot({ path: `screenshots/${name}.png` });
  console.log(`📸 ${shotNum}. ${label}`);
}

async function run() {
  const browser = await chromium.launch();

  // ── Pet A: 月兔 ──
  const ctxA = await browser.newContext({
    viewport: { width: 430, height: 800 },
    recordVideo: { dir: "screenshots/", size: { width: 430, height: 800 } },
  });
  const pageA = await ctxA.newPage();
  await pageA.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await pageA.evaluate(() => localStorage.clear());
  await pageA.reload({ waitUntil: "networkidle" });
  await pageA.waitForTimeout(500);

  // 1. Welcome
  await shot(pageA, "welcome");

  // 2. Create pet
  const inputs = pageA.locator("input");
  if ((await inputs.count()) >= 2) {
    await inputs.nth(0).fill("Luna");
    await inputs.nth(1).fill("月兔");
  } else {
    await inputs.nth(0).fill("月兔");
  }
  await shot(pageA, "name-input");
  await pageA.locator("button").last().click();
  await pageA.waitForTimeout(2000);

  // 3. Pet room
  await shot(pageA, "pet-room");

  // 4. Feed
  const feedBtn = pageA.locator('button:has-text("🍖")');
  if (await feedBtn.isVisible()) { await feedBtn.click(); await pageA.waitForTimeout(1200); }
  await shot(pageA, "fed");

  // 5. Play
  const playBtn = pageA.locator('button:has-text("🎾")');
  if (await playBtn.isVisible()) { await playBtn.click(); await pageA.waitForTimeout(1200); }
  await shot(pageA, "played");

  // 6. Rest
  const restBtn = pageA.locator('button:has-text("💤")');
  if (await restBtn.isVisible()) { await restBtn.click(); await pageA.waitForTimeout(1200); }
  await shot(pageA, "rested");

  // 7. Chat tab
  await pageA.locator('button:has-text("聊天")').click();
  await pageA.waitForTimeout(500);
  await shot(pageA, "chat-tab");

  // 8. Send message & get AI reply
  const chatInput = pageA.locator("input[type='text'], textarea").last();
  if (await chatInput.isVisible()) {
    await chatInput.fill("你好呀月兔！今天开心吗？");
    await chatInput.press("Enter");
    await pageA.waitForTimeout(6000);
    await shot(pageA, "chat-reply");
  }

  // 9. Shop
  await pageA.locator('button:has-text("商城")').click();
  await pageA.waitForTimeout(800);
  await shot(pageA, "shop");

  // 10. Plaza solo
  await pageA.locator('button:has-text("广场")').click();
  await pageA.waitForTimeout(2000);
  await shot(pageA, "plaza-solo");

  // ── Pet B: 黑猫 ──
  const ctxB = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const pageB = await ctxB.newPage();
  await pageB.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await pageB.evaluate(() => localStorage.clear());
  await pageB.reload({ waitUntil: "networkidle" });
  await pageB.waitForTimeout(500);
  const inputsB = pageB.locator("input");
  if ((await inputsB.count()) >= 2) {
    await inputsB.nth(0).fill("Kuro");
    await inputsB.nth(1).fill("黑猫");
  } else {
    await inputsB.nth(0).fill("黑猫");
  }
  await pageB.locator("button").last().click();
  await pageB.waitForTimeout(2000);
  await pageB.locator('button:has-text("广场")').click();
  await pageB.waitForTimeout(2500);

  // 11. Two pets in plaza
  await shot(pageA, "plaza-two-pets");

  // 12. Click on 黑猫 → interaction panel
  const petsData = await pageA.evaluate(async () => {
    const r = await fetch("/api/plaza/pets");
    return r.json();
  });
  const other = petsData.find((p: any) => p.name === "黑猫");
  if (other) {
    const canvas = pageA.locator("canvas");
    const box = await canvas.boundingBox();
    if (box) {
      const sx = box.width / 360, sy = box.height / 280;
      await pageA.mouse.click(box.x + other.x * sx, box.y + other.y * sy);
      await pageA.waitForTimeout(500);
      await shot(pageA, "interaction-panel");

      // 13. Wave
      const waveBtn = pageA.locator('button:has-text("招手")');
      if (await waveBtn.isVisible()) {
        await waveBtn.click();
        await pageA.waitForTimeout(1200);
        await shot(pageA, "wave-emote");
      }

      // 14. Chat → capture bubble
      const chatBtn2 = pageA.locator('.plaza-interact-btns button:has-text("聊天")');
      if (await chatBtn2.isVisible()) {
        await chatBtn2.click();
        // Rapid screenshots for bubble
        for (let i = 0; i < 4; i++) {
          await pageA.waitForTimeout(600);
          await pageA.screenshot({ path: `screenshots/final-${String(shotNum + 1).padStart(2, "0")}-chat-bubble-${i}.png` });
        }
        shotNum++;
        console.log(`📸 ${shotNum}. chat-bubble (4 frames)`);
      }

      // 15. Add friend
      const friendBtn = pageA.locator('button:has-text("交朋友")');
      if (await friendBtn.isVisible()) {
        await friendBtn.click();
        await pageA.waitForTimeout(1000);
        await shot(pageA, "add-friend");
      }
    }
  }

  // 16. Wait for autonomous behavior (42s + buffer)
  console.log("⏳ Waiting 50s for autonomous behavior tick...");
  await pageA.waitForTimeout(50000);

  // 17. Check Pet日记
  await pageA.locator('button:has-text("宠物")').click();
  await pageA.waitForTimeout(1500);
  await shot(pageA, "activity-feed");

  // 18. Final plaza view
  await pageA.locator('button:has-text("广场")').click();
  await pageA.waitForTimeout(2000);
  await shot(pageA, "final-plaza");

  // Close
  await pageA.close();
  await pageB.close();
  await ctxA.close();
  await ctxB.close();
  await browser.close();
  console.log(`\n✅ Final demo complete! ${shotNum} screenshots + video`);
}

run().catch(e => { console.error(e); process.exit(1); });
