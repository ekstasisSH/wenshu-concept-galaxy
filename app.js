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
  bloom:        { strength: 0.5, radius: 0.7, threshold: 0.80 },
  pointBright:  1.9,          // 点精灵亮度增益（加色混合下）
  starCount:    3200,
  conceptBase:  1.1,          // 概念最小半径
  conceptMax:   5.5,
  leafDegree:   2,            // 星等降噪：连接度≤此值视为叶子概念
  leafSizeFactor: 0.6,        // 叶子概念半径系数
  leafOpacity:  0.7,          // 叶子概念透明度
  haloSizeFactor: 3.0,        // 节点光晕相对半径倍数
  haloOpacity:  0.45,         // 节点光晕透明度
  workBase:     6.0,          // 篇目星半径
  workMax:      12.0,
  workColor:    0xd8e0ee,     // 篇目星统一暖银白（卷别靠环+明度微差，避免与关系色撞车）
  conceptColor: 0xe8edf5,     // 概念点统一星尘白
  // [F] 恒星点精灵化：亮核 aSize/亮度 + 光晕/标签参数（替代原 starScaleFactor 实体球缩放）
  starPointSize: 62,          // 恒星亮核 aSize（世界直径语义，高斯衰减后视觉≈40px@900p）
  starBright:    2.2,         // 恒星 uBright（>概念1.9 >篇目1.6，"太阳=最亮光源"）
  starHaloScale: 80,          // 恒星 halo sprite 世界 scale（原 scale×4.8≈83.3）
  starHaloOpacity: 0.85,      // 恒星 halo 透明度（原值）
  starPickR:     22,          // 恒星拾取代理球半径（hover 放大目标 baseScale）
  starLabelY:    56,          // 恒星标签 Y 偏移（原 scale×3.2≈55.6）
  workOpacity:  0.75,
  arcBend:      0.24,         // 弧线垂直拱起系数
  arcBundle:    0.5,          // 控制点向中心收缩
  relStyle: {                 // 关系强度：色相不再编码类型（连线=星体色），改亮度+粒子密度
    source: { op: 0.55, flow: 12, size: 1.4 },   // 来源：最亮最显
    develop: { op: 0.40, flow: 9,  size: 1.3 },  // 发展：中等
    debate:  { op: 0.25, flow: 6,  size: 1.2 },  // 争论：最暗最隐（双向粒子保留）
  },
  arcFocusOp:   0.9,          // 聚焦边透明度
  arcFadeExp:   0.7,          // 弧线头尾渐变指数（越大衰减越窄）
  arcFadeMin:   0.10,         // 弧线端点最低亮度保留
  flowSpeed:    0.055,
  parallelGap:  8.0,          // 平行边偏移间距
  topLabelCount: 12,          // Top N 概念常显锚点标签
  alpha:        0.45,         // 概念混合布局权重（与数据生成一致）
};

// ================= 类型/关系/卷配色 =================
const TYPE_COLOR = { concept: 0x7fb0ff, theory: 0xc97bd8, scholar: 0x5ad1a0, work: 0xe8b870, ghost: 0x8899bb };
const TYPE_NAME  = { concept: '概念', theory: '理论', scholar: '人物', work: '篇目', ghost: '关联端点' };
const REL_COLOR  = { source: 0x4a90d9, develop: 0x3eb56b, debate: 0xd95a4a };
const REL_NAME   = { source: '来源', develop: '发展', debate: '争论' };
const REL_TYPES  = ['source', 'develop', 'debate'];

// 卷别明度微差：统一色相家族内卷一最亮 → 卷四最暗（卷别主要靠环位置区分，颜色不再编码卷）
const VOL_ORDER = ['第一卷', '第二卷', '第三卷', '第四卷'];
function volumeTone(baseColor, vol) {
  const c = new THREE.Color(baseColor);
  const idx = vol ? VOL_ORDER.indexOf(vol) : -1;
  if (idx >= 0) c.multiplyScalar(1.05 - idx * 0.035);
  return c;
}

// 领域配色（历史决议七大领域：六大组成部分 + 活的灵魂）——星体与连线同色，表达"星团社群"
const FIELD_COLOR = {
  '一.新民主主义革命':         0xe8685a,   // 革命红
  '二.社会主义革命和建设':     0xf0a868,   // 建设橙
  '三.革命军队和军事战略':     0x5aa878,   // 军绿
  '四.政策和策略':             0x5ab8b8,   // 策略青（避开恒星金）
  '五.思想政治工作和文化工作': 0xb090d8,   // 文化紫
  '六.党的建设':               0xd07088,   // 党建玫粉
  '七.活的灵魂':               0x8fc9ff,   // 灵魂亮蓝
  'cross':                     0xf2ead8,   // 跨领域枢纽（暖白=贯穿意象）
};
const FIELD_GRAY = 0x9aa7c0;   // 未归类（附录/外部）
function fieldColor(f) { return FIELD_COLOR[f] || FIELD_GRAY; }

