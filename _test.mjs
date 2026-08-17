import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto('file:///E:/双创知识库/07_参考文件/_v2_work/skill_rag_full/galaxy/dist/concept_galaxy.html', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 10000));

const info = await page.evaluate(() => {
  const cv = document.querySelector('#gl canvas');
  const st = document.getElementById('stat').textContent;
  const hasData = !!window.__GALAXY_DATA__;
  return {
    canvas: !!cv, w: cv ? cv.width : 0, h: cv ? cv.height : 0,
    stat: st, hasData,
    worksLegend: document.querySelectorAll('#legend .it.vol').length,
  };
});
console.log('INFO:', JSON.stringify(info, null, 1));
console.log('ERRORS:', errs.length ? errs.join('\n') : '无');
await page.screenshot({ path: 'shot_m3.png' });
await browser.close();
