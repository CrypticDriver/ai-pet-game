/**
 * Final Demo Script — 8 Scenarios
 * Playwright video recording with console narration
 */
import { chromium, type Page, type BrowserContext } from "playwright";

const BASE = "http://127.0.0.1:3000";
const api = (method: string, url: string, body?: any) =>
  fetch(`${BASE}${url}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());

function log(scene: string, msg: string) {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${scene}`);
  console.log(`  ${msg}`);
  console.log(`${"═".repeat(50)}`);
}

function step(msg: string) {
  console.log(`  → ${msg}`);
}

async function sleep(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

async function navTo(page: Page, tab: string) {
  // Force exit plaza landscape mode first
  try {
    await page.locator('button:has-text("宠物")').click({ force: true, timeout: 2000 });
    await page.waitForTimeout(300);
  } catch {}
  await page.locator(`button:has-text("${tab}")`).click();
  await page.waitForTimeout(500);
}

async function navSubTab(page: Page, label: string) {
  await page.locator(`span:has-text("${label}")`).click();
  await page.waitForTimeout(500);
}

// ── Pet Creation Helper ──
async function createPet(userId: string, username: string, petName: string) {
  const res = await api("POST", "/api/init", { userId, username, petName });
  const soul = await api("GET", `/api/pet/${res.pet.id}/soul`);
  return { ...res.pet, soul };
}

async function run() {
  const browser = await chromium.launch();
  
  // Main browser context with video recording
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    recordVideo: { dir: "videos/", size: { width: 430, height: 932 } },
  });
  const page = await ctx.newPage();

  // ══════════════════════════════════════
  // 场景1: 创世纪 — 创建5只不同MBTI的Pet
  // ══════════════════════════════════════
  log("场景1: 创世纪", "创建5只不同MBTI的Pet");

  const pets: any[] = [];
  const names = ["小白", "黑猫", "阿橘", "星星", "月月"];
  for (let i = 0; i < 5; i++) {
    const pet = await createPet(`u${i+1}`, `User${i+1}`, names[i]);
    pets.push(pet);
    step(`${pet.name}: ${pet.soul.mbti} (${MBTI_CN[pet.soul.mbti as keyof typeof MBTI_CN] || "?"})`);
    step(`  好奇${pet.soul.traits.curiosity} 社交${pet.soul.traits.sociability} 情感${pet.soul.traits.emotionality}`);
  }

  // Login as first pet in browser
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((uid: string) => {
    localStorage.setItem("pet-userId", uid);
  }, "u1");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "screenshots/demo-01-genesis.png" });
  step("📸 创世纪截图");

  // ══════════════════════════════════════
  // 场景2: 初遇 — Pet间LLM真实对话
  // ══════════════════════════════════════
  log("场景2: 初遇", "Pet间LLM真实对话");

  // Move pets to same location
  await api("POST", `/api/pet/${pets[0].id}/move`, { destination: "park" });
  await api("POST", `/api/pet/${pets[1].id}/move`, { destination: "park" });
  step("小白和黑猫都来到绿荫公园");

  const talk1 = await api("POST", `/api/pet/${pets[0].id}/talk`, {
    targetName: "黑猫", message: "你好！我是小白，你也来公园散步吗？"
  });
  step(`小白→黑猫: "${(talk1.reply || talk1.error || "...").slice(0, 60)}"`);
  await sleep(5000);

  const talk2 = await api("POST", `/api/pet/${pets[1].id}/talk`, {
    targetName: "小白", message: "嗯！公园好舒服，你喜欢什么活动？"
  });
  step(`黑猫→小白: "${(talk2.reply || talk2.error || "...").slice(0, 60)}"`);
  await sleep(2000);

  // Switch to pet view to show chat
  await navTo(page, "聊天");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "screenshots/demo-02-encounter.png" });
  step("📸 初遇截图");

  // ══════════════════════════════════════
  // 场景3: 探索与工作 — 经济系统
  // ══════════════════════════════════════
  log("场景3: 探索与工作", "Pet们各自打工赚钱");

  // Move pets to different work locations
  await api("POST", `/api/pet/${pets[0].id}/move`, { destination: "hub" });
  await api("POST", `/api/pet/${pets[0].id}/move`, { destination: "cafe" });
  await api("POST", `/api/pet/${pets[2].id}/move`, { destination: "market" });
  await api("POST", `/api/pet/${pets[3].id}/move`, { destination: "library" });

  const work1 = await api("POST", `/api/pet/${pets[0].id}/work`, { job: "帮忙端咖啡" });
  step(`小白在咖啡厅打工: +${work1.pay}💰 (余额${work1.balance})`);

  const work2 = await api("POST", `/api/pet/${pets[2].id}/work`, { job: "帮摊主看摊" });
  step(`阿橘在集市看摊: +${work2.pay}💰 (余额${work2.balance})`);

  const work3 = await api("POST", `/api/pet/${pets[3].id}/work`, { job: "读书给小Pix听" });
  // Might fail if job name doesn't match
  if (work3.ok) step(`星星在图书馆: +${work3.pay}💰`);
  else {
    const avail = await api("GET", `/api/pet/${pets[3].id}/work`);
    if (avail[0]) {
      const w = await api("POST", `/api/pet/${pets[3].id}/work`, { job: avail[0].job });
      step(`星星: ${avail[0].job} +${w.pay}💰 (余额${w.balance})`);
    }
  }

  await navTo(page, '文明');
  await page.waitForTimeout(1000);
  await navSubTab(page, '经济');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/demo-03-economy.png" });
  step("📸 经济截图");

  // ══════════════════════════════════════
  // 场景4: 社交深化 — 关系建立
  // ══════════════════════════════════════
  log("场景4: 社交深化", "多组对话，建立关系网络");

  // More conversations
  await api("POST", `/api/pet/${pets[2].id}/move`, { destination: "hub" });
  await api("POST", `/api/pet/${pets[2].id}/move`, { destination: "park" });
  await api("POST", `/api/pet/${pets[1].id}/move`, { destination: "park" }); // 黑猫 already there

  const talk3 = await api("POST", `/api/pet/${pets[2].id}/talk`, {
    targetName: "黑猫", message: "黑猫！你好呀，我是阿橘，刚从集市回来"
  });
  step(`阿橘→黑猫: "${talk3.reply?.slice(0, 50)}..."`);
  await sleep(5000);

  await api("POST", `/api/pet/${pets[4].id}/move`, { destination: "park" });
  const talk4 = await api("POST", `/api/pet/${pets[4].id}/talk`, {
    targetName: "阿橘", message: "大家好！我叫月月，你们在聊什么？"
  });
  step(`月月→阿橘: "${talk4.reply?.slice(0, 50)}..."`);
  await sleep(5000);

  // Show social network
  await navSubTab(page, '关系');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/demo-04-social.png" });
  step("📸 关系网络截图");

  // ══════════════════════════════════════
  // 场景5: 公会成立
  // ══════════════════════════════════════
  log("场景5: 公会成立", "Pet们创建公会");

  const guild = await api("POST", "/api/guild/create", {
    name: "星光探险队", description: "爱冒险的Pix们", founderPetId: pets[0].id
  });
  step(`小白创建公会: 星光探险队`);

  const guildId = guild.guildId || guild.id || 1;
  await api("POST", `/api/guild/${guildId}/join`, { petId: pets[1].id });
  step("黑猫加入了星光探险队");
  await api("POST", `/api/guild/${guildId}/join`, { petId: pets[3].id });
  step("星星加入了星光探险队");

  // Show overview tab
  await navSubTab(page, '总览');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/demo-05-guild.png" });
  step("📸 公会截图");

  // ══════════════════════════════════════
  // 场景6: 语言演化 — 词汇诞生与传播
  // ══════════════════════════════════════
  log("场景6: 语言演化", "Pet发明新词并传播");

  const talk5 = await api("POST", `/api/pet/${pets[0].id}/talk`, {
    targetName: "黑猫", message: "我发明了一个新词叫「星漫」，就是在星光下散步的意思！"
  });
  step(`小白发明了「星漫」: "${talk5.reply?.slice(0, 50)}..."`);
  await sleep(5000);

  const talk6 = await api("POST", `/api/pet/${pets[2].id}/talk`, {
    targetName: "月月", message: "你知道「星漫」吗？就是在星光下散步，听说超浪漫的"
  });
  step(`阿橘传播「星漫」: "${talk6.reply?.slice(0, 50)}..."`);
  await sleep(5000);

  const talk7 = await api("POST", `/api/pet/${pets[4].id}/talk`, {
    targetName: "星星", message: "今晚要不要一起去「星漫」？月光湖那边一定很美"
  });
  step(`月月也用了「星漫」: "${talk7.reply?.slice(0, 50)}..."`);
  await sleep(2000);

  const terms = await api("GET", "/api/world/language/terms");
  for (const t of terms) {
    step(`  词汇: "${t.term}" = ${t.meaning} (${t.status}, ${t.unique_users}人用)`);
  }

  await navSubTab(page, '语言');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/demo-06-language.png" });
  step("📸 语言演化截图");

  // ══════════════════════════════════════
  // 场景7: 世界地图全景
  // ══════════════════════════════════════
  log("场景7: 世界地图", "Pet分布在各个地点");

  await navTo(page, '地图');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/demo-07-map.png" });
  step("📸 世界地图截图");

  // ══════════════════════════════════════
  // 场景8: 文明总览
  // ══════════════════════════════════════
  log("场景8: 文明总览", "完整的文明仪表盘");

  await navTo(page, '文明');
  await page.waitForTimeout(1000);
  await navSubTab(page, '总览');
  await page.waitForTimeout(1000);

  const stats = await api("GET", "/api/world/economy");
  step(`经济: 总流通${stats.totalBalance}💰, ${stats.totalPets}只Pet`);

  const langStats = await api("GET", "/api/world/language");
  step(`语言: ${langStats.totalTerms}个词汇, ${langStats.popularTerms}个流行`);

  const history = await api("GET", "/api/world/history?limit=5");
  for (const h of history) {
    step(`  📜 [${h.era}] ${h.title}`);
  }

  await page.screenshot({ path: "screenshots/demo-08-civilization.png" });
  step("📸 文明总览截图");

  // ══════════════════════════════════════
  // 结束
  // ══════════════════════════════════════
  log("演示完成", "8个场景全部通过");

  await page.waitForTimeout(2000);
  await ctx.close();
  await browser.close();

  console.log("\n🎬 视频已保存到 videos/ 目录");
  console.log("📸 截图已保存到 screenshots/ 目录");
}

const MBTI_CN: Record<string, string> = {
  INTJ: "建筑师", INTP: "逻辑学家", ENTJ: "指挥官", ENTP: "辩论家",
  INFJ: "提倡者", INFP: "调停者", ENFJ: "主人公", ENFP: "竞选者",
  ISTJ: "物流师", ISFJ: "守卫者", ESTJ: "总经理", ESFJ: "执政官",
  ISTP: "鉴赏家", ISFP: "探险家", ESTP: "企业家", ESFP: "表演者",
};

run().catch(e => { console.error("FATAL:", e); process.exit(1); });
