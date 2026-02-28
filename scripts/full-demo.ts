import { chromium } from "playwright";
process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;

async function screenshot(page: any, name: string) {
  await page.screenshot({ path: `screenshots/demo-${name}.png` });
  console.log(`📸 ${name}`);
}

async function run() {
  const browser = await chromium.launch();
  
  // ===== USER A =====
  const ctxA = await browser.newContext({
    viewport: { width: 430, height: 800 },
    recordVideo: { dir: "screenshots/", size: { width: 430, height: 800 } },
  });
  const pageA = await ctxA.newPage();
  await pageA.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await pageA.evaluate(() => localStorage.clear());
  await pageA.reload({ waitUntil: "networkidle" });
  await pageA.waitForTimeout(800);

  // Step 1: Welcome screen
  await screenshot(pageA, "01-welcome");

  // Step 2: Create pet
  const inputs = pageA.locator("input");
  const count = await inputs.count();
  if (count >= 2) {
    await inputs.nth(0).fill("Luna");
    await inputs.nth(1).fill("月兔");
  } else {
    await inputs.nth(0).fill("月兔");
  }
  await screenshot(pageA, "02-name-input");
  await pageA.locator("button").last().click();
  await pageA.waitForTimeout(2500);

  // Step 3: Pet home (room)
  await screenshot(pageA, "03-pet-room");

  // Step 4: Feed pet
  const feedBtn = pageA.locator('button:has-text("🍖")');
  if (await feedBtn.isVisible()) {
    await feedBtn.click();
    await pageA.waitForTimeout(1500);
  }
  await screenshot(pageA, "04-fed-pet");

  // Step 5: Play with pet
  const playBtn = pageA.locator('button:has-text("🎾")');
  if (await playBtn.isVisible()) {
    await playBtn.click();
    await pageA.waitForTimeout(1500);
  }
  await screenshot(pageA, "05-play-pet");

  // Step 6: Chat tab
  await pageA.locator('button:has-text("聊天")').click();
  await pageA.waitForTimeout(500);
  await screenshot(pageA, "06-chat-tab");

  // Step 7: Send a chat message
  const chatInput = pageA.locator("input[type='text'], textarea").last();
  if (await chatInput.isVisible()) {
    await chatInput.fill("你好呀！今天过得怎么样？");
    await pageA.waitForTimeout(300);
    await screenshot(pageA, "07-chat-input");
    // press enter or click send
    await chatInput.press("Enter");
    await pageA.waitForTimeout(5000); // Wait for AI response
    await screenshot(pageA, "08-chat-reply");
  }

  // Step 8: Shop tab
  await pageA.locator('button:has-text("商城")').click();
  await pageA.waitForTimeout(1000);
  await screenshot(pageA, "09-shop");

  // Step 9: Go back to pet tab
  await pageA.locator('button:has-text("宠物")').click();
  await pageA.waitForTimeout(500);

  // Step 10: Plaza tab
  await pageA.locator('button:has-text("广场")').click();
  await pageA.waitForTimeout(2000);
  await screenshot(pageA, "10-plaza-solo");

  // ===== USER B =====
  const ctxB = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const pageB = await ctxB.newPage();
  await pageB.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await pageB.evaluate(() => localStorage.clear());
  await pageB.reload({ waitUntil: "networkidle" });
  await pageB.waitForTimeout(800);

  const inputsB = pageB.locator("input");
  const countB = await inputsB.count();
  if (countB >= 2) {
    await inputsB.nth(0).fill("Kuro");
    await inputsB.nth(1).fill("黑猫");
  } else {
    await inputsB.nth(0).fill("黑猫");
  }
  await pageB.locator("button").last().click();
  await pageB.waitForTimeout(2000);

  // Pet B enters plaza
  await pageB.locator('button:has-text("广场")').click();
  await pageB.waitForTimeout(2500);

  // Now take screenshot from A showing both pets
  await screenshot(pageA, "11-plaza-two-pets");

  // Step 11: Interact with other pet
  const petsData = await pageA.evaluate(async () => {
    const res = await fetch('/api/plaza/pets');
    return await res.json();
  });
  console.log("Pets in plaza:", petsData.map((p: any) => p.name));

  const otherPet = petsData.find((p: any) => p.name === '黑猫');
  if (otherPet) {
    const canvas = pageA.locator('canvas');
    const box = await canvas.boundingBox();
    if (box) {
      const scaleX = box.width / 360;
      const scaleY = box.height / 280;
      await pageA.mouse.click(box.x + otherPet.x * scaleX, box.y + otherPet.y * scaleY);
      await pageA.waitForTimeout(500);
      await screenshot(pageA, "12-interaction-panel");

      // Wave
      const waveBtn = pageA.locator('button:has-text("招手")');
      if (await waveBtn.isVisible()) {
        await waveBtn.click();
        await pageA.waitForTimeout(1000);
        await screenshot(pageA, "13-wave");
      }

      // Chat
      const chatBtn = pageA.locator('.plaza-interact-btns button:has-text("聊天")');
      if (await chatBtn.isVisible()) {
        await chatBtn.click();
        await pageA.waitForTimeout(1500);
        // Rapid screenshots to catch bubble
        for (let i = 0; i < 6; i++) {
          await pageA.waitForTimeout(400);
          await pageA.screenshot({ path: `screenshots/demo-14-chat-bubble-${i}.png` });
        }
        console.log("📸 14-chat-bubble series");
      }

      // Add friend
      const friendBtn = pageA.locator('button:has-text("交朋友")');
      if (await friendBtn.isVisible()) {
        await friendBtn.click();
        await pageA.waitForTimeout(1000);
        await screenshot(pageA, "15-add-friend");
      }
    }
  }

  // Step 12: Wait for autonomous behavior (42s)
  console.log("⏳ Waiting 45s for autonomous behavior...");
  await pageA.waitForTimeout(45000);

  // Go to pet tab to check activity feed
  await pageA.locator('button:has-text("宠物")').click();
  await pageA.waitForTimeout(1500);
  await screenshot(pageA, "16-activity-feed");

  // Final overview
  await pageA.locator('button:has-text("广场")').click();
  await pageA.waitForTimeout(2000);
  await screenshot(pageA, "17-final-plaza");

  // Close
  await pageA.close();
  await pageB.close();
  await ctxA.close();
  await ctxB.close();
  await browser.close();
  console.log("\n✅ Full demo complete! Screenshots in screenshots/demo-*.png");
}

run().catch(e => { console.error(e); process.exit(1); });
