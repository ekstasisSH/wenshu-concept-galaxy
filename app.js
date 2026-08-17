/**
 * 文枢 · 毛选概念宇宙 — 主逻辑
 * 开发版：fetch data/galaxy_data.json；构建版：window.__GALAXY_DATA__ 内联
 */
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/addons/controls/OrbitControls.js';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/addons/postprocessing/UnrealBloomPass.js';

// ================= CONFIG（精修循环改这里） =================
const CONFIG = {
  camera:       { x: 430, y: 260, z: 540 },
  bgColor:      0x05070f,     // 深空背景色（蓝黑微紫）
  autoRotate:   true,
  autoSpeed:    0.8,
  bloom:        { strength: 0.65, radius: 0.7, threshold: 0.80 },
  starCount:    3200,
  conceptBase:  1.1,          // 概念最小半径
  conceptMax:   5.5,
  leafDegree:   2,            // 星等降噪：连接度≤此值视为叶子概念
  leafSizeFactor: 0.6,        // 叶子概念半径系数
  leafOpacity:  0.7,          // 叶子概念透明度
  haloSizeFactor: 3.0,        // 节点光晕相对半径倍数
  haloOpacity:  0.45,         // 节点光晕透明度
  workBase:     6.0,          // 篇目星半径
  workMax:      15.0,
  workOpacity:  0.75,
  arcBend:      0.24,         // 弧线垂直拱起系数
  arcBundle:    0.5,          // 控制点向中心收缩
  arcBackboneOp:0.30,         // 骨干边基础透明度
  arcFocusOp:   0.85,         // 聚焦边透明度
  arcFadeExp:   0.7,          // 弧线头尾渐变指数（越大衰减越窄）
  arcFadeMin:   0.10,         // 弧线端点最低亮度保留
  flowPerLink:  12,           // 每条边粒子数
  flowSpeed:    0.055,
  flowSize:     1.7,
  parallelGap:  8.0,          // 平行边偏移间距
  alpha:        0.45,         // 概念混合布局权重（与数据生成一致）
};

// ================= 类型/关系/卷配色 =================
const TYPE_COLOR = { concept: 0x7fb0ff, theory: 0xc97bd8, scholar: 0x5ad1a0, work: 0xe8b870, ghost: 0x8899bb };
const TYPE_NAME  = { concept: '概念', theory: '理论', scholar: '人物', work: '篇目', ghost: '关联端点' };
const REL_COLOR  = { source: 0x4a90d9, develop: 0x3eb56b, debate: 0xd95a4a };
const REL_NAME   = { source: '来源', develop: '发展', debate: '争论' };
const REL_TYPES  = ['source', 'develop', 'debate'];

let DATA = null;
const nodeMap = new Map();   // 概念名 -> 节点对象
const workMap = new Map();   // 篇目名 -> 篇目对象
const meshByName = new Map();// 场景mesh by name
const degMap = new Map();    // 概念名 -> 连接度（星等降噪用）

// 筛选状态
const state = {
  relOn: { source: true, develop: true, debate: true },
  vol: null,                 // 卷别筛选，null=全部
};

// ================= 场景 =================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('gl').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.bgColor);
scene.fog = new THREE.FogExp2(CONFIG.bgColor, 0.0015);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 1, 4000);
camera.position.set(CONFIG.camera.x, CONFIG.camera.y, CONFIG.camera.z);

// 开场镜头缓入（远→近，减速推入，模拟沉浸开场）
const intro = {
  active: true, t: 0, dur: 3.0,
  from: new THREE.Vector3(CONFIG.camera.x * 2.3, CONFIG.camera.y * 2.3, CONFIG.camera.z * 2.3),
  to:   new THREE.Vector3(CONFIG.camera.x, CONFIG.camera.y, CONFIG.camera.z),
};

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = CONFIG.autoRotate;
controls.autoRotateSpeed = CONFIG.autoSpeed;
controls.minDistance = 30;
controls.maxDistance = 1600;
renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; updateRotBtn(); });

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold));

