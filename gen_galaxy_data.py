"""生成层级化 3D 星系数据 → galaxy/data/galaxy_data.json

结构（三层，参考诗云"朝代壳→诗人→诗"）：
  篇目星(137)  篇目向量=该篇全部块向量均值 → PCA 3D（主题星团：军事/哲学/党建）
  概念节点(1275) 位置 = 主来源篇目坐标 + alpha×(概念语义坐标 − 篇目坐标)
                （混合布局：篇目锚点结构 + 概念语义内聚）
  关系(1278)  标记 backbone（两端连接度≥2）与平行偏移组

数据链：概念 → 块(anchor 页码) → 篇目(rel) → 卷别
"""
import json
import math
import re
from collections import Counter, defaultdict

import numpy as np

BASE = '..'  # 源数据在 skill_rag_full 根目录
g = json.load(open(f'{BASE}/concept_graph.json', encoding='utf-8'))
chunks = json.load(open(f'{BASE}/chunks_meta.json', encoding='utf-8'))
vecs = np.load(f'{BASE}/vectors.npy')  # (1402, 1024)

ents = g['entities']
rels = g['relationships']
name2ent = {e['name']: e for e in ents}
# 篇目→领域映射（历史决议七大领域：六大组成部分+活的灵魂，source: 00_研究总纲/07_毛选各卷目录初步梳理）
field_map = json.load(open('data/field_map.json', encoding='utf-8'))
field_map['附录：关于若干历史问题的决议'] = '六.党的建设'  # 附录归党的建设（覆盖旧空值）

ALPHA = 0.45   # 概念自由语义权重：0=贴篇目 1=纯语义
RADIUS = 170.0 # 星系半径

# ---------- 1. 块→篇目/卷/页码 ----------
block_work = []   # 每块所属篇目（None 若无）
block_vol = []    # 每块所属卷
for c in chunks:
    rel = c.get('rel', '')
    parts = rel.split('\\')
    if len(parts) >= 2:
        block_work.append(parts[1].replace('.md', ''))
        block_vol.append(parts[0])
    else:
        block_work.append(None)
        block_vol.append(None)

# ---------- 2. 篇目向量 ----------
work2idx = defaultdict(list)
for i, w in enumerate(block_work):
    if w: work2idx[w].append(i)
works = sorted(work2idx.keys())  # 137 篇目
work_vec = np.array([vecs[work2idx[w]].mean(axis=0) for w in works], dtype=np.float32)
work_vol = [Counter(block_vol[i] for i in work2idx[w]).most_common(1)[0][0] for w in works]
print(f'篇目 {len(works)} 个 | 向量 {work_vec.shape}')

# ---------- 3. 概念向量 + 主篇目 + 页码 ----------
all_names = set(name2ent.keys())
for r in rels:
    all_names.add(r['src']); all_names.add(r['tgt'])
all_names = sorted(all_names, key=len, reverse=True)

pat = re.compile('|'.join(map(re.escape, all_names)))
hit = defaultdict(set)         # name -> {块idx}
work_hit = defaultdict(Counter)  # name -> Counter{篇目}
first_block = {}               # name -> 首个命中块
for i, c in enumerate(chunks):
    content = c.get('content', '') + c.get('title', '')
    for m in pat.finditer(content):
        hit[m.group(0)].add(i)
        if block_work[i]:
            work_hit[m.group(0)][block_work[i]] += 1
        first_block.setdefault(m.group(0), i)

concept_vec = {n: vecs[list(hit[n])].mean(axis=0) for n in hit}
print(f'有向量的概念 {len(concept_vec)}/{len(all_names)}')

# ---------- 4. 同一 PCA 空间（篇目+概念一起降维） ----------
order = sorted(all_names, key=len)
n_work, n_con = len(works), len(order)
X = np.vstack([work_vec, np.stack([concept_vec.get(n, np.zeros(1024, dtype=np.float32)) for n in order])]).astype(np.float32)
Xc = X - X.mean(axis=0)
U, S, Vt = np.linalg.svd(Xc, full_matrices=False)
all3 = Xc @ Vt[:3].T  # (137+1275, 3)

# 归一化到半径 RADIUS
norms = np.linalg.norm(all3, axis=1, keepdims=True) + 1e-9
all3 = all3 / norms * (RADIUS / np.max(norms))

work_pca = {w: all3[i] for i, w in enumerate(works)}  # 语义坐标（仅用于卫星偏移方向）
con_pos_raw = all3[n_work:]  # 概念原始语义坐标

# ---------- 5. 日心布局 ----------
# 中心恒星=原点；篇目按卷分四环（内→外 = 卷一→卷四，即时间轴）；
# 概念=主篇目的卫星（保留语义相对方向）；无锚概念入内核枢纽带；无端点节点入外壳
CENTER_NAME = '毛泽东'
VOL_ORDER = ['第一卷', '第二卷', '第三卷', '第四卷']
RING_BASE, RING_GAP = 70.0, 55.0                 # 环半径 70/125/180/235
ring_r = {v: RING_BASE + i * RING_GAP for i, v in enumerate(VOL_ORDER)}
ring_tilt = {v: math.radians((i - 1.5) * 3.5) for i, v in enumerate(VOL_ORDER)}  # ±5.25° 内
SAT_R = 28.0                                     # 卫星偏移半径上限
HUB_R = (30.0, 62.0)                             # 枢纽带（跨篇概念，环绕中心）
SHELL_R = (260.0, 300.0)                         # 外部星尘壳

