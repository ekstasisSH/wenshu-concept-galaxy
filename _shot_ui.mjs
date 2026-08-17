// UI 展示层截图：shot_ui_main.png（全景）+ shot_ui_panel.png（详情面板打开）
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
await page.screenshot({ path: 'shot_ui_main.png' });

// 打开一个关系丰富的概念面板（优先「实践」，退回首个非叶子概念）
const opened = await page.evaluate(() => {
  const { ui } = window.__dbg;
  const nd = ui.nodeMap.get('实践')
    || [...ui.nodeMap.values()].find(n => n.t === 'concept' && n.d && n.d.length > 60);
  if (nd) { ui.showConceptPanel(nd); return nd.n; }
  return null;
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: 'shot_ui_panel.png' });
console.log('面板打开节点:', opened);
console.log('ERRORS:', errs.length ? errs.join(' | ') : '无');
await browser.close();