let DATA = null;
const nodeMap = new Map();   // 概念名 -> 节点对象
const workMap = new Map();   // 篇目名 -> 篇目对象
const meshByName = new Map();// 场景mesh by name
const degMap = new Map();    // 概念名 -> 连接度（星等降噪用）

// 筛选状态（关系/领域/卷别均为多选集合，默认全选）
const state = {
  relOn: { source: true, develop: true, debate: true },
  volOn: {},      // 卷别多选：{卷: true}，缺失视为选中
  fieldOn: {},    // 领域多选：{领域: true, '': true}（''=未归类）
};
VOL_ORDER.forEach(v => { state.volOn[v] = true; });
for (const f of Object.keys(FIELD_COLOR)) state.fieldOn[f] = true;
state.fieldOn[''] = true;

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

// ================= 星空背景（退化氛围层：暖核→冷臂，与前景盘面错开） =================
(function buildStars() {
  const warm = new THREE.Color(0xc8b394), cool = new THREE.Color(0x5a6c9a);
  // 螺旋臂粒子：3 臂对数螺旋 + 盘面厚度（密度减半，亮度压低）
  const ARM = 3, N = 1900;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const arm = i % ARM;
    const r = 620 + t * 1650;
    const theta = arm * (2 * Math.PI / ARM) + t * 4.2 + (Math.random() - 0.5) * 0.55;
    const spread = 90 + t * 300;
    const rr = r + (Math.random() - 0.5) * spread;
    pos[i*3] = rr * Math.cos(theta);
    pos[i*3+1] = (Math.random() - 0.5) * (46 + t * 210);
    pos[i*3+2] = rr * Math.sin(theta);
    const c = warm.clone().lerp(cool, Math.min(1, t * 1.15));  // 暖核→冷臂
    col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const armPts = new THREE.Points(g, new THREE.PointsMaterial({
    vertexColors: true, size: 1.3, sizeAttenuation: true, transparent: true,
    opacity: 0.32, fog: false }));
  armPts.rotation.x = 0.32; armPts.rotation.z = 0.12;   // 与前景盘面错开，避免穿帮
  scene.add(armPts);

  // 外围尘埃球壳（稀疏远景，减量降亮）
  const M = 750, p2 = new Float32Array(M * 3), c2 = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) {
    const r = 1800 + Math.random() * 2200;
    const t2 = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    p2[i*3] = r * Math.sin(ph) * Math.cos(t2);
    p2[i*3+1] = r * Math.sin(ph) * Math.sin(t2);
    p2[i*3+2] = r * Math.cos(ph);
    const c = Math.random() < 0.18 ? warm : cool;   // 少量暖点打破单色
    c2[i*3] = c.r; c2[i*3+1] = c.g; c2[i*3+2] = c.b;
  }
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(p2, 3));
  g2.setAttribute('color', new THREE.BufferAttribute(c2, 3));
  scene.add(new THREE.Points(g2, new THREE.PointsMaterial({
    vertexColors: true, size: 1.0, sizeAttenuation: true, transparent: true,
    opacity: 0.22, fog: false })));
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

// ---------- Top12 概念常显锚点标签（连接度最高，排除毛泽东——恒星已有标签） ----------
const topLabels = [];
function buildTopLabels() {
  const list = DATA.nodes
    .filter(nd => nd.n !== MAO_NAME)
    .sort((a, b) => (degMap.get(b.n) || 0) - (degMap.get(a.n) || 0))
    .slice(0, CONFIG.topLabelCount);
  list.forEach(nd => {
    const vc = (nd.vol && DATA.vols[nd.vol]) ? DATA.vols[nd.vol] : 0xe8d9b0;
    const lbl = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeLabelTexture(nd.n, '#e9edf5'), transparent: true, depthWrite: false }));
    const size = Math.max(nd.s, 2);
    lbl.position.set(nd.p[0], nd.p[1] + size * 2.8, nd.p[2]);
    lbl.scale.set(Math.max(nd.n.length * 3.4, 14), 5.4, 1);
    lbl.renderOrder = 3;
    lbl.userData = { name: nd.n };
    scene.add(lbl);
    topLabels.push(lbl);
  });
}

