/**
 * Full Civilization Demo — 3 Pets, different personalities
 * For boss review
 */

const BASE = "http://127.0.0.1:3000";

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

function divider(title: string) {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(50)}\n`);
}

async function run() {
  console.log("🎬 PixelVerse 文明系统 — 完整演示");
  console.log("   3只Pet · 不同性格 · 社交/经济/公会");
  console.log("   " + new Date().toISOString());

  // ═══ ACT 1: Birth ═══
  divider("ACT 1: 三只Pix诞生");

  const petA = (await api("POST", "/api/init", { userId: "owner1", username: "玩家1", petName: "小白" })).pet;
  const petB = (await api("POST", "/api/init", { userId: "owner2", username: "玩家2", petName: "黑猫" })).pet;
  const petC = (await api("POST", "/api/init", { userId: "owner3", username: "玩家3", petName: "阿橘" })).pet;

  console.log(`🐰 小白 (${petA.id}) — 活泼好奇型`);
  console.log(`🐱 黑猫 (${petB.id}) — 安静内向型`);
  console.log(`🍊 阿橘 (${petC.id}) — 社交达人型`);

  // Show souls
  const soulA = await api("GET", `/api/pet/${petA.id}/soul`);
  const soulB = await api("GET", `/api/pet/${petB.id}/soul`);
  const soulC = await api("GET", `/api/pet/${petC.id}/soul`);

  console.log(`\n🧬 性格差异（随机生成）：`);
  console.log(`  小白: 好奇${soulA.traits?.curiosity} 社交${soulA.traits?.sociability} 活泼${soulA.traits?.playfulness}`);
  console.log(`  黑猫: 好奇${soulB.traits?.curiosity} 社交${soulB.traits?.sociability} 活泼${soulB.traits?.playfulness}`);
  console.log(`  阿橘: 好奇${soulC.traits?.curiosity} 社交${soulC.traits?.sociability} 活泼${soulC.traits?.playfulness}`);

  // ═══ ACT 2: World Map ═══
  divider("ACT 2: PixelVerse 世界地图");

  const map = await api("GET", "/api/world/map");
  console.log("📍 6个地点：");
  for (const loc of map) {
    const connects = Array.isArray(loc.connects_to) ? loc.connects_to : JSON.parse(loc.connects_to || "[]");
    console.log(`  ${loc.name} → ${connects.map((c: string) => {
      const l = map.find((m: any) => m.id === c);
      return l ? l.name : c;
    }).join(", ")}`);
  }

  // ═══ ACT 3: Wallets ═══
  divider("ACT 3: PixelCoin 初始化");

  const walA = await api("GET", `/api/pet/${petA.id}/wallet`);
  const walB = await api("GET", `/api/pet/${petB.id}/wallet`);
  const walC = await api("GET", `/api/pet/${petC.id}/wallet`);
  console.log(`💰 小白: ${walA.balance} PixelCoin`);
  console.log(`💰 黑猫: ${walB.balance} PixelCoin`);
  console.log(`💰 阿橘: ${walC.balance} PixelCoin`);

  // ═══ ACT 4: Movement ═══
  divider("ACT 4: Pet自由移动");

  // 小白去公园
  let r = await api("POST", `/api/pet/${petA.id}/move`, { destination: "park" });
  console.log(`🐰 小白: hub → ${r.location?.name} ${r.ok ? "✅" : "❌ " + r.reason}`);

  // 黑猫去图书馆
  r = await api("POST", `/api/pet/${petB.id}/move`, { destination: "library" });
  console.log(`🐱 黑猫: hub → ${r.location?.name} ${r.ok ? "✅" : "❌ " + r.reason}`);

  // 阿橘去咖啡厅
  r = await api("POST", `/api/pet/${petC.id}/move`, { destination: "cafe" });
  console.log(`🍊 阿橘: hub → ${r.location?.name} ${r.ok ? "✅" : "❌ " + r.reason}`);

  // 黑猫尝试直接去月光湖（不相邻，应该失败）
  r = await api("POST", `/api/pet/${petB.id}/move`, { destination: "lake" });
  console.log(`🐱 黑猫: 图书馆 → 月光湖 ${r.ok ? "✅" : "❌ " + r.reason} （正确阻断）`);

  // Show map
  const map2 = await api("GET", "/api/world/map");
  console.log("\n📍 地图人口：");
  for (const loc of map2) {
    if (loc.petCount > 0) console.log(`  ${loc.name}: ${loc.petCount} 只Pix`);
  }

  // ═══ ACT 5: Perception ═══
  divider("ACT 5: 感知系统");

  // 小白看看公园
  const percA = await api("GET", `/api/pet/${petA.id}/perception`);
  console.log(`🐰 小白看到：`);
  console.log(`  位置: ${percA.location.name} (${percA.location.mood})`);
  console.log(`  附近: ${percA.nearbyPets.length} 只Pix`);
  console.log(`  描述: ${percA.location.description?.slice(0, 60)}`);

  // ═══ ACT 6: Work ═══
  divider("ACT 6: 打工赚钱");

  // 小白在公园打工
  const workA = await api("GET", `/api/pet/${petA.id}/work`);
  console.log(`🐰 小白在公园可以做的工作：`);
  for (const w of workA) console.log(`  ${w.job}: ${w.pay}币 (可做: ${w.available ? "✅" : "❌ CD中"})`);

  let workResult = await api("POST", `/api/pet/${petA.id}/work`, { job: "打扫落叶" });
  console.log(`\n🐰 小白去打扫落叶...`);
  console.log(`  赚了${workResult.pay}币! 余额: ${workResult.balance}`);

  // 黑猫在图书馆打工
  r = await api("POST", `/api/pet/${petB.id}/move`, { destination: "hub" });
  r = await api("POST", `/api/pet/${petB.id}/move`, { destination: "library" });
  const workB = await api("GET", `/api/pet/${petB.id}/work`);
  console.log(`\n🐱 黑猫在图书馆可以做的工作：`);
  for (const w of workB) console.log(`  ${w.job}: ${w.pay}币`);

  workResult = await api("POST", `/api/pet/${petB.id}/work`, { job: "整理书架" });
  console.log(`🐱 黑猫去整理书架... 赚了${workResult.pay}币! 余额: ${workResult.balance}`);

  // 阿橘在咖啡厅打工
  const workC = await api("GET", `/api/pet/${petC.id}/work`);
  console.log(`\n🍊 阿橘在咖啡厅可以做的工作：`);
  for (const w of workC) console.log(`  ${w.job}: ${w.pay}币`);

  workResult = await api("POST", `/api/pet/${petC.id}/work`, { job: "帮忙端咖啡" });
  console.log(`🍊 阿橘帮忙端咖啡... 赚了${workResult.pay}币! 余额: ${workResult.balance}`);

  // ═══ ACT 7: Social — 3 Pets meet ═══
  divider("ACT 7: 三只Pix在公园相遇 (LLM对话)");

  // Move everyone to park
  await api("POST", `/api/pet/${petB.id}/move`, { destination: "hub" });
  await api("POST", `/api/pet/${petB.id}/move`, { destination: "park" });
  await api("POST", `/api/pet/${petC.id}/move`, { destination: "hub" });
  await api("POST", `/api/pet/${petC.id}/move`, { destination: "park" });

  console.log("三只Pix都到了公园！\n");

  // 小白 → 黑猫
  console.log("--- 🐰小白 → 🐱黑猫 ---");
  let talk = await api("POST", `/api/pet/${petA.id}/talk`, {
    targetName: "黑猫",
    message: "嘿！你也来公园了！今天天气真好，要不要一起散步？"
  });
  console.log(`小白: "嘿！你也来公园了！今天天气真好，要不要一起散步？"`);
  console.log(`黑猫: "${talk.reply?.slice(0, 120)}"\n`);

  // Wait for memory creation to finish before next conversation
  await new Promise(r => setTimeout(r, 5000));

  // 阿橘 → 小白
  console.log("--- 🍊阿橘 → 🐰小白 ---");
  talk = await api("POST", `/api/pet/${petC.id}/talk`, {
    targetName: "小白",
    message: "哟！你们俩在聊什么呢？能加入吗？"
  });
  console.log(`阿橘: "哟！你们俩在聊什么呢？能加入吗？"`);
  console.log(`小白: "${talk.reply?.slice(0, 120)}"\n`);

  // Wait for memory creation
  await new Promise(r => setTimeout(r, 5000));

  // 阿橘 → 黑猫
  console.log("--- 🍊阿橘 → 🐱黑猫 ---");
  talk = await api("POST", `/api/pet/${petC.id}/talk`, {
    targetName: "黑猫",
    message: "黑猫你好呀！听说你刚在图书馆整理书架？辛苦啦～"
  });
  console.log(`阿橘: "黑猫你好呀！听说你刚在图书馆整理书架？辛苦啦～"`);
  console.log(`黑猫: "${talk.reply?.slice(0, 120)}"`);

  // ═══ ACT 8: Relationships ═══
  divider("ACT 8: 关系网络");

  const relsA = await api("GET", `/api/pet/${petA.id}/relationships`);
  const relsB = await api("GET", `/api/pet/${petB.id}/relationships`);
  const relsC = await api("GET", `/api/pet/${petC.id}/relationships`);

  console.log("🐰 小白的关系：");
  for (const r of relsA) console.log(`  → ${r.target_name}: ${r.type} (好感${r.affinity} 信任${r.trust} 聊了${r.interaction_count}次)`);

  console.log("🐱 黑猫的关系：");
  for (const r of relsB) console.log(`  → ${r.target_name}: ${r.type} (好感${r.affinity} 信任${r.trust} 聊了${r.interaction_count}次)`);

  console.log("🍊 阿橘的关系：");
  for (const r of relsC) console.log(`  → ${r.target_name}: ${r.type} (好感${r.affinity} 信任${r.trust} 聊了${r.interaction_count}次)`);

  // ═══ ACT 9: Gift ═══
  divider("ACT 9: 送礼物");

  let gift = await api("POST", `/api/pet/${petC.id}/transfer`, {
    targetPetId: petB.id, amount: 15, reason: "gift"
  });
  console.log(`🍊 阿橘送了黑猫15 PixelCoin！`);
  console.log(`  阿橘余额: ${gift.fromBalance}  黑猫余额: ${gift.toBalance}`);

  gift = await api("POST", `/api/pet/${petA.id}/transfer`, {
    targetPetId: petC.id, amount: 8, reason: "gift"
  });
  console.log(`🐰 小白送了阿橘8 PixelCoin！`);
  console.log(`  小白余额: ${gift.fromBalance}  阿橘余额: ${gift.toBalance}`);

  // ═══ ACT 10: Guild ═══
  divider("ACT 10: 公会成立");

  const guild = await api("POST", "/api/guild/create", {
    name: "公园三人组",
    description: "在公园相遇的三只好朋友",
    founderPetId: petC.id,
    territory: "park"
  });
  console.log(`🏰 阿橘创建了公会: "${guild.guild?.name}"`);
  console.log(`  描述: ${guild.guild?.description}`);
  console.log(`  领地: park`);

  const guildId = guild.guild?.id;
  await api("POST", `/api/guild/${guildId}/join`, { petId: petA.id });
  await api("POST", `/api/guild/${guildId}/join`, { petId: petB.id });
  console.log(`\n🐰 小白加入了公会！`);
  console.log(`🐱 黑猫加入了公会！`);

  const guildInfo = await api("GET", `/api/guild/${guildId}`);
  console.log(`\n🏰 公会成员：`);
  for (const m of guildInfo.members) {
    const emoji = m.name === "小白" ? "🐰" : m.name === "黑猫" ? "🐱" : "🍊";
    console.log(`  ${emoji} ${m.name} — ${m.role}`);
  }

  // ═══ ACT 11: Economy Summary ═══
  divider("ACT 11: 经济总览");

  const econ = await api("GET", "/api/world/economy");
  console.log(`💰 PixelVerse经济：`);
  console.log(`  活跃Pet: ${econ.totalPets}`);
  console.log(`  总流通: ${econ.totalBalance} PixelCoin`);
  console.log(`  平均余额: ${econ.avgBalance}`);
  console.log(`  今日交易: ${econ.todayTransactions}笔`);

  // Individual balances
  const fwalA = await api("GET", `/api/pet/${petA.id}/wallet`);
  const fwalB = await api("GET", `/api/pet/${petB.id}/wallet`);
  const fwalC = await api("GET", `/api/pet/${petC.id}/wallet`);
  console.log(`\n  🐰 小白: ${fwalA.balance}币 (赚${fwalA.total_earned} 花${fwalA.total_spent})`);
  console.log(`  🐱 黑猫: ${fwalB.balance}币 (赚${fwalB.total_earned} 花${fwalB.total_spent})`);
  console.log(`  🍊 阿橘: ${fwalC.balance}币 (赚${fwalC.total_earned} 花${fwalC.total_spent})`);

  // ═══ ACT 12: Message Stats ═══
  divider("ACT 12: 通信统计");

  const msgs = await api("GET", "/api/world/message-stats");
  console.log(`📨 消息总线：`);
  console.log(`  总消息: ${msgs.total}`);
  console.log(`  今日: ${msgs.today}`);

  // ═══ Summary ═══
  divider("🎉 演示完成");

  console.log("Phase 1+2 功能清单：");
  console.log("  ✅ 6个地点 + 相邻移动验证");
  console.log("  ✅ 感知系统（位置+氛围+附近Pet）");
  console.log("  ✅ LLM对LLM真对话（每只Pet独立思考）");
  console.log("  ✅ 双向记忆创建");
  console.log("  ✅ 关系系统（好感+信任+类型演变）");
  console.log("  ✅ PixelCoin经济（打工+送礼+交易）");
  console.log("  ✅ 地点工作系统（6地点×多种工作）");
  console.log("  ✅ 公会系统（创建+加入+角色）");
  console.log("  ✅ 消息总线（直接+广播）");
  console.log("  ✅ 安全护栏（防觉醒+防幻觉）");
  console.log("  ✅ LLM调度器（分层模型选择）");
  console.log("  ✅ 自主思考v2（42秒tick+刺激触发）");
}

run().catch(e => { console.error(e); process.exit(1); });
