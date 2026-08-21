#!/usr/bin/env node
// Prints today's MLB gamePks with status, useful for picking a live gamePk
// for QA testing. Node stdlib only (global fetch).
//
// Usage:
//   node scripts/qa-gamepk.mjs            # today's slate
//   node scripts/qa-gamepk.mjs 2025-08-21 # specific date

const date = process.argv[2] ?? new Date().toISOString().slice(0, 10)
const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher,linescore,team`

try {
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText}`)
    process.exit(1)
  }
  const data = await res.json()
  const games = data.dates?.[0]?.games ?? []
  if (games.length === 0) {
    console.log(`No MLB games on ${date}`)
    process.exit(0)
  }

  const live = []
  const preview = []
  const final = []

  for (const g of games) {
    const state = g.status.abstractGameState
    const away = g.teams.away.team.name
    const home = g.teams.home.team.name
    const awayScore = g.teams.away.score ?? 0
    const homeScore = g.teams.home.score ?? 0
    const line = `${state.padEnd(7)}  ${g.gamePk}  ${away} ${awayScore} @ ${home} ${homeScore}`
    if (state === 'Live') live.push(line)
    else if (state === 'Preview') preview.push(line)
    else final.push(line)
  }

  const print = (label, lines) => {
    if (lines.length === 0) return
    console.log(`\n${label} (${lines.length}):`)
    for (const l of lines) console.log(`  ${l}`)
  }

  print('LIVE', live)
  print('PREVIEW', preview)
  print('FINAL', final)

  if (live.length > 0) {
    const pk = live[0].match(/\d+/)[0]
    console.log(`\nQuick start:  npm run dev -- -- ?gamePk=${pk}`)
    console.log(`Or open:       http://localhost:5173/?gamePk=${pk}`)
  } else if (preview.length > 0) {
    console.log('\nNo live games right now. Use a Preview gamePk to test pre-game rendering.')
  } else {
    console.log('\nNo live or upcoming games. Use ?gamePk=746352 for layout-only QA.')
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