// ---------- 概念节点：视觉=点精灵云（星云质感），交互=隐形代理球（拾取/面板/飞行零改动） ----------
const pt = { nodes: [], baseSize: null, baseColor: null, idxByName: new Map(), hoverCur: -1, hoverPrev: -1 };
let conceptPoints = null;
let pickProxyMat = null;
// [A1/A2] workPoints + ring 工作区变量
let workPoints = null;
let workRingGroup = null;
const workHaloSprites = [];     // 137 个二级 halo sprite（更新显隐）
let workBaseSize = null;        // 137 项基础像素尺寸（卷筛选时置 0）
// [F] 中心恒星：视觉=点精灵亮核（Points），交互=不可见金色代理球；亮核 hover 放大走 aSize lerp
let starPoints = null;
let starBaseSize = 0;

function conceptNodeColor(nd, isExt, isLeaf) {
  if (isExt) return new THREE.Color(REF_COLOR).multiplyScalar(0.7);
  const c = new THREE.Color(fieldColor(nd.f));          // 领域色（星团内与篇目星同色系）
  c.lerp(new THREE.Color(0xffffff), 0.35);             // 降饱和提亮（星尘感）
  if (nd.t === 'theory') c.multiplyScalar(1.15);       // 类型靠明度分层，不加色相
  else if (nd.t === 'scholar') c.multiplyScalar(0.9);
  if (isLeaf) c.multiplyScalar(CONFIG.leafOpacity * 0.9); // 叶子降噪=降亮（加色混合）
  return c;
}

// 隐形拾取代理（不进渲染流：visible=false；raycast 不检查 visible，仍可命中）
function makePickProxy(nd) {
  const isRef = nd.t === 'work' && !workMap.has(nd.n);
  const isExt = isRef || nd.t === 'ghost';
  const pickR = Math.max(nd.s * 1.2, 2.4);
  pickProxyMat = pickProxyMat || new THREE.MeshBasicMaterial();
  const m = new THREE.Mesh(sphereGeo, pickProxyMat);
  m.position.set(...nd.p);
  m.scale.setScalar(pickR);
  m.visible = false;
  m.userData = { kind: 'concept', nd, isMao: false, isRef, isExt, baseScale: pickR, ptIndex: pt.idxByName.get(nd.n) };
  conceptMeshes.push(m);
  meshByName.set(nd.n, m);
  scene.add(m);
}

