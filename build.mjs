/**
 * build.mjs — 一键构建：esbuild 打包 app.js（含 three 全部依赖）
 * + 数据内联 → 输出 dist/concept_galaxy.html（单文件，file:// 可直接打开）。
 *
 * 用法：node build.mjs
 */
import { build } from 'esbuild';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

// 1. 打包：app.js + three + addons → 自包含 ESM bundle
await build({
  entryPoints: [join(ROOT, 'app.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  alias: { three: join(ROOT, 'vendor/three.module.js') },
  outfile: join(ROOT, 'dist', '_bundle.js'),
  logLevel: 'silent',
});
const bundle = await readFile(join(ROOT, 'dist', '_bundle.js'), 'utf-8');

// 2. 数据内联（开发版走 fetch，构建版走 window.__GALAXY_DATA__）
const dataJson = await readFile(join(ROOT, 'data', 'galaxy_data.json'), 'utf-8');

// 3. 处理 index.html：删 importmap → 内联 CSS → 内联 bundle → 内联数据
let html = await readFile(join(ROOT, 'index.html'), 'utf-8');
html = html.replace(/<script type="importmap">.*?<\/script>/s, '');
const css = await readFile(join(ROOT, 'style.css'), 'utf-8');
if (!/href="\.\/style\.css"/.test(html)) throw new Error('index.html 缺少 style.css 引用');
html = html.replace('<link rel="stylesheet" href="./style.css">',
  () => `<style>\n${css}\n</style>`);
if (!/src="\.\/app\.js"/.test(html)) throw new Error('index.html 缺少 app.js 引用');
html = html.replace('<script type="module" src="./app.js"></script>',
  () => '<script type="module">\n' + bundle + '\n</script>');
if (!/<!--__DATA__-->/.test(html)) throw new Error('index.html 缺少 __DATA__ 占位符');
html = html.replace('<!--__DATA__-->',
  () => `<script>window.__GALAXY_DATA__ = ${dataJson};</script>`);

// 4. 写出最终单文件
const out = join(ROOT, 'dist', 'concept_galaxy.html');
await writeFile(out, html);
try { await unlink(join(ROOT, 'dist', '_bundle.js')); } catch {}
const size = Buffer.byteLength(html) / 1024;
console.log(`✅ dist/concept_galaxy.html 已生成 (${size.toFixed(0)} KB, 单文件自包含)`);
