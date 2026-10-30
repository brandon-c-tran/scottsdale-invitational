// Builds scripts/tq/nba.sources.json from tq-raw/nba/picks.txt (tier|name|team|decoy,decoy,decoy) + the official verify output.
import fs from 'node:fs'
const RAW = 'C:/dev/scottsdale/tq-raw/nba'
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const roster = JSON.parse(fs.readFileSync(RAW + '/roster-official.json', 'utf8'))
const out = []
for (const l of fs.readFileSync(RAW + '/picks.txt', 'utf8').trim().split('\n')) {
  const [tier, name, team, dec] = l.split('|')
  const r = roster[norm(name)]
  const v = JSON.parse(fs.readFileSync(`${RAW}/verify/${r.id}.json`, 'utf8'))
  const decoys = dec.split(',')
  if (v.team !== team) console.log('TEAM MISMATCH', name, v.team, team)
  if (decoys.includes(team) || decoys.length !== 3) console.log('BAD DECOYS', name)
  out.push({ name, personId: r.id, tier: +tier, team, decoys, how: v.how, jersey: v.jersey, status: v.status, url: v.url, checkedAt: v.checkedAt })
}
fs.writeFileSync(new URL('./nba.sources.json', import.meta.url), JSON.stringify({ cutoff: '2026-10-29', source: 'nba.com team and player pages', players: out }, null, 1))
console.log(out.length)
