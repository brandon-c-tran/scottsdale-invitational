// Reads official nba.com team pages (roster) and player pages; writes tq-raw/nba/verify/<id>.json
// usage: node scripts/tq/nba.verify.mjs "Name One" "Name Two" ...   (or --file names.txt)
import fs from 'node:fs'
const RAW = 'C:/dev/scottsdale/tq-raw/nba'
const T = {hawks:37,celtics:38,cavaliers:39,pelicans:40,bulls:41,mavericks:42,nuggets:43,warriors:44,rockets:45,clippers:46,lakers:47,heat:48,bucks:49,timberwolves:50,nets:51,knicks:52,magic:53,pacers:54,sixers:55,suns:56,blazers:57,kings:58,spurs:59,thunder:60,raptors:61,jazz:62,grizzlies:63,wizards:64,pistons:65,hornets:66}
const UA = { 'user-agent': 'Mozilla/5.0' }
const nd = (h) => JSON.parse(h.match(/__NEXT_DATA__[^>]*>(.*?)<\/script>/s)[1])
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
async function get(url) { for (let i = 0; i < 3; i++) { const r = await fetch(url, { headers: UA }); if (r.ok) return r.text() } throw new Error('fetch ' + url) }
fs.mkdirSync(RAW + '/verify', { recursive: true })
const roster = {}
for (const [s, n] of Object.entries(T)) {
  const j = nd(await get(`https://www.nba.com/team/16106127${n}/${s}`))
  const ro = j.props.pageProps.team.roster; for (const p of (Array.isArray(ro) ? ro : (ro.roster || Object.values(ro).find(Array.isArray) || []))) roster[norm(p.PLAYER)] = { id: p.PLAYER_ID, team: s, how: p.HOW_ACQUIRED, exp: p.EXP }
}
fs.writeFileSync(RAW + '/roster-official.json', JSON.stringify(roster))
const names = process.argv.slice(2)
for (const name of names) {
  const r = roster[norm(name)]
  if (!r) { console.log('NOT ON ANY ROSTER', name); continue }
  const j = nd(await get(`https://www.nba.com/player/${r.id}/x`.replace('/x', '/' + norm(name).replace(/[^a-z0-9]+/g, '-'))))
  const pl = j.props.pageProps.player
  const hist = []
  const rows = pl.stats?.CareerTotalsRegularSeason ? null : null
  const seasons = (pl.careerStats?.SeasonTotalsRegularSeason || pl.stats?.SeasonTotalsRegularSeason || [])
  for (const s of seasons) hist.push(s.SEASON_ID + ':' + s.TEAM_ABBREVIATION)
  const out = { id: r.id, name, team: pl.info.TEAM_CITY + ' ' + pl.info.TEAM_NAME, jersey: pl.info.JERSEY, status: pl.info.ROSTERSTATUS, exp: pl.info.SEASON_EXP, how: r.how, hist, url: `https://www.nba.com/player/${r.id}/${pl.info.PLAYER_SLUG}`, checkedAt: '2026-10-29' }
  fs.writeFileSync(`${RAW}/verify/${r.id}.json`, JSON.stringify(out, null, 1))
  console.log(name, '|', out.team, '|', r.how, '|', hist.slice(-6).join(' '))
}
