#!/usr/bin/env node
// Enforces four design-system invariants for MLB Companion. Node stdlib only.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.vercel', '.omo', '.codegraph']);

function read(relative) {
  const absolute = path.join(ROOT, relative);
  if (!existsSync(absolute)) return null;
  return readFileSync(absolute, 'utf8');
}

function walk(relativeDir, out = []) {
  const absolute = path.join(ROOT, relativeDir);
  if (!existsSync(absolute)) return out;
  for (const entry of readdirSync(absolute)) {
    if (SKIP_DIRS.has(entry)) continue;
    const relative = path.join(relativeDir, entry);
    if (statSync(path.join(ROOT, relative)).isDirectory()) walk(relative, out);
    else out.push(relative);
  }
  return out;
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const CANVAS_FILES = [
  'src/components/Canvas/ZonePlot.tsx',
  'src/components/Canvas/ArsenalBars.tsx',
  'src/components/Canvas/HeatMap.tsx',
  'src/components/Canvas/SprayChart.tsx',
  'src/utils/pitchConstants.ts',
];

function checkNoCanvasHex() {
  const violations = [];
  for (const file of CANVAS_FILES) {
    const source = read(file);
    if (source === null) {
      violations.push(`${file}: file not found`);
      continue;
    }
    source.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(HEX)) {
        violations.push(`${file}:${index + 1}: ${match[0]}`);
      }
    });
  }
  return violations;
}

function cssVar(source, name) {
  const match = source?.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim().toLowerCase() : null;
}

function checkThemeLockstep() {
  const violations = [];
  const css = read('src/index.css');
  const html = read('index.html');
  const viteConfig = read('vite.config.ts');

  if (css === null) return ['src/index.css: file not found'];
  if (html === null) return ['index.html: file not found'];
  if (viteConfig === null) return ['vite.config.ts: file not found'];

  const brand = cssVar(css, '--c-brand-900') ?? cssVar(css, '--mlb-primary');
  const background = cssVar(css, '--c-bg');
  if (!brand) violations.push('src/index.css: missing --c-brand-900 token');
  if (!background) violations.push('src/index.css: missing --c-bg token');

  const metaMatch = html.match(/<meta\s+name="theme-color"\s+content="([^"]+)"/i);
  const meta = metaMatch ? metaMatch[1].trim().toLowerCase() : null;
  if (!meta) violations.push('index.html: missing <meta name="theme-color">');

  const themeMatch = viteConfig.match(/theme_color\s*:\s*['"]([^'"]+)['"]/);
  const bgMatch = viteConfig.match(/background_color\s*:\s*['"]([^'"]+)['"]/);
  const themeColor = themeMatch ? themeMatch[1].trim().toLowerCase() : null;
  const backgroundColor = bgMatch ? bgMatch[1].trim().toLowerCase() : null;
  if (!themeColor) violations.push('vite.config.ts: missing theme_color');
  if (!backgroundColor) violations.push('vite.config.ts: missing background_color');

  if (brand && meta && brand !== meta) {
    violations.push(`mismatch: --c-brand-900 ${brand} vs index.html meta ${meta}`);
  }
  if (brand && themeColor && brand !== themeColor) {
    violations.push(`mismatch: --c-brand-900 ${brand} vs vite theme_color ${themeColor}`);
  }
  if (background && backgroundColor && background !== backgroundColor) {
    violations.push(`mismatch: --c-bg ${background} vs vite background_color ${backgroundColor}`);
  }
  return violations;
}

const BUDGET_TOKENS = ['h-190', 'h-172', 'h-160', 'h-120', 'h-55', 'h-44', 'h-40', 'h-22', 'h-18'];
const BUDGET_RE = new RegExp(`(?:\\.|\\b)(?:${BUDGET_TOKENS.join('|')})\\b|--pvb-content-h`, 'g');

function checkNoFixedBudgets() {
  const violations = [];
  for (const file of walk('src')) {
    if (!/\.(tsx?|css)$/.test(file)) continue;
    const source = read(file);
    if (source === null) continue;
    source.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(BUDGET_RE)) {
        violations.push(`${file}:${index + 1}: ${match[0]}`);
      }
    });
  }
  return violations;
}

function checkTabularNums() {
  const source = read('src/index.css');
  if (source === null) return ['src/index.css: file not found'];
  return source.includes('tabular-nums') ? [] : ['src/index.css: missing tabular-nums declaration'];
}

const CHECKS = [
  ['no-canvas-hex', checkNoCanvasHex],
  ['theme-lockstep', checkThemeLockstep],
  ['no-fixed-budgets', checkNoFixedBudgets],
  ['tabular-nums', checkTabularNums],
];

let failures = 0;
for (const [name, run] of CHECKS) {
  const violations = run();
  if (violations.length === 0) {
    console.log(`PASS  ${name}`);
    continue;
  }
  failures += 1;
  console.log(`FAIL  ${name} (${violations.length})`);
  for (const violation of violations) console.log(`      ${violation}`);
}

console.log(`\n${CHECKS.length - failures}/${CHECKS.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