// ================= 星空背景（对数螺旋星系 + 外围尘埃） =================
(function buildStars() {
  // 螺旋臂粒子：3 臂对数螺旋 + 盘面厚度（中心薄外缘厚）
  const ARM = 3, N = 3600;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const arm = i % ARM;
    const r = 620 + t * 1650;                       // 半径随 t 增大
    const theta = arm * (2 * Math.PI / ARM) + t * 4.2 + (Math.random() - 0.5) * 0.55;
    const spread = 90 + t * 300;                    // 臂外扩散随半径增大
    const rr = r + (Math.random() - 0.5) * spread;
    const x = rr * Math.cos(theta);
    const z = rr * Math.sin(theta);
    const y = (Math.random() - 0.5) * (46 + t * 210);  // 盘厚
    pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x7a8fc0, size: 1.4, sizeAttenuation: true, transparent: true,
    opacity: 0.5, fog: false })));

  // 外围尘埃球壳（稀疏远景）
  const M = 1400, p2 = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) {
    const r = 1800 + Math.random() * 2200;
    const t2 = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    p2[i*3] = r * Math.sin(ph) * Math.cos(t2);
    p2[i*3+1] = r * Math.sin(ph) * Math.sin(t2);
    p2[i*3+2] = r * Math.cos(ph);
  }
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(p2, 3));
  scene.add(new THREE.Points(g2, new THREE.PointsMaterial({
    color: 0x556a9a, size: 1.1, sizeAttenuation: true, transparent: true,
    opacity: 0.35, fog: false })));
})();

scene.add(new THREE.AmbientLight(0x9fb0d8, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(400, 600, 300);
scene.add(sun);

// ================= 节点（概念 + 篇目） =================
const conceptMeshes = [], workMeshes = [];
const sphereGeo = new THREE.SphereGeometry(1, 16, 16);

const MAO_NAME = '毛泽东';
const REF_COLOR = 0x9aa7c0;  // 被引文献灰蓝

// Canvas 纹理工具
function makeHaloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,224,150,0.95)');
  g.addColorStop(0.35, 'rgba(255,196,100,0.42)');
  g.addColorStop(1, 'rgba(255,180,70,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
// 通用白色光晕纹理（用 SpriteMaterial.color 染色，亮核→暗晕衰减）
let softHaloTex = null;
function makeSoftHaloTexture() {
  if (softHaloTex) return softHaloTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.30)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  softHaloTex = new THREE.CanvasTexture(c);
  return softHaloTex;
}
function addHalo(mesh, color, scale, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSoftHaloTexture(), color, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, opacity }));
  s.position.copy(mesh.position);
  s.scale.setScalar(scale);
  s.renderOrder = 1;
  scene.add(s);
  mesh.userData.halo = s;
  return s;
}
function makeLabelTexture(text, color = '#fff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 72px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,12,22,0.95)'; ctx.lineWidth = 8;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 80);
  ctx.strokeText(text, 256, 80);
  // 第二层阴影让字更通透
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10;
  return new THREE.CanvasTexture(c);
}