function buildConceptPoints() {
  const list = DATA.nodes.filter(nd => nd.n !== MAO_NAME);
  const n = list.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3),
        siz = new Float32Array(n), seed = new Float32Array(n);
  pt.baseSize = new Float32Array(n);
  list.forEach((nd, i) => {
    const isRef = nd.t === 'work' && !workMap.has(nd.n);
    const isExt = isRef || nd.t === 'ghost';
    const isLeaf = !isExt && (degMap.get(nd.n) || 0) <= CONFIG.leafDegree;
    pos[i*3] = nd.p[0]; pos[i*3+1] = nd.p[1]; pos[i*3+2] = nd.p[2];
    const c = conceptNodeColor(nd, isExt, isLeaf);
    col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
    let d = nd.s * 2;                                   // 世界直径
    if (isExt) d *= 0.8; else if (isLeaf) d *= CONFIG.leafSizeFactor;
    pt.baseSize[i] = d; siz[i] = d;
    seed[i] = (i * 0.6180339887) % 1;
    pt.nodes.push(nd);
    pt.idxByName.set(nd.n, i);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uBright: { value: CONFIG.pointBright } },
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aSize; attribute float aSeed;
      uniform float uTime; uniform float uScale;
      varying vec3 vColor; varying float vTw;
      void main() {
        if (aSize < 0.001) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; return; }
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uScale / -mv.z, 1.2, 72.0);
        vTw = 0.78 + 0.22 * sin(uTime * 0.7 + aSeed * 6.2831853);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uBright;
      varying vec3 vColor; varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor * uBright, a * vTw);
      }`,
  });
  conceptPoints = new THREE.Points(g, mat);
  conceptPoints.frustumCulled = false;
  scene.add(conceptPoints);
  updatePointScale();
}

function updatePointScale() {
  if (!conceptPoints) return;
  // 世界尺寸→像素：height/2 / tan(fov/2)（含 pixelRatio）
  const v = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  conceptPoints.material.uniforms.uScale.value = v;
  if (starPoints) starPoints.material.uniforms.uScale.value = v;   // [F] 恒星亮核同步
}

// 卷别筛选 → 点云显隐（aSize 置 0 即隐藏且不可拾取前置由代理 visible 逻辑配合）
function updateConceptPointVisibility() {
  if (!conceptPoints) return;
  const attr = conceptPoints.geometry.attributes.aSize;
  for (let i = 0; i < pt.nodes.length; i++) {
    const nd = pt.nodes[i];
    const vis = nodeVisible(nd.vol) && nodeFieldVisible(nd.f);
    attr.array[i] = vis ? pt.baseSize[i] : 0;
  }
  attr.needsUpdate = true;
}

// hover 点精灵平滑放大（与代理球 enlarged 动画并行）
function ptHoverTick() {
  if (!conceptPoints) return;
  const attr = conceptPoints.geometry.attributes.aSize;
  let dirty = false;
  if (pt.hoverPrev >= 0 && pt.hoverPrev !== pt.hoverCur) {
    const i = pt.hoverPrev, t = pt.baseSize[i];
    const nv = attr.array[i] + (t - attr.array[i]) * 0.2;
    attr.array[i] = nv; dirty = true;
    if (Math.abs(nv - t) < 0.05) { attr.array[i] = t; pt.hoverPrev = -1; }
  }
  if (pt.hoverCur >= 0) {
    const i = pt.hoverCur, t = pt.baseSize[i] * 1.6;
    if (attr.array[i] > 0) { attr.array[i] += (t - attr.array[i]) * 0.2; dirty = true; }
  }
  if (dirty) attr.needsUpdate = true;
}

// [F] 恒星亮核 hover 平滑放大（1.15×，lerp 趋近；与代理球 enlarged 动画并行，互不干扰）
function starHoverTick() {
  if (!starPoints) return;
  const attr = starPoints.geometry.attributes.aSize;
  const target = (hovered && hovered.userData.isMao) ? starBaseSize * 1.15 : starBaseSize;
  const v = attr.array[0];
  if (Math.abs(v - target) > 0.05) {
    attr.array[0] += (target - v) * 0.2;
    attr.needsUpdate = true;
  }
}

function makeCenterStar(nd) {   // [F] 中心恒星：点精灵亮核（金色，恒显）+ 光晕 + 常显标签；代理球承载拾取/hover/面板
  const color = 0xffd24d;
  const pos = new Float32Array(3), col = new Float32Array(3),
        siz = new Float32Array(1), seed = new Float32Array(1);
  new THREE.Color(color).toArray(col);
  starBaseSize = CONFIG.starPointSize;
  siz[0] = starBaseSize;
  seed[0] = 0.5;                                       // 相位固定（恒星=恒定光源，微闪烁 3%）
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor',  new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize',   new THREE.BufferAttribute(siz, 1));
  g.setAttribute('aSeed',   new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uBright: { value: CONFIG.starBright } },
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aSize; attribute float aSeed;
      uniform float uTime; uniform float uScale;
      varying vec3 vColor; varying float vTw;
      void main() {
        if (aSize < 0.001) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; return; }
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uScale / -mv.z, 3.0, 120.0);
        vTw = 0.97 + 0.03 * sin(uTime * 0.6 + aSeed * 6.2831853);   // 微闪烁：太阳稳定不眨
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uBright;
      varying vec3 vColor; varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor * uBright, a * vTw);
      }`,
  });
  starPoints = new THREE.Points(g, mat);
  starPoints.frustumCulled = false;
  starPoints.position.set(...nd.p);
  scene.add(starPoints);

  // 拾取代理球（不可见；raycast 不检查 visible，仍可命中——与 137 篇目星同机制）
  const pickR = CONFIG.starPickR;
  const m = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }));
  m.position.set(...nd.p);
  m.scale.setScalar(pickR);
  m.visible = false;
  m.userData = { kind: 'concept', nd, isMao: true, isRef: false, isExt: false, baseScale: pickR, ptIndex: -1 };
  conceptMeshes.push(m);
  meshByName.set(nd.n, m);
  scene.add(m);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeHaloTexture(), blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, opacity: CONFIG.starHaloOpacity }));
  halo.position.copy(m.position);
  halo.scale.setScalar(CONFIG.starHaloScale);
  halo.renderOrder = 2;
  scene.add(halo);
  m.userData.halo = halo;

  const lbl = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeLabelTexture('毛泽东', '#ffe9a8'), transparent: true, depthWrite: false }));
  lbl.position.set(m.position.x, m.position.y + CONFIG.starLabelY, m.position.z);
  lbl.scale.set(42, 13, 1);
  lbl.renderOrder = 3;
  scene.add(lbl);
  m.userData.label = lbl;
}

