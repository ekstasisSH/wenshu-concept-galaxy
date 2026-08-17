import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto('file:///E:/双创知识库/07_参考文件/_v2_work/skill_rag_full/galaxy/dist/concept_galaxy.html', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 10000));

const d = await page.evaluate(() => {
  const dbg = window.__dbg;
  if (!dbg) return { noDbg: true };
  const m = dbg.mao;
  const colorHex = m ? '#' + m.material.color.getHexString() : null;
  // 日心布局断言数据
  const rings = {};
  dbg.workMeshes.forEach(w => {
    const v = w.userData.w.vol;
    (rings[v] = rings[v] || []).push(w.position.length());
  });
  const ringAvg = {};
  for (const [v, rs] of Object.entries(rings)) ringAvg[v] = +(rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1);
  const wpos = {};
  dbg.workMeshes.forEach(w => wpos[w.userData.w.n] = w.position);
  const ds = [];
  dbg.conceptMeshes.forEach(c => {
    const src = c.userData.nd.src;
    if (src && wpos[src]) ds.push(c.position.distanceTo(wpos[src]));
  });
  ds.sort((a, b) => a - b);
  return {
    concepts: dbg.conceptMeshes.length,
    works: dbg.workMeshes.length,
    edges: dbg.edges.length,
    flowN: dbg.flowN,
    refCount: dbg.refCount,
    mao: m ? {
      color: colorHex, scale: +m.scale.x.toFixed(1),
      hasHalo: !!m.userData.halo, hasLabel: !!m.userData.label,
      r: +m.position.length().toFixed(2),
      deg: dbg.edges.filter(e => {
        const lk = e.userData.lk; return lk.s === '毛泽东' || lk.t === '毛泽东';
      }).length,
    } : null,
    ringAvg,
    satP95: ds.length ? +ds[Math.floor(ds.length * 0.95)].toFixed(1) : null,
    // 新增：Top12 / 加载屏 / 引导 / H 键
    topLabels: dbg.topLabels ? dbg.topLabels.length : null,
    topLabelNames: dbg.topLabels ? dbg.topLabels.map(l => l.userData.name) : [],
    splash: (() => { const s = document.getElementById('splash'); return s ? (s.classList.contains('hide') ? 'hidden' : 'visible') : 'removed'; })(),
    guide: (() => { const g = document.getElementById('guide'); return g ? (g.classList.contains('hide') ? 'hidden' : 'visible') : 'missing'; })(),
  };
});
console.log(JSON.stringify(d, null, 1));
console.log('ERRORS:', errs.length ? errs.join(' | ') : '无');

// 日心断言
const RING_TARGET = { '第一卷': 70, '第二卷': 125, '第三卷': 180, '第四卷': 235 };
const ringOk = Object.entries(RING_TARGET).every(([v, t]) => Math.abs((d.ringAvg?.[v] ?? 1e9) - t) <= 15);
const helioOk = d.mao && d.mao.r < 0.5 && ringOk && d.satP95 !== null && d.satP95 <= 36;
// 新增断言
const topOk = d.topLabels === 12;
const splashOk = d.splash === 'hidden' || d.splash === 'removed';
const guideOk = d.guide === 'hidden';
// H 键实测：按两次，检查 body.ui-hidden 切换
await page.keyboard.press('h');
const h1 = await page.evaluate(() => document.body.classList.contains('ui-hidden'));
await page.keyboard.press('h');
const h2 = await page.evaluate(() => document.body.classList.contains('ui-hidden'));
console.log(`H 键: 按1=${h1} 按2=${h2} ${(h1 && !h2) ? '✓' : '✗'}`);
const hOk = h1 && !h2;

console.log(`日心断言: 中心r=${d.mao?.r} 四环=${ringOk ? '✓' : '✗ ' + JSON.stringify(d.ringAvg)} 卫星p95=${d.satP95}`);
console.log(`新增断言: Top12=${topOk ? '✓' : '✗ ' + d.topLabels} 加载屏=${splashOk ? '✓' : '✗ ' + d.splash} 引导=${guideOk ? '✓' : '✗ ' + d.guide}`);

const ok = d.concepts === 1275 && d.works === 137 && d.refCount > 0 && d.mao && d.mao.hasHalo && d.mao.hasLabel && d.mao.color === '#ffd24d' && helioOk && topOk && splashOk && guideOk && hOk;
console.log(ok ? '✅ 数值验证全部通过（含日心 + Top12 + 加载屏 + 引导 + H键）' : '❌ 有断言失败');
await page.screenshot({ path: 'shot_m4.png' });
await browser.close();
process.exit(ok ? 0 : 1);