function makeConceptMesh(nd) {
  const isMao = nd.n === MAO_NAME;
  const isRef = nd.t === 'work' && !workMap.has(nd.n);  // 被引外部文献
  const isExt = isRef || nd.t === 'ghost';              // 外部节点（被引+无端点，合并处理）
  const isLeaf = !isMao && !isExt && (degMap.get(nd.n) || 0) <= CONFIG.leafDegree; // 星等降噪
  let color = TYPE_COLOR[nd.t] || 0x8899bb;
  let scale = nd.s;
  if (isMao) { color = 0xffd24d; scale = nd.s * 1.8; }        // 中心恒星：金色+放大
  else if (isExt) { color = REF_COLOR; scale = nd.s * 0.8; }  // 外部节点：灰蓝+缩小
  else if (isLeaf) { scale = nd.s * CONFIG.leafSizeFactor; }  // 叶子概念：缩小
  const mat = new THREE.MeshPhongMaterial({
    color, transparent: isExt || isLeaf,
    opacity: isExt ? 0.9 : (isLeaf ? CONFIG.leafOpacity : 1),
    emissive: new THREE.Color(color).multiplyScalar(isMao ? 0.75 : 0.45),
    emissiveIntensity: isMao ? 0.5 : (isLeaf ? 0.2 : 0.28), shininess: isMao ? 110 : 60 });
  const m = new THREE.Mesh(sphereGeo, mat);
  m.position.set(...nd.p);
  m.scale.setScalar(scale);
  m.userData = { kind: 'concept', nd, isMao, isRef, isExt, baseScale: scale };
  conceptMeshes.push(m);
  meshByName.set(nd.n, m);
  scene.add(m);

  // 非叶子概念：叠加染色光晕贴片（叶子/外部节点不加，避免回糊）
  if (!isMao && !isExt && !isLeaf) {
    addHalo(m, color, scale * CONFIG.haloSizeFactor, CONFIG.haloOpacity);
  }

  // 毛泽东：光晕 + 常显标签
  if (isMao) {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeHaloTexture(), blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, opacity: 0.85 }));
    halo.position.copy(m.position);
    halo.scale.setScalar(scale * 4.8);
    halo.renderOrder = 2;
    scene.add(halo);
    m.userData.halo = halo;

    const lbl = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeLabelTexture('毛泽东', '#ffe9a8'), transparent: true, depthWrite: false }));
    lbl.position.set(m.position.x, m.position.y + scale * 3.2, m.position.z);
    lbl.scale.set(42, 13, 1);
    lbl.renderOrder = 3;
    scene.add(lbl);
    m.userData.label = lbl;
  }
}

function makeWorkMesh(w) {
  const maxCnt = Math.max(...DATA.works.map(x => x.cnt), 1);
  const r = CONFIG.workBase + (w.cnt / maxCnt) * (CONFIG.workMax - CONFIG.workBase);
  const col = DATA.vols[w.vol] || 0xaab6d6;
  const mat = new THREE.MeshPhongMaterial({
    color: new THREE.Color(col), transparent: true, opacity: CONFIG.workOpacity,
    emissive: new THREE.Color(col).multiplyScalar(0.55), emissiveIntensity: 0.5, shininess: 90 });
  const m = new THREE.Mesh(sphereGeo, mat);
  m.position.set(...w.p);
  m.scale.setScalar(r);
  m.userData = { kind: 'work', w, baseScale: r };
  workMeshes.push(m);
  meshByName.set(w.n, m);
  scene.add(m);
  // 篇目星：光晕稍弱，突出"诗人星"层次
  addHalo(m, col, r * CONFIG.haloSizeFactor, CONFIG.haloOpacity * 0.8);
}

// ================= 弧线 + 流动粒子 =================
const edges = [];        // 每条边渲染信息
const flowAttrs = { source: [], develop: [], debate: [] };

function arcControl(A, B, po) {
  const M = A.clone().add(B).multiplyScalar(0.5);
  const C = M.clone().addScaledVector(M.clone().normalize(), -CONFIG.arcBundle * M.length());
  const ab = B.clone().sub(A);
  const perp = new THREE.Vector3().crossVectors(ab, M);
  if (perp.lengthSq() < 1e-8) perp.set(0, 1, 0); else perp.normalize();
  C.addScaledVector(perp, ab.length() * CONFIG.arcBend);
  // 平行边横向偏移
  if (po > 0) {
    const off = perp.clone().multiplyScalar(po * CONFIG.parallelGap);
    C.add(off);
  }
  return C;
}