function makeWorkMesh(w) {
  const maxCnt = Math.max(...DATA.works.map(x => x.cnt), 1);
  const r = CONFIG.workBase + (w.cnt / maxCnt) * (CONFIG.workMax - CONFIG.workBase);
  // [A1] 删除可视球+halo：visual 由 workPoints + 二级 halo sprite 接管
  //      保留 mesh 仅作 raycaster 拾取代理（visible=false 不被 raycaster 跳过——实测)
  pickProxyMat = pickProxyMat || new THREE.MeshBasicMaterial();
  const pickR = Math.max(r * 3, 10);              // 拾取半径放大，便于指尖/光标命中
  const m = new THREE.Mesh(sphereGeo, pickProxyMat);
  m.position.set(...w.p);
  m.scale.setScalar(pickR);
  m.visible = false;                              // 不渲染
  m.userData = { kind: 'work', w, baseScale: pickR };
  workMeshes.push(m);
  meshByName.set(w.n, m);
  scene.add(m);
}

// ---------- [A1] 137 篇目星升级版点云（替代 Phong 镜面球，复用概念点 shader） ----------
function makeWorkPoints() {
  const list = DATA.works;
  const n = list.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3),
        siz = new Float32Array(n), seed = new Float32Array(n);
  workBaseSize = new Float32Array(n);
  // [B-Fix] 一次性算 maxCnt（性能 + 避免每次重建数组）
  const maxCnt = Math.max(...list.map(x => x.cnt), 1);
  list.forEach((w, i) => {
    pos[i*3]   = w.p[0]; pos[i*3+1] = w.p[1]; pos[i*3+2] = w.p[2];
    const fc = new THREE.Color(fieldColor(w.f));   // 篇目色=领域色
    col[i*3]   = fc.r; col[i*3+1] = fc.g; col[i*3+2] = fc.b;
    // [B-Fix] w.s 字段在 works 数组中不存在（取值为 0）→ 改用 w.cnt 驱动（1~80）
    const r = CONFIG.workBase + (w.cnt / maxCnt) * (CONFIG.workMax - CONFIG.workBase);   // 6 ~ 12
    // [D-Tune] 再缩：dia r*2.4→r*2.0 钳 [14,22]（12~24→14~22，缩 12~8%）
    const dia = r * 2.0;
    const sizeFinal = Math.min(Math.max(dia, 14), 22);
    workBaseSize[i] = sizeFinal; siz[i] = sizeFinal;
    seed[i] = (i * 0.6180339887 + 0.137) % 1;      // 与概念点相位错开防同步闪烁
    pt.nodes.push({ n: w.n });                     // 占位（避免统计错位，便于调试）
    // [A1] 二级 halo sprite（每颗篇目一张柔光晕，染色=领域色，加色混合）
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeSoftHaloTexture(),
      color: fc,
      blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, opacity: 0.6,
    }));
    // [D-Tune] halo 倍率 4.5→3.6 钳 [22,38]（27~50→22~38，缩 19~24%）
    const haloScale = Math.min(Math.max(r * 3.6, 22), 38);
    halo.scale.setScalar(haloScale);
    halo.position.set(w.p[0], w.p[1], w.p[2]);
    halo.userData = { vol: w.vol, f: w.f, idx: i };
    scene.add(halo);
    workHaloSprites.push(halo);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor',  new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize',   new THREE.BufferAttribute(siz, 1));
  g.setAttribute('aSeed',   new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uBright: { value: 1.6 } },  // [A1] uBright=1.6（弱于概念1.9，强于恒星0.75）
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aSize; attribute float aSeed;
      uniform float uTime; uniform float uScale;
      varying vec3 vColor; varying float vTw;
      void main() {
        if (aSize < 0.001) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; return; }
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uScale / -mv.z, 3.0, 120.0);
        vTw = 0.85 + 0.15 * sin(uTime * 0.6 + aSeed * 6.2831853);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uBright;
      varying vec3 vColor; varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor * uBright, a * vTw);
      }`,
  });
  workPoints = new THREE.Points(g, mat);
  workPoints.frustumCulled = false;
  scene.add(workPoints);
}

// ---------- [A2] 4 条轨道圆环（卷色 dashed LineLoop，倾角 ±6° 错开防共面） ----------
function makeRingLines() {
  const RING_RADII = [70, 125, 180, 235];        // 与段一 RING_BASE=70, GAP=55 一致
  const SEGS = 192;
  const ringGroup = new THREE.Group();
  for (let i = 0; i < VOL_ORDER.length; i++) {
    const vol = VOL_ORDER[i], r = RING_RADII[i];
    const cols = [];
    const baseCol = new THREE.Color(fieldColor(VOL_TO_FIELD[vol] || ''));
    // 圆环颜色：第一二三四卷 = 浅→深（同色调 family 内明度递减，与卷别环位置呼应）
    const c = baseCol.clone().lerp(new THREE.Color(0xffffff), 0.15);
    for (let s = 0; s <= SEGS; s++) cols.push(c.r, c.g, c.b);
    const pts = [];
    for (let s = 0; s <= SEGS; s++) {
      const a = (s / SEGS) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const mat = new THREE.LineDashedMaterial({
      vertexColors: true, transparent: true,
      dashSize: 1.8, gapSize: 1.0,
      opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Line(geo, mat);
    ring.computeLineDistances();                   // dashed 必需
    ring.rotation.x = (Math.random() - 0.5) * (Math.PI / 30);   // ±6° 防共面
    ring.userData = { vol, radius: r };
    ringGroup.add(ring);
  }
  workRingGroup = ringGroup;
  scene.add(ringGroup);
}
// 卷→领域映射（用于环线着色；不具备物理意义，只是给环一个家族色相）
const VOL_TO_FIELD = {
  '第一卷': '一.新民主主义革命',
  '第二卷': '二.社会主义革命和建设',
  '第三卷': '三.革命军队和军事战略',
  '第四卷': '五.思想政治工作和文化工作',
};

// 卷别筛选 → workPoints aSize 置 0/恢复（与 updateConceptPointVisibility 同机制）
function updateWorkPointVisibility() {
  if (!workPoints || !workBaseSize) return;
  const attr = workPoints.geometry.attributes.aSize;
  for (let i = 0; i < DATA.works.length; i++) {
    const w = DATA.works[i];
    const vis = nodeVisible(w.vol) && nodeFieldVisible(w.f);
    attr.array[i] = vis ? workBaseSize[i] : 0;
    if (workHaloSprites[i]) workHaloSprites[i].visible = vis;
  }
  attr.needsUpdate = true;
}

// workPoints 像素尺寸自适应（与 updatePointScale 同源）
function updateWorkPointScale() {
  if (!workPoints) return;
  workPoints.material.uniforms.uScale.value =
    renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
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
  const fA = nodeMap.get(lk.s)?.f || nodeMap.get(lk.t)?.f || '';  // 连线色=星体色（源端领域）
  const col = fieldColor(fA);

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
  const relOp = CONFIG.relStyle[lk.ty].op;   // 关系类型→亮度分层（色相已让给领域）
  if (lk.ty === 'debate') {
    mat = new THREE.LineDashedMaterial({ vertexColors: true, transparent: true, opacity: relOp,
      dashSize: 3.2, gapSize: 2.6, depthWrite: false, blending: THREE.AdditiveBlending });
    // LineDashedMaterial 需要 computeLineDistances
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
  } else {
    mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: relOp,
      depthWrite: false, blending: THREE.AdditiveBlending });
  }
  const line = new THREE.Line(geo, mat);
  line.visible = lk.bb;   // 骨干默认显示，叶子隐藏
  line.userData = { lk, focusOp: CONFIG.arcFocusOp, baseOp: relOp };
  scene.add(line);
  edges.push(line);

  // 流动粒子（debate 双向：一半反方向；密度按关系强度分层）
  const cc = new THREE.Color(col);
  const n = CONFIG.relStyle[lk.ty].flow;
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
    size: CONFIG.relStyle[ty].size, vertexColors: true, transparent: true,
    opacity: { source: 0.75, develop: 0.6, debate: 0.45 }[ty],
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
      const bright = Math.pow(u, 3) * 1.05 + 0.08;   // 降亮，避免喧宾夺主
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
  makeWorkPoints();         // [A1] 137 篇目点云视觉层（与代理球并行）
  makeRingLines();          // [A2] 4 条轨道圆环
  DATA.nodes.forEach(nd => { nodeMap.set(nd.n, nd); });
  buildConceptPoints();          // 点精灵云（视觉层）
  DATA.nodes.forEach(nd => {     // 代理球（交互层）+ 中心恒星实体
    if (nd.n === MAO_NAME) makeCenterStar(nd); else makePickProxy(nd);
  });
  DATA.links.forEach(lk => makeArc(lk));

  // 卷别图例动态生成
  buildLegend();   // 图例：领域 → 卷别 → 关系（统一 JS 生成）
  document.getElementById('stat').textContent =
    `${DATA.nodes.length} 概念 · ${DATA.works.length} 篇目 · ${DATA.links.length} 关系`;

  // 更新边可见性（初始：骨干显示，叶子隐藏）
  buildTopLabels();          // Top12 概念常显锚点
  updateVisibility();
  animate();

  // 加载完成：淡出启动屏；操作引导 6s 或首次交互后消失
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const sp = document.getElementById('splash');
    if (sp) sp.classList.add('hide');
    setTimeout(() => sp && sp.remove(), 700);
  }));
  setTimeout(() => hideGuide(), 6000);
  renderer.domElement.addEventListener('pointerdown', hideGuide, { once: true });

  // 调试/验证句柄（供自动化测试）
  window.__dbg = {
    conceptMeshes, workMeshes, edges, topLabels,
    flowN: { source: flowAttrs.source.length, develop: flowAttrs.develop.length, debate: flowAttrs.debate.length },
    mao: meshByName.get(MAO_NAME) || null,
    starPoints,             // [F] 恒星亮核 Points（断言：存在且 aSize>30）
    refCount: conceptMeshes.filter(m => m.userData.isRef).length,
    ui: { showConceptPanel, showWorkPanel, nodeMap, workMap },  // UI 截图验证钩子
  };
}

// ================= 可见性管理（卷别筛选 + 类型开关 + 焦点高亮） =================
let focusName = null;

function nodeVisible(vol) {
  return !vol || state.volOn[vol] !== false;   // 无卷概念恒显；卷缺失视为选中
}
function nodeFieldVisible(f) {
  return state.fieldOn[f] !== false;   // f='cross'→跨领域枢纽行；f=''→外部文献行；领域→对应行
}

function updateVisibility() {
  // 概念点云：aSize 置 0/恢复（中心恒星与跨卷枢纽恒显）
  updateConceptPointVisibility();
  // [A1] 篇目点云视觉层：aSize 置 0/恢复 + halo 同步（workMeshes 已为不可见代理，不再控制）
  updateWorkPointVisibility();
  // Top12 锚点标签随卷/领域筛选联动
  topLabels.forEach(lbl => {
    const nd = nodeMap.get(lbl.userData.name);
    if (!nd) return;
    lbl.visible = nodeVisible(nd.vol) && nodeFieldVisible(nd.f);
  });
  // 边 + 粒子
  edges.forEach(ln => {
    const { lk } = ln.userData;
    const relOn = state.relOn[lk.ty];
    const s = nodeMap.get(lk.s), t = nodeMap.get(lk.t);
    const volOn = nodeVisible(s?.vol) && nodeFieldVisible(s?.f)
               && nodeVisible(t?.vol) && nodeFieldVisible(t?.f);
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
      pt.hoverPrev = pt.hoverCur;     // 点精灵 hover 放大目标
      pt.hoverCur = obj.userData.ptIndex ?? -1;
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
  pt.hoverPrev = pt.hoverCur;
  pt.hoverCur = -1;
  hovered = null;
  tipEl.style.display = 'none';
}

function showTip(obj) {
  const { kind } = obj.userData;
  if (kind === 'work') {
    const w = obj.userData.w;
    const col = '#' + new THREE.Color(fieldColor(w.f)).getHexString();
    tipEl.innerHTML = `<b style="color:${col}">${w.n}</b><br><span style="color:#9fb0d8">篇目 · ${w.vol} · ${w.cnt} 概念 · 点击查看</span>`;
  } else {
    const nd = obj.userData.nd;
    const col = '#' + new THREE.Color(fieldColor(nd.f)).getHexString();  // 概念色=领域色
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
  document.getElementById('pType').textContent = isMao ? '全书唯一作者' : (isExt ? '外部节点' : (TYPE_NAME[nd.t] || nd.t) + (nd.f ? ' · ' + nd.f.slice(2) : ''));
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
  document.getElementById('pType').textContent = `${w.vol} · 篇目${w.f ? ' · ' + w.f.slice(2) : ''}`;
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

// ================= 图例（JS 统一生成：领域 → 卷别 → 关系，均支持多选/全选） =================
function buildLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  const mkIt = cls => { const d = document.createElement('div'); d.className = cls; return d; };
  // 标题行：文字 + 全选链接
  const mkHead = (t, onAll) => {
    const d = document.createElement('div');
    d.style.cssText = 'margin:9px 0 6px;display:flex;justify-content:space-between;align-items:center';
    d.innerHTML = `<span class="g" style="margin:0">${t}</span><a class="all" href="javascript:void(0)">全选</a>`;
    d.querySelector('.all').addEventListener('click', e => { e.preventDefault(); onAll(); });
    return d;
  };

  // 1. 领域（7 领域 + 跨领域枢纽 + 外部文献，多选，默认全选）
  legend.appendChild(mkHead('领域', onFieldAll));
  for (const [f, c] of Object.entries(FIELD_COLOR)) {
    const hex = '#' + new THREE.Color(c).getHexString();
    const el = mkIt('it fld sel');
    el.innerHTML = `<span class="dot" style="background:${hex};color:${hex}"></span><span class="lbl">${f === 'cross' ? '跨领域枢纽' : f.slice(2)}</span>`;
    el.addEventListener('click', () => onFieldClick(f, el));
    legend.appendChild(el);
  }
  const ext = mkIt('it fld sel');
  ext.innerHTML = `<span class="dot" style="background:#9aa7c0;color:#9aa7c0"></span><span class="lbl">外部文献</span>`;
  ext.addEventListener('click', () => onFieldClick('', ext));
  legend.appendChild(ext);

  // 2. 卷别（多选，默认全选）
  legend.appendChild(mkHead('卷别', onVolAll));
  for (const vol of VOL_ORDER) {
    const hex = '#' + volumeTone(CONFIG.workColor, vol).getHexString();
    const el = mkIt('it vol sel');
    el.innerHTML = `<span class="dot" style="background:${hex};color:${hex}"></span><span class="lbl">${vol}</span>`;
    el.addEventListener('click', () => onVolClick(vol, el));
    legend.appendChild(el);
  }

  // 3. 关系（多选，亮度分层示例）
  legend.appendChild(mkHead('关系', onRelAll));
  const REL_SAMPLE = { source: 0.9, develop: 0.55, debate: 0.3 };
  for (const ty of REL_TYPES) {
    const el = mkIt('it sel');
    el.innerHTML = `<span class="line" style="background:#e9edf5;opacity:${REL_SAMPLE[ty]};color:#e9edf5"></span><span class="lbl">${REL_NAME[ty]}</span>`;
    el.addEventListener('click', () => onRelClick(ty, el));
    legend.appendChild(el);
  }
}

function onFieldClick(f, el) {
  const next = state.fieldOn[f] === false;   // 取消→选中，选中→取消
  state.fieldOn[f] = next;
  el.classList.toggle('sel', next);
  el.classList.toggle('off', !next);
  updateVisibility();
}
function onFieldAll() {
  for (const f of Object.keys(FIELD_COLOR)) state.fieldOn[f] = true;
  state.fieldOn[''] = true;
  document.querySelectorAll('#legend .it.fld').forEach(x => { x.classList.add('sel'); x.classList.remove('off'); });
  updateVisibility();
}

function onVolClick(vol, el) {
  const next = state.volOn[vol] === false;
  state.volOn[vol] = next;
  el.classList.toggle('sel', next);
  el.classList.toggle('off', !next);
  updateVisibility();
}
function onVolAll() {
  VOL_ORDER.forEach(v => { state.volOn[v] = true; });
  document.querySelectorAll('#legend .it.vol').forEach(x => { x.classList.add('sel'); x.classList.remove('off'); });
  updateVisibility();
}

function onRelClick(ty, el) {
  state.relOn[ty] = !state.relOn[ty];
  el.classList.toggle('off', !state.relOn[ty]);
  updateVisibility();
}
function onRelAll() {
  REL_TYPES.forEach(ty => { state.relOn[ty] = true; });
  document.querySelectorAll('#legend .it').forEach(x => x.classList.remove('off'));
  updateVisibility();
}

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

// 首次操作引导隐藏
function hideGuide() {
  const g = document.getElementById('guide');
  if (g) g.classList.add('hide');
}

// H 键：截图模式（淡出全部 UI，保留布局；再按恢复）
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    document.body.classList.toggle('ui-hidden');
  }
});

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

  if (conceptPoints) conceptPoints.material.uniforms.uTime.value = elapsed;
  if (workPoints) workPoints.material.uniforms.uTime.value = elapsed;   // [A1]
  if (starPoints) starPoints.material.uniforms.uTime.value = elapsed;   // [F] 恒星亮核
  ptHoverTick();
  starHoverTick();            // [F] 恒星亮核 hover 放大
  flowTick(elapsed);
  composer.render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  updatePointScale();
  updateWorkPointScale();   // [A1] workPoints 像素尺寸自适应
});

// 启动
loadData().then(init).catch(e => {
  console.error(e);
  const sp = document.getElementById('splash');
  if (sp) { sp.classList.add('hide'); sp.remove(); }
  document.getElementById('stat').textContent = '数据加载失败：' + e.message;
});
