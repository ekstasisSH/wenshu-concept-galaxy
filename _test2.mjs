import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto('file:///E:/双创知识库/wenshu-concept-galaxy/dist/concept_galaxy.html', { waitUntil: 'load' });
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
    // [F] 恒星点精灵亮核
    starPt: dbg.starPoints ? {
      count: dbg.starPoints.geometry.attributes.position.count,
      aSize: +dbg.starPoints.geometry.attributes.aSize.array[0].toFixed(1),
      bright: dbg.starPoints.material.uniforms.uBright.value,
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

// 自动巡礼（tour）断言
const tourD = await page.evaluate(() => {
  const dbg = window.__dbg;
  if (!dbg || !dbg.tour) return { missing: true };
  const t = dbg.tour;
  const sjl = dbg.workMeshes.find(w => w.userData.w.n === '实践论');
  const jtz = dbg.conceptMeshes.find(c => c.userData.nd && c.userData.nd.n === '教条主义');
  let arcOk = false, arcPos = null;
  if (sjl && jtz) {
    const f = dbg.tourArcPos(sjl.position, jtz.position, 0);
    arcOk = !!(f && isFinite(f.pos.x) && isFinite(f.pos.y) && isFinite(f.pos.z));
    arcPos = f ? { dist: Math.round(Math.hypot(f.pos.x, f.pos.y, f.pos.z)), look: [Math.round(f.look.x), Math.round(f.look.y), Math.round(f.look.z)] } : null;
  }
  dbg.tourStart();
  const startOk = t.active;
  const kinds = t.steps.map(s => s.kind).join(',');
  const stepsOk = t.steps.length === 20
    && t.steps.slice(0, 5).map(s => s.kind).join(',') === 'hold,fly,arc,arc,overview'
    && t.steps.slice(5).every(s => s.kind === 'filter')
    && t.steps.filter(s => s.kind === 'filter').length === 15;
  // filter 应用断言：reset=min 最小集 / 增量开 / reset=all 全开
  dbg.tourApplyFilter({ reset: 'min' });
  const minOk = dbg.state.fieldOn['cross'] === true && dbg.state.fieldOn[''] === true
    && dbg.state.fieldOn['一.新民主主义革命'] === false && dbg.state.volOn['第一卷'] === true
    && dbg.state.volOn['第二卷'] === false && dbg.state.relOn['source'] === false;
  dbg.tourApplyFilter({ fieldOn: ['一.新民主主义革命'], relOn: ['source'] });
  const incOk = dbg.state.fieldOn['一.新民主主义革命'] === true && dbg.state.relOn['source'] === true;
  dbg.tourApplyFilter({ reset: 'all' });
  const allOk = dbg.state.fieldOn['七.活的灵魂'] === true && dbg.state.volOn['第四卷'] === true && dbg.state.relOn['debate'] === true;
  dbg.tourCancel();
  const cancelOk = !t.active;
  return { stepsOk, nodesOk: !!(sjl && jtz), arcOk, arcPos, startOk, cancelOk, filterOk: minOk && incOk && allOk };
});
console.log(`tour 断言: 步骤=${tourD.stepsOk ? '✓' : '✗'} 节点=${tourD.nodesOk ? '✓' : '✗'} 连线取景=${tourD.arcOk ? '✓' : '✗ ' + JSON.stringify(tourD.arcPos)} 启动=${tourD.startOk ? '✓' : '✗'} 筛选=${tourD.filterOk ? '✓' : '✗'} 打断=${tourD.cancelOk ? '✓' : '✗'}`);
const tourOk = !tourD.missing && tourD.stepsOk && tourD.nodesOk && tourD.arcOk && tourD.startOk && tourD.cancelOk && tourD.filterOk;

// ?tour=1 自动启动
const p2 = await browser.newPage();
await p2.setViewport({ width: 1440, height: 900 });
await p2.goto('file:///E:/双创知识库/wenshu-concept-galaxy/dist/concept_galaxy.html?tour=1', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 4000));
const tourAuto = await p2.evaluate(() => window.__dbg ? window.__dbg.tour.active : false);
await p2.close();
console.log(`?tour=1 自动启动: ${tourAuto ? '✓' : '✗'}`);

// [LOD] 局部标签断言：特写时显示标签，整体时隐藏
const lodD = await page.evaluate(() => {
  const dbg = window.__dbg;
  if (!dbg || !dbg.lodLabels) return { missing: true };
  const pool = dbg.lodLabels.length;
  const sjl = dbg.workMeshes.find(w => w.userData.w.n === '实践论');
  // 特写：相机放实践论附近
  dbg.camera.position.set(sjl.position.x - 40, sjl.position.y + 60, sjl.position.z + 140);
  dbg.controls.target.copy(sjl.position);
  dbg.controls.update();
  dbg.updateLodLabels();
  const visNear = dbg.lodLabels.filter(l => l.visible).length;
  const nearNames = dbg.lodLabels.filter(l => l.visible).map(l => l.userData && l.userData.name).filter(Boolean).length;
  // 整体：相机回默认
  dbg.camera.position.set(430, 260, 540);
  dbg.controls.target.set(0, 0, 0);
  dbg.controls.update();
  dbg.updateLodLabels();
  const visFar = dbg.lodLabels.filter(l => l.visible).length;
  const top12Visible = dbg.topLabels.filter(l => l.visible).length;
  return { pool, visNear, visFar, top12Visible };
});
console.log(`LOD 断言: 池=${lodD.pool} 特写可见=${lodD.visNear} 整体可见=${lodD.visFar} 整体Top12=${lodD.top12Visible} ${(lodD.pool === 60 && lodD.visNear > 0 && lodD.visFar === 0 && lodD.top12Visible === 12) ? '✓' : '✗'}`);
const lodOk = !lodD.missing && lodD.pool === 60 && lodD.visNear > 0 && lodD.visFar === 0 && lodD.top12Visible === 12;

console.log(`日心断言: 中心r=${d.mao?.r} 四环=${ringOk ? '✓' : '✗ ' + JSON.stringify(d.ringAvg)} 卫星p95=${d.satP95}`);
console.log(`新增断言: Top12=${topOk ? '✓' : '✗ ' + d.topLabels} 加载屏=${splashOk ? '✓' : '✗ ' + d.splash} 引导=${guideOk ? '✓' : '✗ ' + d.guide}`);

const ok = d.concepts === 1275 && d.works === 137 && d.refCount > 0 && d.mao && d.mao.hasHalo && d.mao.hasLabel && d.mao.color === '#ffd24d' && helioOk && topOk && splashOk && guideOk && hOk && d.starPt && d.starPt.count === 1 && d.starPt.aSize > 30 && tourOk && tourAuto && lodOk;
console.log(`[F] 恒星亮核: count=${d.starPt?.count} aSize=${d.starPt?.aSize} uBright=${d.starPt?.bright} ${(d.starPt && d.starPt.count === 1 && d.starPt.aSize > 30) ? '✓' : '✗'}`);
console.log(ok ? '✅ 数值验证全部通过（含日心 + Top12 + 加载屏 + 引导 + H键 + 恒星亮核 + 自动巡礼 + LOD局部标签）' : '❌ 有断言失败');
await page.screenshot({ path: 'shot_m4.png' });
await browser.close();
process.exit(ok ? 0 : 1);