function makeArc(lk) {
  const A = new THREE.Vector3(...(nodeMap.get(lk.s)?.p || [0,0,0]));
  const B = new THREE.Vector3(...(nodeMap.get(lk.t)?.p || [0,0,0]));
  if (A.distanceToSquared(B) < 4) return null;
  const C = arcControl(A, B, lk.po || 0);
  const col = REL_COLOR[lk.ty] || 0x666;

  // 静态弧线（顶点色随 t 头尾渐隐，加色混合让暗端自然消失）
  const SEG = 24, pts = [], cols = [];
  const lc = new THREE.Color(col);
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG, u = 1 - t;
    pts.push(new THREE.Vector3(
      u*u*A.x + 2*u*t*C.x + t*t*B.x,
      u*u*A.y + 2*u*t*C.y + t*t*B.y,
      u*u*A.z + 2*u*t*C.z + t*t*B.z));
    const fade = CONFIG.arcFadeMin + (1 - CONFIG.arcFadeMin) * Math.pow(Math.sin(Math.PI * t), CONFIG.arcFadeExp);
    cols.push(lc.r * fade, lc.g * fade, lc.b * fade);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  let mat;
  if (lk.ty === 'debate') {
    mat = new THREE.LineDashedMaterial({ vertexColors: true, transparent: true, opacity: CONFIG.arcBackboneOp,
      dashSize: 3.2, gapSize: 2.6, depthWrite: false, blending: THREE.AdditiveBlending });
    // LineDashedMaterial 需要 computeLineDistances
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
  } else {
    mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: CONFIG.arcBackboneOp,
      depthWrite: false, blending: THREE.AdditiveBlending });
  }
  const line = new THREE.Line(geo, mat);
  line.visible = lk.bb;   // 骨干默认显示，叶子隐藏
  line.userData = { lk, focusOp: CONFIG.arcFocusOp, baseOp: CONFIG.arcBackboneOp };
  scene.add(line);
  edges.push(line);

  // 流动粒子（debate 双向：一半反方向）
  const cc = new THREE.Color(col);
  const n = CONFIG.flowPerLink;
  for (let k = 0; k < n; k++) {
    const rev = (lk.ty === 'debate' && k >= n / 2) ? -1 : 1;
    flowAttrs[lk.ty].push({
      a: A.clone(), c: C.clone(), b: B.clone(),
      cr: cc.r, cg: cc.g, cb: cc.b,
      speed: CONFIG.flowSpeed * (0.7 + Math.random() * 0.6),
      offset: (k / n) + Math.random() * 0.03,
      rev,
    });
  }
  return line;
}

// 三个粒子系统（按关系类型分组，便于开关）
const flowPoints = {};
for (const ty of REL_TYPES) {
  const attrs = flowAttrs[ty];
  const N = attrs.length;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: CONFIG.flowSize, vertexColors: true, transparent: true, opacity: 0.85,
    sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  flowPoints[ty] = { pts, attrs, pos, col };
}

