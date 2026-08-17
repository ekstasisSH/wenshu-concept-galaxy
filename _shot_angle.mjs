// _shot_angle.mjs — 截两个精心调整角度的 galaxy 展示图
//  v2: H 键隐藏 UI（设计 spec 要求"无遮挡"+ galaxy_main 让中心更居中）
// 用法：node _shot_angle.mjs
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const ROOT = dirname(fileURLToPath(import.meta.url));

const HTML = `file:///${ROOT.replace(/\\/g,'/')}/dist/concept_galaxy.html`;

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

async function setupScene(page, opts) {
  await page.evaluate((o) => {
    const d = window.__dbg;
    if (!d) return;
    d.intro.active = false;
    d.controls.autoRotate = false;
    d.controls.enableDamping = false;  // 禁用阻尼，相机立刻稳定
    d.camera.position.set(o.pos[0], o.pos[1], o.pos[2]);
    d.camera.lookAt(o.target[0], o.target[1], o.target[2]);
    d.controls.target.set(o.target[0], o.target[1], o.target[2]);
    d.camera.updateProjectionMatrix();
    // H 键隐藏 UI（PPT 用图不应有 UI 干扰）
    document.body.classList.add('ui-hidden');
  }, opts);
  await new Promise(r => setTimeout(r, 800));
}

// ---- 1) P06 主视觉：1600x900 全景·日心结构·强俯视展椭圆 ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.goto(HTML, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 5500));

  // 主体居中 + 更近 + 强俯视展椭圆：让 4 环填满画面 75%
  await setupScene(page, {
    pos: [0, 340, 320],   // 47° 俯视 + 正对（4 环呈标准椭圆，主体撑大）
    target: [0, 0, 0],
  });

  await page.screenshot({
    path: `${ROOT}/galaxy_main.png`,
    clip: { x: 0, y: 0, width: 1600, height: 900 }
  });
  console.log('✅ galaxy_main.png (1600x900, 俯视38°偏斜14°, UI 隐藏)');
  await page.close();
}

// ---- 2) P07 辅证：800x600 局部·《论持久战》附近·看大节点标签 ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 2 });
  await page.goto(HTML, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 5500));

  // 飞行到《矛盾论》（卷三 r=180，cnt=42 大节点）附近——很近，看标签
  const wp = await page.evaluate(() => {
    const d = window.__dbg;
    const w = d.workMeshes.find(x => x.userData.w.n === '矛盾论');
    return w ? w.position : null;
  });
  if (wp) {
    // 沿径向外推 80%（让毛星在身后，几乎出画面），相机正对矛盾论
    const len = Math.hypot(wp.x, wp.z) || 1;  // 沿 xz 平面的径向距离
    const outX = (wp.x / len) * len * 0.8;       // 简化为 wp.x * 0.8 不对，要更直接
    // 直接用 wp 自身位置：相机在 wp 径向外 100 单位
    const radial = 100;
    await setupScene(page, {
      pos: [wp.x + (wp.x / len) * radial, wp.y + 40, wp.z + (wp.z / len) * radial],
      target: [wp.x, wp.y, wp.z],
    });
  } else {
    console.warn('⚠️ 矛盾论未找到，使用默认位置');
    await setupScene(page, { pos: [180, 100, 320], target: [60, 0, 80] });
  }

  await page.screenshot({
    path: `${ROOT}/galaxy_detail.png`,
    clip: { x: 0, y: 0, width: 800, height: 600 }
  });
  console.log('✅ galaxy_detail.png (800x600, 飞行到《论持久战》附近, UI 隐藏)');
  await page.close();
}

await browser.close();
console.log('🎯 双角度截图完成');
