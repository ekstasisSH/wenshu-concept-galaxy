// _shot_filter.mjs — 筛选演示段关键帧截图（最小集→领域→卷→关系→全貌）
// 用法：node _shot_filter.mjs
import puppeteer from 'puppeteer-core';
const ROOT = 'E:/双创知识库/wenshu-concept-galaxy';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto(`file:///${ROOT.replace(/\\/g, '/')}/dist/concept_galaxy.html?tour=1`, { waitUntil: 'load' });
for (let i = 0; i < 40; i++) {
  const on = await page.evaluate(() => window.__dbg?.tour?.active ?? false);
  if (on) break;
  await new Promise(r => setTimeout(r, 500));
}
console.log('tour 已启动，开始截图筛选段');
// idx：5=最小集 12=领域全开 15=卷全开 18=关系全开 19=全貌(结束)
const shots = [
  { idx: 5, name: 'filter_1_min' },
  { idx: 12, name: 'filter_2_fields_all' },
  { idx: 15, name: 'filter_3_vols_all' },
  { idx: 18, name: 'filter_4_rels_all' },
  { idx: 19, name: 'filter_5_final' },
];
for (const s of shots) {
  for (let i = 0; i < 120; i++) {
    const st = await page.evaluate(() => window.__dbg?.tour?.idx ?? -1);
    if (st === s.idx) break;
    await new Promise(r => setTimeout(r, 300));
  }
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: `${ROOT}/shot_${s.name}.png` });
  const st = await page.evaluate(() => {
    const dbg = window.__dbg, t = dbg?.tour;
    return { idx: t?.idx, fld: Object.entries(dbg?.state?.fieldOn || {}).filter(([, v]) => v).length, vol: Object.entries(dbg?.state?.volOn || {}).filter(([, v]) => v).length, rel: Object.entries(dbg?.state?.relOn || {}).filter(([, v]) => v).length };
  });
  console.log(`${s.name}: idx=${st.idx} 领域开=${st.fld} 卷开=${st.vol} 关系开=${st.rel}`);
}
await browser.close();
console.log('🎯 筛选段截图完成');