function flowTick(t) {
  for (const ty of REL_TYPES) {
    const { pts, attrs, pos, col } = flowPoints[ty];
    const N = attrs.length;
    for (let i = 0; i < N; i++) {
      const f = attrs[i];
      let u = (t * f.speed + f.offset) % 1;
      if (f.rev < 0) u = 1 - u;
      const u2 = u*u, uu = u*(1-u), v2 = (1-u)*(1-u);
      pos[i*3]   = v2*f.a.x + 2*uu*f.c.x + u2*f.b.x;
      pos[i*3+1] = v2*f.a.y + 2*uu*f.c.y + u2*f.b.y;
      pos[i*3+2] = v2*f.a.z + 2*uu*f.c.z + u2*f.b.z;
      const bright = Math.pow(u, 3) * 1.7 + 0.15;
      col[i*3] = f.cr*bright; col[i*3+1] = f.cg*bright; col[i*3+2] = f.cb*bright;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    pts.geometry.attributes.color.needsUpdate = true;
  }
}

// ================= 数据加载与初始化 =================
async function loadData() {
  if (window.__GALAXY_DATA__) { DATA = window.__GALAXY_DATA__; return; }
  const r = await fetch('data/galaxy_data.json');
  DATA = await r.json();
}

function init() {
  // 先统计连接度（星等降噪），再建篇目星（workMap 供 isRef 判断），再建概念节点
  DATA.links.forEach(lk => {
    degMap.set(lk.s, (degMap.get(lk.s) || 0) + 1);
    degMap.set(lk.t, (degMap.get(lk.t) || 0) + 1);
  });
  DATA.works.forEach(w => { workMap.set(w.n, w); makeWorkMesh(w); });
  DATA.nodes.forEach(nd => { nodeMap.set(nd.n, nd); makeConceptMesh(nd); });
  DATA.links.forEach(lk => makeArc(lk));

  // 卷别图例动态生成
  buildVolLegend();
  document.getElementById('stat').textContent =
    `${DATA.nodes.length} 概念 · ${DATA.works.length} 篇目 · ${DATA.links.length} 关系`;

  // 更新边可见性（初始：骨干显示，叶子隐藏）
  updateVisibility();
  animate();

  // 调试/验证句柄（供自动化测试）
  window.__dbg = {
    conceptMeshes, workMeshes, edges,
    flowN: { source: flowAttrs.source.length, develop: flowAttrs.develop.length, debate: flowAttrs.debate.length },
    mao: meshByName.get(MAO_NAME) || null,
    refCount: conceptMeshes.filter(m => m.userData.isRef).length,
    ui: { showConceptPanel, showWorkPanel, nodeMap, workMap },  // UI 截图验证钩子
  };
}

// ================= 可见性管理（卷别筛选 + 类型开关 + 焦点高亮） =================
let focusName = null;

function nodeVisible(vol) {
  return state.vol === null || vol === state.vol;
}

function updateVisibility() {
  // 节点/篇目（中心恒星与跨卷枢纽恒显），光晕随主体同步显隐
  conceptMeshes.forEach(m => {
    const nd = m.userData.nd;
    const v = m.userData.isMao || nodeVisible(nd.vol) || (nd.vol == null && !m.userData.isExt);
    m.visible = v;
    if (m.userData.halo) m.userData.halo.visible = v;
  });
  workMeshes.forEach(m => {
    const v = nodeVisible(m.userData.w.vol);
    m.visible = v;
    if (m.userData.halo) m.userData.halo.visible = v;
  });
  // 边 + 粒子
  edges.forEach(ln => {
    const { lk } = ln.userData;
    const relOn = state.relOn[lk.ty];
    const volOn = nodeVisible(nodeMap.get(lk.s)?.vol) && nodeVisible(nodeMap.get(lk.t)?.vol);
    const isFocus = focusName && (lk.s === focusName || lk.t === focusName);
    ln.visible = relOn && volOn && (lk.bb || isFocus);
    if (ln.visible) {
      ln.material.opacity = isFocus ? ln.userData.focusOp : ln.userData.baseOp;
      ln.material.transparent = true;
    }
  });
  for (const ty of REL_TYPES) {
    flowPoints[ty].pts.visible = state.relOn[ty];
  }
}

// 焦点变化（hover/点击）时刷新边
function setFocus(name) {
  if (name === focusName) return;
  focusName = name;
  updateVisibility();
}

// ================= 交互 =================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;
const enlarged = new Set();   // hover 平滑缩放动画池

function onMove(e) {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
}
renderer.domElement.addEventListener('pointermove', onMove);

function pickMesh() {
  raycaster.setFromCamera(pointer, camera);
  const targets = workMeshes.length ? workMeshes.concat(conceptMeshes) : conceptMeshes;
  const hits = raycaster.intersectObjects(targets, false);
  return hits.length ? hits[0].object : null;
}

const tipEl = document.getElementById('tip');

renderer.domElement.addEventListener('pointermove', () => {
  const obj = pickMesh();
  if (obj !== hovered) {
    resetHover();
    if (obj) {
      hovered = obj;
      enlarged.add(obj);              // 平滑放大（animate 中 lerp，不再瞬时跳变）
      const { kind } = obj.userData;
      if (kind === 'work') obj.material.opacity = 1;
      setFocus(kind === 'work' ? obj.userData.w.n : obj.userData.nd.n);
      showTip(obj);
    } else {
      setFocus(null);
    }
  }
});

renderer.domElement.addEventListener('click', () => {
  const obj = pickMesh();
  if (obj) {
    const { kind } = obj.userData;
    if (kind === 'work') showWorkPanel(obj.userData.w);
    else showConceptPanel(obj.userData.nd);
    setFocus(kind === 'work' ? obj.userData.w.n : obj.userData.nd.n);
  }
});

renderer.domElement.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    pointer.x = (t.clientX / innerWidth) * 2 - 1;
    pointer.y = -(t.clientY / innerHeight) * 2 + 1;
  }
}, { passive: true });

