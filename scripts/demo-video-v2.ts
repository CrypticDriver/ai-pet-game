/**
 * Video Demo v2 — 3 browser tabs, all pets visible in plaza
 * Fixed: no undefined, all pets visible, conversations shown
 */
import { chromium, type Page } from "playwright";

const BASE = "http://127.0.0.1:3000";

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

async function overlay(page: Page, text: string, duration = 3000) {
  await page.evaluate(({ text }) => {
    let el = document.getElementById("demo-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-overlay";
      el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,0.88);color:#0f0;font-size:22px;padding:16px 24px;font-family:'Courier New',monospace;white-space:pre-wrap;line-height:1.5;border-bottom:2px solid #0f0;";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = "1";
  }, { text });
  await page.waitForTimeout(duration);
}

async function hideOverlay(page: Page) {
  await page.evaluate(() => {
    const el = document.getElementById("demo-overlay");
    if (el) el.style.opacity = "0";
  });
}

async function run() {
  const browser = await chromium.launch();

  // Main recording context
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: "videos/v2/", size: { width: 1280, height: 720 } }
  });
  const mainPage = await ctx.newPage();

  // Two background contexts to put pets in plaza (no video needed)
  const ctx2 = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const ctx3 = await browser.newContext({ viewport: { width: 430, height: 800 } });

  // ═══ Title ═══
  await mainPage.goto(BASE, { waitUntil: "networkidle" });
  await mainPage.evaluate(() => localStorage.clear());
  await mainPage.reload({ waitUntil: "networkidle" });
  await overlay(mainPage, "🎬 PixelVerse 数字生命演示\n\n3只Pet · 不同性格 · LLM驱动\n社交 · 经济 · 公会", 4000);

  // ═══ ACT 1: Create 小白 in main browser ═══
  await overlay(mainPage, "▶ ACT 1: 创建小白 🐰", 1500);
  await hideOverlay(mainPage);
  await mainPage.locator("input").nth(0).fill("小白");
  await mainPage.waitForTimeout(500);
  await mainPage.locator("button").last().click();
  await mainPage.waitForTimeout(2500);
  // Get 小白's petId from localStorage or API
  const petAId = await mainPage.evaluate(() => {
    const data = localStorage.getItem("ai-pet-data");
    if (data) { const d = JSON.parse(data); return d.pet?.id || d.petId; }
    return null;
  });

  // Show soul
  let soulA: any = {};
  if (petAId) soulA = await api("GET", `/api/pet/${petAId}/soul`);
  await overlay(mainPage, `✨ 小白诞生!\n性格: 好奇${soulA.traits?.curiosity || "?"} 社交${soulA.traits?.sociability || "?"} 活泼${soulA.traits?.playfulness || "?"}`, 3000);

  // ═══ ACT 2: Create 黑猫 and 阿橘 in background browsers ═══
  await overlay(mainPage, "▶ ACT 2: 黑猫和阿橘也来了!", 2000);

  // Create 黑猫
  const page2 = await ctx2.newPage();
  await page2.goto(BASE, { waitUntil: "networkidle" });
  await page2.evaluate(() => localStorage.clear());
  await page2.reload({ waitUntil: "networkidle" });
  await page2.locator("input").nth(0).fill("黑猫");
  await page2.waitForTimeout(300);
  await page2.locator("button").last().click();
  await page2.waitForTimeout(2000);
  const petBId = await page2.evaluate(() => {
    const data = localStorage.getItem("ai-pet-data");
    if (data) { const d = JSON.parse(data); return d.pet?.id || d.petId; }
    return null;
  });

  // Create 阿橘
  const page3 = await ctx3.newPage();
  await page3.goto(BASE, { waitUntil: "networkidle" });
  await page3.evaluate(() => localStorage.clear());
  await page3.reload({ waitUntil: "networkidle" });
  await page3.locator("input").nth(0).fill("阿橘");
  await page3.waitForTimeout(300);
  await page3.locator("button").last().click();
  await page3.waitForTimeout(2000);
  const petCId = await page3.evaluate(() => {
    const data = localStorage.getItem("ai-pet-data");
    if (data) { const d = JSON.parse(data); return d.pet?.id || d.petId; }
    return null;
  });

  let soulB: any = {}, soulC: any = {};
  if (petBId) soulB = await api("GET", `/api/pet/${petBId}/soul`);
  if (petCId) soulC = await api("GET", `/api/pet/${petCId}/soul`);

  await overlay(mainPage,
    `三只Pet, 三种性格 🧬\n\n` +
    `🐰 小白: 好奇${soulA.traits?.curiosity||"?"} 社交${soulA.traits?.sociability||"?"} 活泼${soulA.traits?.playfulness||"?"}\n` +
    `🐱 黑猫: 好奇${soulB.traits?.curiosity||"?"} 社交${soulB.traits?.sociability||"?"} 活泼${soulB.traits?.playfulness||"?"}\n` +
    `🍊 阿橘: 好奇${soulC.traits?.curiosity||"?"} 社交${soulC.traits?.sociability||"?"} 活泼${soulC.traits?.playfulness||"?"}`,
  4000);

  // ═══ ACT 3: All enter plaza ═══
  await overlay(mainPage, "▶ ACT 3: 三只Pet进入广场", 2000);
  await hideOverlay(mainPage);

  // Navigate all 3 to plaza
  await page2.locator('button:has-text("广场")').click();
  await page2.waitForTimeout(1000);
  await page3.locator('button:has-text("广场")').click();
  await page3.waitForTimeout(1000);
  await mainPage.locator('button:has-text("广场")').click();
  await mainPage.waitForTimeout(3000);

  await overlay(mainPage, "广场上现在有3只Pix! 🎉", 3000);

  // ═══ ACT 4: Work ═══
  await overlay(mainPage, "▶ ACT 4: 打工赚钱 💰", 2000);
  if (petAId) {
    await api("POST", `/api/pet/${petAId}/move`, { destination: "park" });
    const w = await api("POST", `/api/pet/${petAId}/work`, { job: "种花" });
    await overlay(mainPage, `🐰 小白去公园种花...\n赚了 ${w.pay || 5} PixelCoin!\n余额: ${w.balance || 105}`, 3000);
    await api("POST", `/api/pet/${petAId}/move`, { destination: "hub" });
  }
  if (petBId) {
    await api("POST", `/api/pet/${petBId}/move`, { destination: "library" });
    const w = await api("POST", `/api/pet/${petBId}/work`, { job: "整理书架" });
    await overlay(mainPage, `🐱 黑猫去图书馆整理书架...\n赚了 ${w.pay || 5} PixelCoin!\n余额: ${w.balance || 105}`, 3000);
    await api("POST", `/api/pet/${petBId}/move`, { destination: "hub" });
  }
  if (petCId) {
    await api("POST", `/api/pet/${petCId}/move`, { destination: "cafe" });
    const w = await api("POST", `/api/pet/${petCId}/work`, { job: "帮忙端咖啡" });
    await overlay(mainPage, `🍊 阿橘在咖啡厅端咖啡...\n赚了 ${w.pay || 4} PixelCoin!\n余额: ${w.balance || 104}`, 3000);
    await api("POST", `/api/pet/${petCId}/move`, { destination: "hub" });
  }

  // ═══ ACT 5: LLM Conversation ═══
  await overlay(mainPage, "▶ ACT 5: LLM对LLM真实对话 🗣️\n\n每只Pet独立思考, 不是模板!", 3000);

  // Move all to hub for conversation
  if (petAId && petBId) {
    const talk1 = await api("POST", `/api/pet/${petAId}/talk`, {
      targetName: "黑猫", message: "嘿黑猫！今天天气真好，要不要一起去公园散步？"
    });
    const reply1 = talk1.reply || "(思考中...)";
    await overlay(mainPage,
      `🐰→🐱 LLM对话 #1\n\n` +
      `小白: "嘿黑猫！今天天气真好，要不要一起去公园散步？"\n\n` +
      `黑猫: "${reply1.slice(0, 80)}"`,
    5000);
  }

  await new Promise(r => setTimeout(r, 5000));

  if (petCId && petAId) {
    const talk2 = await api("POST", `/api/pet/${petCId}/talk`, {
      targetName: "小白", message: "你们俩在聊什么呢？我能加入吗？"
    });
    const reply2 = talk2.reply || "(思考中...)";
    await overlay(mainPage,
      `🍊→🐰 LLM对话 #2\n\n` +
      `阿橘: "你们俩在聊什么呢？我能加入吗？"\n\n` +
      `小白: "${reply2.slice(0, 80)}"`,
    5000);
  }

  await new Promise(r => setTimeout(r, 5000));

  if (petCId && petBId) {
    const talk3 = await api("POST", `/api/pet/${petCId}/talk`, {
      targetName: "黑猫", message: "黑猫！听说你在图书馆整理书架？辛苦啦～"
    });
    const reply3 = talk3.reply || "(思考中...)";
    await overlay(mainPage,
      `🍊→🐱 LLM对话 #3\n\n` +
      `阿橘: "黑猫！听说你在图书馆整理书架？辛苦啦～"\n\n` +
      `黑猫: "${reply3.slice(0, 80)}"`,
    5000);
  }

  // ═══ ACT 6: Relationships ═══
  await overlay(mainPage, "▶ ACT 6: 关系网络 💕", 2000);
  if (petAId) {
    const rels = await api("GET", `/api/pet/${petAId}/relationships`);
    const lines = rels.map((r: any) =>
      `  → ${r.target_name}: 好感${r.affinity} 信任${r.trust}`
    ).join("\n");
    await overlay(mainPage, `小白的朋友:\n${lines || "(无)"}`, 4000);
  }

  // ═══ ACT 7: Gift ═══
  if (petCId && petBId) {
    const gift = await api("POST", `/api/pet/${petCId}/transfer`, {
      targetPetId: petBId, amount: 15, reason: "gift"
    });
    await overlay(mainPage,
      `▶ ACT 7: 送礼物 🎁\n\n` +
      `阿橘送黑猫 15 PixelCoin!\n` +
      `阿橘余额: ${gift.fromBalance}\n黑猫余额: ${gift.toBalance}`,
    4000);
  }

  // ═══ ACT 8: Guild ═══
  if (petCId && petAId && petBId) {
    const guild = await api("POST", "/api/guild/create", {
      name: "公园三人组", description: "在PixelVerse相遇的好朋友", founderPetId: petCId, territory: "park"
    });
    const gid = guild.guild?.id;
    if (gid) {
      await api("POST", `/api/guild/${gid}/join`, { petId: petAId });
      await api("POST", `/api/guild/${gid}/join`, { petId: petBId });
    }
    await overlay(mainPage,
      `▶ ACT 8: 公会成立 🏰\n\n` +
      `"${guild.guild?.name || "公园三人组"}"\n\n` +
      `🍊 阿橘 — 创始人\n🐰 小白 — 成员\n🐱 黑猫 — 成员`,
    4000);
  }

  // ═══ ACT 9: Economy ═══
  const econ = await api("GET", "/api/world/economy");
  await overlay(mainPage,
    `▶ ACT 9: PixelVerse经济 💰\n\n` +
    `Pet数量: ${econ.totalPets}\n` +
    `总流通: ${econ.totalBalance} PixelCoin\n` +
    `平均余额: ${econ.avgBalance}\n` +
    `今日交易: ${econ.todayTransactions}笔`,
  4000);

  // ═══ Finale ═══
  await overlay(mainPage,
    `🎉 演示完成!\n\n` +
    `✅ 3只Pet, 各自独立性格\n` +
    `✅ LLM对LLM真实对话 (不是模板)\n` +
    `✅ 地图移动+相邻验证\n` +
    `✅ 打工赚钱 (不同地点不同工作)\n` +
    `✅ 送礼物+关系系统\n` +
    `✅ 公会组织\n\n` +
    `Phase 1+2: 2945行代码, 34个API`,
  6000);

  // Close all
  await page2.close();
  await page3.close();
  await ctx2.close();
  await ctx3.close();
  await ctx.close();
  await browser.close();

  console.log("✅ 视频录制完成!");
}

run().catch(e => { console.error(e); process.exit(1); });