def h_rand(name, k):
    v = 0
    for ch in name:
        v = (v * 31 + ord(ch)) & 0xFFFF
    return ((v * 2654435761) >> (16 + k)) % 1000 / 1000.0 - 0.5

def ring_point(vol, frac, key):
    """环上一点：frac=环内序[0,1)，带卷别倾角与确定性微扰"""
    th = frac * 2 * math.pi + h_rand(key, 3) * 0.5
    r = ring_r[vol] * (1 + h_rand(key, 4) * 0.04)
    tilt = ring_tilt[vol]
    x = r * math.cos(th)
    z0 = r * math.sin(th)
    y = -z0 * math.sin(tilt) + h_rand(key, 5) * 6.0
    return np.array([x, y, z0 * math.cos(tilt)])

# 篇目星：分卷上环，环内角位=卷内篇章序（首块序号≈页码序）
work_pos = {}
for v in VOL_ORDER:
    ws = [w for w in works if work_vol[works.index(w)] == v]
    ws.sort(key=lambda w: min(work2idx[w]))
    for k, w in enumerate(ws):
        work_pos[w] = ring_point(v, k / max(len(ws), 1), 'W' + w)

con_pos = np.zeros((n_con, 3), dtype=np.float32)
con_work = []   # 概念主篇目名
con_vol = []    # 概念卷别
con_anch = []   # 概念页码
for i, n in enumerate(order):
    if n == CENTER_NAME:
        con_pos[i] = np.zeros(3, dtype=np.float32)   # 中心恒星：绝对原点
        con_work.append(None); con_vol.append(None); con_anch.append('')
        continue
    if n in concept_vec:
        hw = work_hit[n].most_common(1)[0][0] if work_hit[n] else None
        con_work.append(hw)
        if hw and hw in work_pos:
            # 卫星：主篇目位置 + 语义相对方向 × SAT_R 内偏移
            dv = con_pos_raw[i] - work_pca[hw]
            dn = float(np.linalg.norm(dv))
            if dn < 1e-6:
                dv = np.array([h_rand(n, 0), h_rand(n, 1), h_rand(n, 2)]); dn = float(np.linalg.norm(dv))
            con_pos[i] = work_pos[hw] + dv / dn * (SAT_R * (0.55 + 0.45 * h_rand(n, 6)))
            con_vol.append(work_vol[works.index(hw)])
        else:
            # 无锚概念：内核枢纽带（跨篇枢纽环绕中心）
            th = (h_rand(n, 7) + 0.5) * 2 * math.pi
            r = HUB_R[0] + (HUB_R[1] - HUB_R[0]) * (0.5 + h_rand(n, 8))
            con_pos[i] = np.array([r * math.cos(th), h_rand(n, 9) * 22.0, r * math.sin(th)])
            con_vol.append(None)
        fb = first_block.get(n)
        con_anch.append(chunks[fb].get('anchor', '') if fb is not None else '')
    else:
        # 无端点节点：外部星尘壳（稀疏远景）
        r = SHELL_R[0] + (SHELL_R[1] - SHELL_R[0]) * (0.5 + h_rand(n, 10))
        th = (h_rand(n, 11) + 0.5) * 2 * math.pi
        ph = math.acos(2 * (h_rand(n, 12) + 0.5) - 1)
        con_pos[i] = np.array([r * math.sin(ph) * math.cos(th), r * math.cos(ph), r * math.sin(ph) * math.sin(th)])
        con_work.append(None); con_vol.append(None); con_anch.append('')

# 卷别二次归因：仍为 null 的概念按关系邻居多数卷归属（两轮到收敛）
vol_of = {w: work_vol[works.index(w)] for w in works}
for i, n in enumerate(order):
    if con_vol[i]: vol_of[n] = con_vol[i]
adj = defaultdict(list)
for r in rels:
    adj[r['src']].append(r['tgt']); adj[r['tgt']].append(r['src'])
for _ in range(2):
    for i, n in enumerate(order):
        if con_vol[i] is None and n != CENTER_NAME:
            vs = [vol_of[m] for m in adj.get(n, []) if vol_of.get(m)]
            if vs:
                con_vol[i] = Counter(vs).most_common(1)[0][0]
                vol_of[n] = con_vol[i]

def fmt_anchor(a):
    if not a: return ''
    m = re.match(r'\^v(\d+)p(\d+)', a)
    if m: return f'第{int(m.group(1))}卷 · p{int(m.group(2))}'
    return a

# ---------- 6. 节点 ----------
deg = Counter()
for r in rels:
    deg[r['src']] += 1; deg[r['tgt']] += 1