function resetHover() {
  if (!hovered) return;
  // 缩放交由 animate 中的 lerp 平滑回落，此处只恢复透明度
  if (hovered.userData.kind === 'work') hovered.material.opacity = CONFIG.workOpacity;
  hovered = null;
  tipEl.style.display = 'none';
}

function showTip(obj) {
  const { kind } = obj.userData;
  if (kind === 'work') {
    const w = obj.userData.w;
    const col = '#' + new THREE.Color(DATA.vols[w.vol] || 0xaab6d6).getHexString();
    tipEl.innerHTML = `<b style="color:${col}">${w.n}</b><br><span style="color:#9fb0d8">篇目 · ${w.vol} · ${w.cnt} 概念 · 点击查看</span>`;
  } else {
    const nd = obj.userData.nd;
    const col = '#' + new THREE.Color(TYPE_COLOR[nd.t] || 0x8899bb).getHexString();
    if (obj.userData.isExt) {
      tipEl.innerHTML = `<b style="color:#aab6d6">${nd.n}</b><br><span style="color:#9fb0d8">外部节点${nd.src ? ` · 见「${nd.src}」` : ''} · 点击查看</span>`;
    } else if (obj.userData.isMao) {
      tipEl.innerHTML = `<b style="color:#ffd24d">毛泽东</b><br><span style="color:#9fb0d8">全书唯一作者 · ${linksOf(nd.n).length} 条连接 · 点击查看</span>`;
    } else {
      tipEl.innerHTML = `<b style="color:${col}">${nd.n}</b><br><span style="color:#9fb0d8">${TYPE_NAME[nd.t]||''} · ${linksOf(nd.n).length} 连接 · 点击查看</span>`;
    }
  }
  moveTip();
}

function moveTip() {
  const v = new THREE.Vector3();
  if (hovered) hovered.getWorldPosition(v);
  v.project(camera);
  tipEl.style.display = 'block';
  tipEl.style.left = (v.x * 0.5 + 0.5) * innerWidth + 14 + 'px';
  tipEl.style.top  = (-v.y * 0.5 + 0.5) * innerHeight + 'px';
}

// ================= 面板 =================
const panelEl = document.getElementById('panel');
let tipLock = false;

function linksOf(name) {
  return DATA.links.filter(r => r.s === name || r.t === name);
}
function relHex(ty) { return '#' + new THREE.Color(REL_COLOR[ty] || 0x666).getHexString(); }

