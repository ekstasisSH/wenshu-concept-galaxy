# M4 视觉精修指南（供多模态模型接续使用）

> 状态：M0-M3 结构层已完成；M4 结构性精修（螺旋星系/开场缓入/UI沉浸）本会话已做。
> 剩余**审美性精修**需"看图→调参"闭环，建议由能读图的多模态模型执行。
> 工作目录：`_v2_work/skill_rag_full/galaxy/`

---

## 0. 快速上手（每条必读）

```bash
# 日常修改流程（改 app.js / style.css 后）：
rm -f dist/concept_galaxy.html && node build.mjs     # 构建单文件（先 rm 避免 Defender 锁）
node _test2.mjs                                       # 数值断言 + 生成 shot.png 截图
# 用 Read 工具查看 shot.png，判断视觉，继续调，循环
```

- 只改 **app.js 顶部 CONFIG** 和 **style.css**，不要动逻辑代码
- 数据相关参数（alpha）改完需重跑 `python gen_galaxy_data.py`
- 所有坐标/距离基于**星系半径 170**（篇目星团在 ±170 球内），相机默认 distance≈700

---

## 1. CONFIG 参数地图（app.js 第 12-32 行）

| 参数 | 含义 | 当前值 | 建议范围 | 对标诗云 | 需看图调 |
|---|---|---|---|---|---|
| `camera` | 初始相机位置(距离≈700) | {430,260,540} | 400~700 | 远观星团 | 半 |
| `intro.dur` | 开场缓入时长 | 3.0s | 2~4s | 开场叙事 | 半 |
| `autoRotate/autoSpeed` | 自动旋转 | true / 0.8 | 0.6~1.2 | 缓慢旋转 | 否 |
| `bloom.strength` | 辉光强度 | 0.5 | 0.3~0.7 | UnrealBloom 高 | **是** |
| `bloom.radius` | 辉光扩散半径 | 0.6 | 0.4~0.8 | 星云感 | **是** |
| `bloom.threshold` | 辉光阈值(越高越挑亮) | 0.82 | 0.7~0.9 | 只亮高光 | **是** |
| `conceptBase/conceptMax` | 概念节点半径映射 | 1.1 / 5.5 | 0.8~2 / 4~8 | 星等分层 | **是** |
| `workBase/workMax` | 篇目星半径映射 | 6.0 / 15.0 | 5~8 / 12~20 | 诗人星 | **是** |
| `workOpacity` | 篇目星透明度 | 0.75 | 0.6~0.9 | 半透明壳 | 半 |
| `arcBend` | 弧线垂直拱起 | 0.24 | 0.15~0.35 | 束状曲率 | **是** |
| `arcBundle` | 控制点向心收缩 | 0.5 | 0.3~0.6 | bundle=0.3 | **是** |
| `arcBackboneOp/arcFocusOp` | 骨干/聚焦边透明度 | 0.30 / 0.85 | 0.2~0.4 / 0.8~1 | 弱化非聚焦 | 半 |
| `flowPerLink/flowSpeed/flowSize` | 流动粒子密度/速度/大小 | 12 / 0.055 / 1.7 | 8~16 / .04~.07 / 1.2~2.2 | shader 脉冲 | **是** |
| `parallelGap` | 平行边偏移间距 | 8.0 | 6~12 | — | 否 |
| `alpha` | 概念混合布局权重 | 0.45 | 0.3~0.6（改需重跑数据） | — | 半 |

> `starCount` 已废弃（螺旋星系用固定 3600+1400），保留字段无副作用。

---

## 2. 精修项清单（对标诗云）

### ✅ 已完成（M4 结构性）
| 项 | 实现 | 位置 |
|---|---|---|
| 螺旋星系背景 | 3 臂对数螺旋 + 盘面厚度 + 外围尘埃球壳 | app.js `buildStars` |
| 开场镜头缓入 | easeOutQuart 从 2.3× 距离推入，3s | app.js `intro` |
| UI 沉浸化 | 标题 12.5px/背景 .32、图例 .7、输入 .82 | style.css |
| 毛泽东恒星 | 金色 + halo Sprite + 常显标签 | app.js `makeConceptMesh` |

### ⏳ 待多模态（需看图调参）
| 项 | 诗云做法 | 我们现状 | 建议改法 |
|---|---|---|---|
| **节点光晕** | 自定义 shader：亮核→暗晕衰减 | MeshPhongMaterial + bloom | 节点改用 ShaderMaterial 或叠加第二个"光晕 sprite"（小概念用半透明 halo 贴片） |
| **弧线流动** | shader 沿 UV 流动光脉冲 | 粒子替代（已够用但不如 shader 平滑） | 可选升级：Line2 + onBeforeCompile 改 UV |
| **弧线头尾渐变** | 沿弧透明度衰减 | 静态线等透明度 | 顶点色/透明度属性随 t 衰减 |
| **辉光调优** | UnrealBloom | strength .5/radius .6/threshold .82 | 看截图逐项调，目标：节点有星云感但不糊 |
| **星等降噪** | 诗人星大小/明暗分层 | 全量概念同亮度 | 连接度 1-2 的叶子概念缩小×0.6 + 透明度 0.7，减少"糊墙" |
| **颜色配比** | 深空蓝黑 | bg #04060d | 可试更蓝黑 #05070f 或加微紫 |
| **FOV/阻尼** | 沉浸 | FOV 58 / damping .08 | 可试 55~62 切换看手感 |

### 建议的精修顺序
1. 星等降噪（见效最快，减糊）→ 2. 辉光调优 → 3. 节点光晕 → 4. 弧线渐变 → 5. 颜色/相机手感 → 6. 弧线 shader（可选，成本最高）

---

## 3. 验证方法

```bash
node _test2.mjs   # puppeteer + Edge headless 打开 dist file://
```
断言内容（`window.__dbg`）：
- concepts=1275 / works=137 / edges≈1242 / refCount=106
- 毛泽东：金色 #ffd24d、halo/label 存在、107 连接
- 零 console 错误
- 生成 `shot.png` 截图 → **用 Read 看图，这是精修判断依据**

## 4. 关键约束（不要破坏）

- `init()` **必须先建 workMap（篇目）再建概念节点**，否则 work 全被误判为被引文献
- dist 构建前先 `rm -f dist/concept_galaxy.html`（Windows Defender 会锁）
- 交付必须是**单文件**（build.mjs 内联 CSS/JS/数据，file:// 可开）——精修后重新 build
- 修改 alpha 后必须重跑 `gen_galaxy_data.py`（概念混合布局权重）
