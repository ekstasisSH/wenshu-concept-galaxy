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
await new Promise(r => setTimeout(r, 9000));

const d = await page.evaluate(() => {
  const dbg = window.__dbg;
  if (!dbg) return { noDbg: true };
  const m = dbg.mao;
  const colorHex = m ? '#' + m.material.color.getHexString() : null;
  return {
    concepts: dbg.conceptMeshes.length,
    works: dbg.workMeshes.length,
    edges: dbg.edges.length,
    flowN: dbg.flowN,
    refCount: dbg.refCount,
    mao: m ? {
      color: colorHex, scale: +m.scale.x.toFixed(1),
      hasHalo: !!m.userData.halo, hasLabel: !!m.userData.label,
      deg: dbg.edges.filter(e => {
        const lk = e.userData.lk; return lk.s === '毛泽东' || lk.t === '毛泽东';
      }).length,
    } : null,
  };
});
console.log(JSON.stringify(d, null, 1));
console.log('ERRORS:', errs.length ? errs.join(' | ') : '无');
const ok = d.concepts === 1275 && d.works === 137 && d.refCount > 0 && d.mao && d.mao.hasHalo && d.mao.hasLabel && d.mao.color === '#ffd24d';
console.log(ok ? '✅ M3 数值验证全部通过' : '❌ 有断言失败');
await page.screenshot({ path: 'shot_m4.png' });
await browser.close();
process.exit(ok ? 0 : 1);