function showConceptPanel(nd) {
  tipLock = true;
  document.getElementById('pName').textContent = nd.n;
  const isMao = nd.n === MAO_NAME;
  const isExt = (nd.t === 'work' && !workMap.has(nd.n)) || nd.t === 'ghost';
  document.getElementById('pType').textContent = isMao ? '全书唯一作者' : (isExt ? '外部节点' : (TYPE_NAME[nd.t] || nd.t));
  document.getElementById('pDeg').textContent = `${linksOf(nd.n).length} 连接`;
  document.getElementById('pDesc').textContent = isMao
    ? `这个知识宇宙的 ${DATA.nodes.length} 个概念、${DATA.links.length} 条关系，全部出自毛泽东一人之手。作为连接中枢，他的思想辐射到军事、党建、经济、哲学各星团。`
    : (nd.d || '');
  document.getElementById('pCnt').innerHTML =
    (nd.anch ? `出处：<b>${nd.anch}</b>` : '') +
    (nd.src ? `<span style="color:#6b7ba0"> · 主篇目：${nd.src}</span>` : '');
  const rels = linksOf(nd.n);
  let h = '';
  rels.forEach(r => {
    const other = r.s === nd.n ? r.t : r.s;
    const dir = r.s === nd.n ? '→' : '←';
    const ev = r.ev || '';
    h += `<div class="rel" data-other="${other}" style="border-left-color:${relHex(r.ty)}">
      <div class="head"><span class="ty" style="background:${relHex(r.ty)}">${REL_NAME[r.ty]||r.ty}</span>
      <span class="pair">${r.s} ${dir} ${r.t}</span></div>
      <div class="ev"><b>依据：</b>${ev}</div></div>`;
  });
  document.getElementById('pRels').innerHTML = h || '<div class="rel">无直接关系</div>';
  bindRelJump();
  panelEl.style.display = 'block';
}

function showWorkPanel(w) {
  tipLock = true;
  document.getElementById('pName').textContent = w.n;
  document.getElementById('pType').textContent = `${w.vol} · 篇目`;
  document.getElementById('pDeg').textContent = `${w.cnt} 块`;
  document.getElementById('pDesc').textContent = w.desc || '';
  const inWorks = DATA.nodes.filter(nd => nd.src === w.n).slice(0, 30);
  document.getElementById('pCnt').textContent = `篇内概念（${inWorks.length} 个，最多显示 30）`;
  let h = '';
  inWorks.forEach(nd => {
    h += `<div class="rel" data-other="${nd.n}">
      <div class="head"><span class="ty" style="background:#aab6d6">概念</span>
      <span class="pair">${nd.n} · ${linksOf(nd.n).length} 连接</span></div></div>`;
  });
  document.getElementById('pRels').innerHTML = h || '<div class="rel">该篇暂无归属概念</div>';
  bindRelJump();
  panelEl.style.display = 'block';
}

function bindRelJump() {
  document.querySelectorAll('#pRels .rel').forEach(el => {
    el.addEventListener('click', () => {
      const other = el.dataset.other;
      if (!other) return;
      const nd = nodeMap.get(other), w = workMap.get(other);
      if (nd) { showConceptPanel(nd); flyTo(other); }
      else if (w) { showWorkPanel(w); flyTo(other); }
    });
  });
}

document.getElementById('close').addEventListener('click', () => {
  panelEl.style.display = 'none';
  tipLock = false;
});

// ================= 卷别图例（动态） =================
function buildVolLegend() {
  const legend = document.getElementById('legend');
  const volDiv = document.createElement('div');
  volDiv.style.marginTop = '9px';
  volDiv.style.marginBottom = '6px';
  volDiv.className = 'g';
  volDiv.textContent = '卷别（点击筛选）';
  legend.appendChild(volDiv);
  const all = document.createElement('div');
  all.className = 'it vol sel';
  all.dataset.vol = '';
  all.innerHTML = `<span class="dot" style="background:#fff;color:#fff"></span><span class="lbl">全部卷</span>`;
  all.addEventListener('click', () => onVolClick('', all));
  legend.appendChild(all);
  for (const [vol, col] of Object.entries(DATA.vols)) {
    const el = document.createElement('div');
    el.className = 'it vol';
    el.dataset.vol = vol;
    el.innerHTML = `<span class="dot" style="background:${col};color:${col}"></span><span class="lbl">${vol}</span>`;
    el.addEventListener('click', () => onVolClick(vol, el));
    legend.appendChild(el);
  }
}

