import { chromium } from "playwright";
async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();

  // Login with existing user
  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("pet-userId", "u1");
    localStorage.setItem("pet-petName", "小白");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Go to Civ dashboard → Social tab
  await page.locator('button:has-text("文明")').click();
  await page.waitForTimeout(1000);
  await page.locator('span:has-text("关系")').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/phase4-social.png" });
  console.log("📸 social network");

  // Economy tab
  await page.locator('span:has-text("经济")').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/phase4-economy.png" });
  console.log("📸 economy");

  await browser.close();
}
run().catch(e => { console.error(e); process.exit(1); });