max_deg = max(deg.values()) if deg else 1

nodes = []
for i, n in enumerate(order):
    ent = name2ent.get(n)
    d = deg.get(n, 0)
    t = ent.get('type', 'ghost') if ent else 'ghost'
    is_ext = t == 'ghost' or (t == 'work' and n not in work2idx)  # 外部文献/幽灵
    # f 值域：7 领域（继承主篇目）｜'cross' 跨领域枢纽｜'' 外部文献
    f = field_map.get(con_work[i], '') if con_work[i] else ('cross' if not is_ext else '')
    nodes.append({
        'n': n,
        't': t,
        'p': [round(float(x), 2) for x in con_pos[i]],
        's': round(1.2 + (d / max_deg) * 5.0, 2),
        'd': (ent.get('description', '') if ent else '')[:90],
        'vol': con_vol[i],
        'anch': fmt_anchor(con_anch[i]),
        'src': con_work[i],
        'f': f,
    })

# ---------- 7. 篇目星 ----------
work_desc = {e['name']: e.get('description', '') for e in ents if e.get('type') == 'work'}
work_deg = Counter()
for r in rels:
    if r['src'] in work2idx: work_deg[r['src']] += 1
    if r['tgt'] in work2idx: work_deg[r['tgt']] += 1
works_node = []
for w in works:
    n_c = len(work2idx[w])  # 篇内概念数
    works_node.append({
        'n': w,
        'vol': work_vol[works.index(w)],
        'p': [round(float(x), 2) for x in work_pos[w]],
        'desc': work_desc.get(w, '')[:80],
        'cnt': n_c,
        'f': field_map.get(w, ''),
    })

# ---------- 8. 关系：backbone + 平行边 ----------
vol_colors = {
    '第一卷': '#6ec6ff', '第二卷': '#ffd76e', '第三卷': '#ff8fa3', '第四卷': '#8be0a8',
}

pairs = defaultdict(list)
for r in rels:
    pairs[tuple(sorted([r['src'], r['tgt']]))].append(r)

links = []
for key, rs in pairs.items():
    for j, r in enumerate(rs):
        bb = min(deg.get(r['src'], 0), deg.get(r['tgt'], 0)) >= 3  # 骨干收紧：两端度≥3
        links.append({
            's': r['src'], 't': r['tgt'],
            'ty': r['type'],
            'ev': (r.get('evidence', '') or '')[:80],
            'bb': bb,
            'po': j,  # 平行偏移组内序号
        })

data = {
    'version': 2,
    'alpha': ALPHA,
    'works': works_node,
    'nodes': nodes,
    'links': links,
    'vols': vol_colors,
}
out = 'data/galaxy_data.json'
tmp = out + '.tmp'
json.dump(data, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
import os, time
for attempt in range(6):
    try:
        os.replace(tmp, out); break
    except PermissionError:
        time.sleep(0.6)
else:
    with open(out, 'w', encoding='utf-8') as f:  # 兜底：直接写
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print(f'写出 {out}: {len(nodes)} 概念 / {len(works_node)} 篇目 / {len(links)} 边 ({os.path.getsize(out)//1024} KB)')

# 抽样验证
pos = {nd['n']: nd['p'] for nd in nodes}
wpos = {w['n']: w['p'] for w in works_node}
print('\n=== 日心布局验证 ===')
import math as _m
print(f'  中心恒星位置: {pos.get(CENTER_NAME)}')
for v in VOL_ORDER:
    ws = [w for w in works_node if w['vol'] == v]
    if ws:
        rs = [_m.hypot(*w['p']) for w in ws]
        print(f'  {v}: {len(ws)} 篇目, 环半径均值 {sum(rs)/len(rs):.1f} (目标 {ring_r[v]:.0f})')
# 卫星距离 p95
ds = []
for nd in nodes:
    if nd['src'] and nd['src'] in wpos:
        ds.append(_m.hypot(*[nd['p'][k] - wpos[nd['src']][k] for k in range(3)]))
ds.sort()
if ds: print(f'  卫星距主篇目 p50={ds[len(ds)//2]:.1f} p95={ds[int(len(ds)*0.95)]:.1f} max={ds[-1]:.1f} (上限 {SAT_R:.0f})')
print(f'  卷别归因后 null: {sum(1 for nd in nodes if nd["vol"] is None)} / {len(nodes)}')
print('\n=== 篇目星抽查 ===')
for nm in ['实践论', '矛盾论', '论持久战', '战争和战略问题', '论联合政府', '新民主主义论']:
    if nm in wpos: print(f'  篇目[{nm}]: {wpos[nm]} vol={[w for w in works_node if w["n"]==nm][0]["vol"]}')
print('\n=== 关系统计 ===')
from collections import Counter
print('  骨干边:', sum(1 for l in links if l['bb']), '/', len(links))
print('  平行对:', sum(1 for k in pairs if len(pairs[k]) > 1))
print('  类型:', dict(Counter(l['ty'] for l in links)))