function onVolClick(vol, el) {
  state.vol = vol || null;
  document.querySelectorAll('#legend .it.vol').forEach(x => x.classList.remove('sel'));
  if (el) el.classList.add('sel');
  updateVisibility();
}

// ================= 关系类型图例 =================
document.querySelectorAll('#legend .it[data-ty]').forEach(el => {
  el.addEventListener('click', () => {
    const ty = el.dataset.ty;
    state.relOn[ty] = !state.relOn[ty];
    el.classList.toggle('off', !state.relOn[ty]);
    updateVisibility();
  });
});

// ================= 搜索 + 飞行 =================
const flight = { active: false, from: new THREE.Vector3(), to: new THREE.Vector3(),
  lookFrom: new THREE.Vector3(), lookTo: new THREE.Vector3(), t: 0 };

function flyTo(name) {
  const obj = meshByName.get(name);
  if (!obj) return;
  const p = obj.position.clone();
  const dir = camera.position.clone().sub(controls.target).normalize();
  flight.active = true; flight.t = 0;
  flight.from.copy(camera.position);
  flight.lookFrom.copy(controls.target);
  flight.to.copy(p.clone().addScaledVector(dir, obj.scale.x * 18 + 50));
  flight.lookTo.copy(p);
}

document.getElementById('s').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (!q) return;
  const nd = DATA.nodes.find(x => x.n.includes(q));
  const wk = nd ? null : DATA.works.find(x => x.n.includes(q));
  const hit = nd || wk;
  if (hit) {
    flyTo(hit.n);
    const obj = meshByName.get(hit.n);
    if (obj && obj.userData.kind === 'work') showWorkPanel(obj.userData.w);
    else showConceptPanel(nodeMap.get(hit.n));
    setFocus(hit.n);
  } else {
    tipEl.innerHTML = `<span style="color:#ff9a8a">未找到「${q}」</span>`;
    tipEl.style.display = 'block';
    tipEl.style.left = innerWidth / 2 + 'px';
    tipEl.style.top = innerHeight / 2 + 'px';
    setTimeout(() => tipEl.style.display = 'none', 1600);
  }
});

// 按钮
document.getElementById('bRotate').addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  updateRotBtn();
});
document.getElementById('bReset').addEventListener('click', () => {
  controls.autoRotate = CONFIG.autoRotate; updateRotBtn();
  camera.position.set(CONFIG.camera.x, CONFIG.camera.y, CONFIG.camera.z);
  controls.target.set(0, 0, 0);
});
function updateRotBtn() {
  document.getElementById('bRotate').textContent = controls.autoRotate ? '旋转：开' : '旋转：关';
}

// ================= 动画 =================
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  elapsed += dt;

  // 开场缓入（flight 触发时立即让位）
  if (intro.active && !flight.active) {
    intro.t += dt;
    const k = Math.min(intro.t / intro.dur, 1);
    const e = 1 - Math.pow(1 - k, 4);   // easeOutQuart 减速
    camera.position.lerpVectors(intro.from, intro.to, e);
    if (k >= 1) intro.active = false;
  }

  if (flight.active) {
    flight.t += dt * 1.4;
    const k = Math.min(flight.t, 1);
    const e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(flight.from, flight.to, e);
    controls.target.lerpVectors(flight.lookFrom, flight.lookTo, e);
    if (k >= 1) flight.active = false;
  }

  controls.update();

  // hover 缩放平滑过渡（1.18×，lerp 趋近；离场回落后移出动画池）
  enlarged.forEach(m => {
    const base = m.userData.baseScale ?? m.scale.x;
    const target = (m === hovered) ? base * 1.18 : base;
    m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x, target, 0.18));
    if (m !== hovered && Math.abs(m.scale.x - base) < base * 0.01) {
      m.scale.setScalar(base);
      enlarged.delete(m);
    }
  });

  flowTick(elapsed);
  composer.render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// 启动
loadData().then(init).catch(e => {
  console.error(e);
  document.getElementById('stat').textContent = '数据加载失败：' + e.message;
});
