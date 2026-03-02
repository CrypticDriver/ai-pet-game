/**
 * Task 2: Pressure Test — Create many pets and test system stability
 */
const BASE = "http://127.0.0.1:3000";
const api = (method: string, url: string, body?: any) =>
  fetch(`${BASE}${url}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json()).catch(() => ({ error: "fetch failed" }));

const NAMES = [
  "小白","黑猫","阿橘","星星","月月","豆豆","花花","团团","圆圆","球球",
  "奶茶","布丁","芒果","西瓜","棉花","雪球","饺子","汤圆","年糕","麻薯",
  "可乐","雪碧","拿铁","摩卡","抹茶","薯条","果冻","蛋挞","麻糬","饭团",
  "小虎","阿狗","阿猫","斑点","黑白","金金","银银","铜铜","铁蛋","石头",
  "云朵","彩虹","流星","闪电","春风","秋叶","冬雪","夏雨","朝阳","晚霞",
];

async function run() {
  console.log("═══ Task 2: 压力测试 ═══\n");

  // Phase 1: Create 50 pets
  console.log("📋 Phase 1: 创建50只Pet...");
  const start = Date.now();
  const petIds: string[] = [];

  for (let i = 0; i < 50; i++) {
    const res = await api("POST", "/api/init", {
      userId: `stress-${i}`, username: `U${i}`, petName: NAMES[i] || `Pix${i}`
    });
    if (res.pet?.id) petIds.push(res.pet.id);
    if ((i + 1) % 10 === 0) process.stdout.write(`  ${i + 1}/50\n`);
  }
  const createTime = Date.now() - start;
  console.log(`  ✅ ${petIds.length} pets created in ${createTime}ms (${(createTime / petIds.length).toFixed(0)}ms/pet)\n`);

  // Phase 2: Move pets to random locations
  console.log("📋 Phase 2: 随机分配位置...");
  const locations = ["hub", "park", "library", "cafe", "market", "lake"];
  let moveOk = 0, moveFail = 0;

  for (let i = 0; i < petIds.length; i++) {
    // Move through hub first then to target
    const target = locations[Math.floor(Math.random() * locations.length)];
    const r1 = await api("POST", `/api/pet/${petIds[i]}/move`, { destination: "hub" });
    if (target !== "hub") {
      // Check adjacency - hub connects to park, library, cafe, market
      if (["park", "library", "cafe", "market"].includes(target)) {
        await api("POST", `/api/pet/${petIds[i]}/move`, { destination: target });
      } else if (target === "lake") {
        await api("POST", `/api/pet/${petIds[i]}/move`, { destination: "park" });
        await api("POST", `/api/pet/${petIds[i]}/move`, { destination: "lake" });
      }
    }
    moveOk++;
  }
  console.log(`  ✅ ${moveOk} pets distributed\n`);

  // Phase 3: Check map distribution
  console.log("📋 Phase 3: 验证地图分布...");
  const map = await api("GET", "/api/world/map");
  if (Array.isArray(map)) {
    for (const loc of map) {
      console.log(`  📍 ${loc.name}: ${loc.petCount} pets`);
    }
  }

  // Phase 4: Batch work
  console.log("\n📋 Phase 4: 批量打工...");
  let workOk = 0, workFail = 0;
  const workStart = Date.now();

  for (let i = 0; i < Math.min(20, petIds.length); i++) {
    const avail = await api("GET", `/api/pet/${petIds[i]}/work`);
    if (Array.isArray(avail) && avail.length > 0 && avail[0].available) {
      const res = await api("POST", `/api/pet/${petIds[i]}/work`, { job: avail[0].job });
      if (res.ok) workOk++; else workFail++;
    }
  }
  const workTime = Date.now() - workStart;
  console.log(`  ✅ ${workOk} worked, ${workFail} failed (${workTime}ms)\n`);

  // Phase 5: Concurrent conversations (3 pairs)
  console.log("📋 Phase 5: 并发对话（3对）...");
  const convStart = Date.now();
  const convPromises = [];

  // Pick 3 pairs of pets in same location
  for (let i = 0; i < 6; i += 2) {
    convPromises.push(
      api("POST", `/api/pet/${petIds[i]}/talk`, {
        targetName: NAMES[i + 1], message: "你好！"
      })
    );
  }

  const results = await Promise.allSettled(convPromises);
  let convOk = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && (r.value as any).ok) convOk++;
  }
  const convTime = Date.now() - convStart;
  console.log(`  ✅ ${convOk}/3 conversations succeeded (${convTime}ms)\n`);

  // Phase 6: API response times
  console.log("📋 Phase 6: API响应时间...");
  const endpoints = [
    ["GET", "/api/world/map"],
    ["GET", "/api/world/economy"],
    ["GET", "/api/world/social-graph"],
    ["GET", "/api/world/language"],
    ["GET", "/api/world/history?limit=10"],
    ["GET", "/api/guilds"],
    ["GET", `/api/pet/${petIds[0]}/soul`],
  ];

  for (const [method, url] of endpoints) {
    const t = Date.now();
    await api(method, url);
    const ms = Date.now() - t;
    const status = ms < 100 ? "✅" : ms < 500 ? "⚠️" : "❌";
    console.log(`  ${status} ${url.padEnd(35)} ${ms}ms`);
  }

  // Phase 7: Economy stats
  console.log("\n📋 Phase 7: 经济统计...");
  const econ = await api("GET", "/api/world/economy");
  console.log(`  💰 总流通: ${econ.totalBalance}`);
  console.log(`  👥 Pet数: ${econ.totalPets}`);
  console.log(`  📊 平均: ${econ.avgBalance}`);

  // Phase 8: DB size
  const fs = await import("fs");
  const dbSize = fs.statSync("data/pet.db").size;
  console.log(`\n📋 Phase 8: 数据库大小: ${(dbSize / 1024).toFixed(0)}KB`);

  console.log("\n═══ 压力测试完成 ═══");
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
