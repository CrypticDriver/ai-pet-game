/**
 * Video Demo — records browser + API interactions as video
 * Uses Playwright's built-in video recording
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3000";

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: "videos/", size: { width: 1280, height: 720 } }
  });
  const page = await ctx.newPage();

  // Helper: show status overlay
  async function overlay(text: string, duration = 3000) {
    await page.evaluate(({ text, duration }) => {
      let el = document.getElementById("demo-overlay");
      if (!el) {
        el = document.createElement("div");
        el.id = "demo-overlay";
        el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,0.85);color:#fff;font-size:24px;padding:20px 30px;font-family:monospace;white-space:pre-wrap;transition:opacity 0.3s;";
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.style.opacity = "1";
      if (duration > 0) setTimeout(() => { el!.style.opacity = "0"; }, duration - 300);
    }, { text, duration });
    await page.waitForTimeout(duration);
  }

  // ═══ Title ═══
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await overlay("🎬 PixelVerse 文明系统演示\n3只Pet · 不同性格 · 社交经济公会", 4000);

  // ═══ ACT 1: Create Pet 1 (小白) ═══
  await overlay("ACT 1: 创建Pet — 小白 🐰", 2000);
  await page.locator("input").nth(0).fill("小白");
  await page.waitForTimeout(500);
  await page.locator("button").last().click();
  await page.waitForTimeout(2500);
  await overlay("小白诞生了！✨", 2000);
  await page.screenshot({ path: "screenshots/video-01-pet-born.png" });

  // Get pet info
  const petA = (await api("POST", "/api/init", { userId: "demoB", username: "B", petName: "黑猫" })).pet;
  const petC = (await api("POST", "/api/init", { userId: "demoC", username: "C", petName: "阿橘" })).pet;

  // Get existing pet (小白)
  const pets = (await (await fetch(`${BASE}/api/world/map`)).json());
  // We'll use the first init's pet
  const petAId = (await api("GET", `/api/pet/${petA.id}/wallet`)).pet_id;

  // ═══ ACT 2: Show Souls ═══
  const soulA_resp = await fetch(`${BASE}/api/world/map`);
  // Get all pets from DB
  const soulB = await api("GET", `/api/pet/${petA.id}/soul`);
  const soulC = await api("GET", `/api/pet/${petC.id}/soul`);
  await overlay(`ACT 2: 三只Pet性格各不相同 🧬\n\n🐱 黑猫: 好奇${soulB.traits?.curiosity} 社交${soulB.traits?.sociability} 活泼${soulB.traits?.playfulness}\n🍊 阿橘: 好奇${soulC.traits?.curiosity} 社交${soulC.traits?.sociability} 活泼${soulC.traits?.playfulness}`, 4000);

  // ═══ ACT 3: Navigate to Plaza ═══
  await overlay("ACT 3: 进入广场 🗺️", 2000);
  await page.locator('button:has-text("广场")').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "screenshots/video-02-plaza.png" });

  // ═══ ACT 4: Movement ═══
  await overlay("ACT 4: Pet移动到不同地点 🚶", 2000);
  await api("POST", `/api/pet/${petA.id}/move`, { destination: "park" });
  await api("POST", `/api/pet/${petC.id}/move`, { destination: "cafe" });
  const blocked = await api("POST", `/api/pet/${petA.id}/move`, { destination: "lake" });
  await overlay(`黑猫 → 公园 ✅\n阿橘 → 咖啡厅 ✅\n黑猫 → 月光湖 ❌ (${blocked.ok ? "" : blocked.reason})`, 4000);

  // ═══ ACT 5: Work ═══
  await overlay("ACT 5: 打工赚钱 💰", 2000);
  const workR = await api("POST", `/api/pet/${petA.id}/work`, { job: "种花" });
  await overlay(`黑猫在公园种花... +${workR.pay}币!\n余额: ${workR.balance} PixelCoin`, 3000);

  // ═══ ACT 6: Social — LLM conversation ═══
  await overlay("ACT 6: LLM对LLM真实对话 🗣️\n\n等待AI思考中...", 2000);
  // Move all to park
  await api("POST", `/api/pet/${petC.id}/move`, { destination: "hub" });
  await api("POST", `/api/pet/${petC.id}/move`, { destination: "park" });

  const talk1 = await api("POST", `/api/pet/${petA.id}/talk`, {
    targetName: "阿橘", message: "嘿！你也来公园了？这里好安静~"
  });
  await overlay(`🐱 黑猫: "嘿！你也来公园了？这里好安静~"\n\n🍊 阿橘: "${(talk1.reply || "...").slice(0, 100)}"`, 5000);
  await page.screenshot({ path: "screenshots/video-03-conversation.png" });

  await new Promise(r => setTimeout(r, 5000));

  const talk2 = await api("POST", `/api/pet/${petC.id}/talk`, {
    targetName: "黑猫", message: "对呀！我刚在咖啡厅端咖啡赚了点钱~"
  });
  await overlay(`🍊 阿橘: "对呀！我刚在咖啡厅端咖啡赚了点钱~"\n\n🐱 黑猫: "${(talk2.reply || "...").slice(0, 100)}"`, 5000);

  // ═══ ACT 7: Relationships ═══
  const rels = await api("GET", `/api/pet/${petA.id}/relationships`);
  const relText = rels.map((r: any) => `→ ${r.target_name}: 好感${r.affinity} 信任${r.trust}`).join("\n");
  await overlay(`ACT 7: 关系网络 💕\n\n黑猫的朋友：\n${relText}`, 4000);

  // ═══ ACT 8: Gift ═══
  const gift = await api("POST", `/api/pet/${petC.id}/transfer`, {
    targetPetId: petA.id, amount: 10, reason: "gift"
  });
  await overlay(`ACT 8: 阿橘送黑猫10 PixelCoin 🎁\n\n阿橘: ${gift.fromBalance}币\n黑猫: ${gift.toBalance}币`, 4000);

  // ═══ ACT 9: Guild ═══
  const guild = await api("POST", "/api/guild/create", {
    name: "公园探险队", description: "爱探索的Pix们", founderPetId: petC.id, territory: "park"
  });
  await api("POST", `/api/guild/${guild.guild?.id}/join`, { petId: petA.id });
  await overlay(`ACT 9: 公会成立 🏰\n\n"${guild.guild?.name}"\n🍊 阿橘 — 创始人\n🐱 黑猫 — 成员`, 4000);

  // ═══ ACT 10: Economy ═══
  const econ = await api("GET", "/api/world/economy");
  await overlay(`ACT 10: PixelVerse 经济 💰\n\n总流通: ${econ.totalBalance} PixelCoin\n平均余额: ${econ.avgBalance}\n今日交易: ${econ.todayTransactions}笔`, 4000);

  // ═══ Finale ═══
  await overlay("🎉 演示完成!\n\nPhase 1+2: 12个模块, 2945行代码\n6个地点 · LLM驱动 · 经济系统 · 公会", 5000);
  await page.screenshot({ path: "screenshots/video-04-finale.png" });

  await ctx.close();
  await browser.close();

  // Get video path
  console.log("✅ 视频录制完成！");
  console.log("📁 检查 videos/ 目录");
}

run().catch(e => { console.error(e); process.exit(1); });
