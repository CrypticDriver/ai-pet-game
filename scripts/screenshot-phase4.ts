import { chromium } from "playwright";
async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("input").nth(0).fill("星星");
  await page.locator("button").last().click();
  await page.waitForTimeout(2000);

  await page.locator('button:has-text("地图")').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/phase4-map.png" });
  console.log("📸 map");

  await page.locator('button:has-text("文明")').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/phase4-civ.png" });
  console.log("📸 civ");

  await browser.close();
}
run().catch(e => { console.error(e); process.exit(1); });
