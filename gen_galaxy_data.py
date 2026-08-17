"""生成层级化 3D 星系数据 → galaxy/data/galaxy_data.json

结构（三层，参考诗云"朝代壳→诗人→诗"）：
  篇目星(137)  篇目向量=该篇全部块向量均值 → PCA 3D（主题星团：军事/哲学/党建）
  概念节点(1275) 位置 = 主来源篇目坐标 + alpha×(概念语义坐标 − 篇目坐标)
                （混合布局：篇目锚点结构 + 概念语义内聚）
  关系(1278)  标记 backbone（两端连接度≥2）与平行偏移组

数据链：概念 → 块(anchor 页码) → 篇目(rel) → 卷别
"""
import json
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

work_pos = {w: all3[i] for i, w in enumerate(works)}
con_pos_raw = all3[n_work:]  # 概念原始语义坐标

# ---------- 5. 混合布局：概念 = 主篇目 + alpha×(语义−主篇目) ----------
def h_rand(name, k):
    v = 0
    for ch in name:
        v = (v * 31 + ord(ch)) & 0xFFFF
    return ((v * 2654435761) >> (16 + k)) % 1000 / 1000.0 - 0.5

con_pos = np.zeros((n_con, 3), dtype=np.float32)
con_work = []   # 概念主篇目名
con_vol = []    # 概念卷别
con_anch = []   # 概念页码
for i, n in enumerate(order):
    if n in concept_vec:
        hw = work_hit[n].most_common(1)[0][0] if work_hit[n] else None
        con_work.append(hw)
        if hw and hw in work_pos:
            wpos = work_pos[hw]
            con_pos[i] = wpos + ALPHA * (con_pos_raw[i] - wpos)
            con_vol.append(work_vol[works.index(hw)])
        else:
            con_pos[i] = con_pos_raw[i]
            con_vol.append(None)
        fb = first_block.get(n)
        con_anch.append(chunks[fb].get('anchor', '') if fb is not None else '')
    else:
        # 幽灵：中心 + hash 微扰
        con_pos[i] = np.array([h_rand(n, 0), h_rand(n, 1), h_rand(n, 2)]) * 60
        con_work.append(None); con_vol.append(None); con_anch.append('')

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
    nodes.append({
        'n': n,
        't': ent.get('type', 'ghost') if ent else 'ghost',
        'p': [round(float(x), 2) for x in con_pos[i]],
        's': round(1.2 + (d / max_deg) * 5.0, 2),
        'd': (ent.get('description', '') if ent else '')[:90],
        'vol': con_vol[i],
        'anch': fmt_anchor(con_anch[i]),
        'src': con_work[i],
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
        bb = min(deg.get(r['src'], 0), deg.get(r['tgt'], 0)) >= 2
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
print('\n=== 篇目星聚类抽查 ===')
for nm in ['实践论', '矛盾论', '论持久战', '战争和战略问题', '论联合政府', '新民主主义论']:
    if nm in wpos: print(f'  篇目[{nm}]: {wpos[nm]} vol={[w for w in works_node if w["n"]==nm][0]["vol"]}')
print('\n=== 概念-篇目归属抽查 ===')
for nm in ['实践', '矛盾', '统一战线', '持久战']:
    if nm in pos:
        nd = next(x for x in nodes if x['n'] == nm)
        print(f'  概念[{nm}]: src={nd["src"]} vol={nd["vol"]} anch={nd["anch"]} pos={pos[nm]}')
print('\n=== 关系统计 ===')
from collections import Counter
print('  骨干边:', sum(1 for l in links if l['bb']), '/', len(links))
print('  平行对:', sum(1 for k in pairs if len(pairs[k]) > 1))
print('  类型:', dict(Counter(l['ty'] for l in links)))
