// _shot_tour.mjs — 自动巡礼关键帧截图（整体→实践论→连线弧线→回整体）
// 用法：node _shot_tour.mjs
import puppeteer from 'puppeteer-core';
const ROOT = 'E:/双创知识库/wenshu-concept-galaxy';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(e.message));
await page.setViewport({ width: 1600, height: 900 });
await page.goto(`file:///${ROOT.replace(/\\/g, '/')}/dist/concept_galaxy.html?tour=1`, { waitUntil: 'load' });
// 轮询等待 tour 启动（页面加载 + 数据构建耗时不定）
for (let i = 0; i < 40; i++) {
  const on = await page.evaluate(() => window.__dbg?.tour?.active ?? false);
  if (on) break;
  await new Promise(r => setTimeout(r, 500));
}
console.log('tour 已启动，开始截图');

// 时间轴（tourStart 后）：idx0 hold3.5 → idx1 实践论 hold5 → idx2 arc1 hold4 → idx3 arc2 hold4 → idx4 回整体 hold4 → 结束
// 按 idx 轮询触发（screenshot 自身耗时不可控，固定 sleep 会漂移）
const shots = [
  { idx: 0, name: 'tour_1_overview' },       // 整体俯瞰
  { idx: 1, name: 'tour_2_shijianlun' },      // 实践论特写
  { idx: 2, name: 'tour_3_arc_a' },           // 连线弧线（近实践论侧）
  { idx: 3, name: 'tour_4_arc_b' },           // 连线弧线（近教条主义侧）
  { idx: 4, name: 'tour_5_back' },            // 回整体
];
for (const s of shots) {
  // 等待进入目标步骤
  for (let i = 0; i < 80; i++) {
    const st = await page.evaluate(() => window.__dbg?.tour?.idx ?? -1);
    if (st === s.idx) break;
    await new Promise(r => setTimeout(r, 300));
  }
  await new Promise(r => setTimeout(r, 1000));   // 该步构图稳定（flight 已完成）
  await page.screenshot({ path: `${ROOT}/shot_${s.name}.png` });
  const st = await page.evaluate(() => {
    const t = window.__dbg?.tour;
    const cam = window.__dbg?.camera?.position;
    return { active: t?.active, idx: t?.idx, cam: cam ? [Math.round(cam.x), Math.round(cam.y), Math.round(cam.z)] : null };
  });
  console.log(`${s.name}: tour.active=${st.active} idx=${st.idx} cam=${JSON.stringify(st.cam)}`);
}
console.log('ERRORS:', errs.length ? errs.join(' | ') : '无');
await browser.close();
console.log('🎯 巡礼关键帧截图完成');
