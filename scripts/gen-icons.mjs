#!/usr/bin/env node
// Rasterizes the SVG app marks in public/ into the PNG sizes that iOS and
// Android require. SVG icons alone are not enough: iOS Safari ignores SVG for
// apple-touch-icon / Add to Home Screen, and several Android launchers only
// accept PNG for the maskable adaptive icon.
//
// Playwright is intentionally NOT a package.json dependency -- this is a
// build-time authoring tool, not an app dependency, and the app ships zero new
// runtime deps. It resolves through the globally cached playwright CLI:
//
//   node scripts/gen-icons.mjs
//
// `--channel=chrome` drives the locally installed Google Chrome rather than
// Playwright's bundled chromium. The bundled browser is a separate ~150MB
// download (`npx playwright install`) that this repo has no reason to carry,
// and Playwright resolves the system Chrome path per-platform, so this stays
// portable in a way that hardcoding /Applications/... would not.
//
// Re-run this whenever public/favicon.svg or public/icon-maskable.svg changes,
// then commit the regenerated PNGs.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

// source svg -> [output png, edge length in px]
const TARGETS = [
  ['public/favicon.svg', 'public/apple-touch-icon.png', 180],
  ['public/favicon.svg', 'public/icon-192.png', 192],
  ['public/favicon.svg', 'public/icon-512.png', 512],
  ['public/icon-maskable.svg', 'public/icon-maskable-512.png', 512],
]

const scratch = mkdtempSync(join(tmpdir(), 'mlb-icons-'))

// Chromium renders a bare .svg document at its intrinsic 32x32 and letterboxes
// it, so the SVG is inlined into an HTML shell that stretches it to the exact
// viewport instead.
function shellFor(svg, size) {
  const sized = svg.replace(
    /<svg([^>]*)\swidth="[^"]*"\s+height="[^"]*"/,
    `<svg$1 width="${size}" height="${size}"`,
  )
  return `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style>
${sized}`
}

let failed = false

for (const [src, out, size] of TARGETS) {
  const svg = readFileSync(join(ROOT, src), 'utf8')
  const page = join(scratch, `${size}-${out.replace(/\W/g, '_')}.html`)
  writeFileSync(page, shellFor(svg, size))

  execFileSync(
    'npx',
    [
      '--no-install',
      'playwright',
      'screenshot',
      '--browser=chromium',
      '--channel=chrome',
      `--viewport-size=${size},${size}`,
      '--wait-for-timeout=250',
      page,
      join(ROOT, out),
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )

  const width = execFileSync('sips', ['-g', 'pixelWidth', join(ROOT, out)], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/)
    .pop()

  const ok = Number(width) === size
  if (!ok) failed = true
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${out.padEnd(30)} ${width}x${width} (want ${size})`)
}

rmSync(scratch, { recursive: true, force: true })

if (failed) {
  console.error('\nicon rasterization produced an unexpected size')
  process.exit(1)
}
console.log(`\n${TARGETS.length}/${TARGETS.length} icons rasterized`)
