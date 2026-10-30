// Builds worker/triviaQBank/nba.json from nba.sources.json + the assets nba.mjs wrote (tq-raw/nba/assets.json).
import fs from 'node:fs'
import crypto from 'node:crypto'
const RAW = 'C:/dev/scottsdale/tq-raw/nba'
const { players, cutoff } = JSON.parse(fs.readFileSync(new URL('./nba.sources.json', import.meta.url), 'utf8'))
const assets = JSON.parse(fs.readFileSync(RAW + '/assets.json', 'utf8'))
const ABBR = { ATL: 'Atlanta', BOS: 'Boston', BKN: 'Brooklyn', CHA: 'Charlotte', CHI: 'Chicago', CLE: 'Cleveland', DAL: 'Dallas', DEN: 'Denver', DET: 'Detroit', GSW: 'Golden State', HOU: 'Houston', IND: 'Indiana', LAC: 'the Clippers', LAL: 'the Lakers', MEM: 'Memphis', MIA: 'Miami', MIL: 'Milwaukee', MIN: 'Minnesota', NOP: 'New Orleans', NYK: 'New York', OKC: 'Oklahoma City', ORL: 'Orlando', PHI: 'Philadelphia', PHX: 'Phoenix', POR: 'Portland', SAC: 'Sacramento', SAS: 'San Antonio', TOR: 'Toronto', UTA: 'Utah', WAS: 'Washington' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const when = (mm, yy) => `${MONTHS[+mm - 1]} 20${yy}`
function acquired(how) {
  let m
  if ((m = how.match(/^Traded from (\w+) on (\d\d)\/\d\d\/(\d\d)$/))) return `Traded from ${ABBR[m[1]] || m[1]} in ${when(m[2], m[3])}`
  if ((m = how.match(/^Signed on (\d\d)\/\d\d\/(\d\d)$/))) return `Signed in ${when(m[1], m[2])}`
  if ((m = how.match(/^#(\d+) Pick in (\d+) Draft$/))) return `Drafted ${m[1]}th overall in ${m[2]}`
  if ((m = how.match(/^Awarded on Waivers on (\d\d)\/\d\d\/(\d\d)$/))) return `Claimed on waivers in ${when(m[1], m[2])}`
  throw new Error('how? ' + how)
}
const seed = (s) => parseInt(crypto.createHash('sha1').update(s).digest('hex').slice(0, 8), 16)
const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const POS = [0, 2, 1, 3, 3, 1, 2, 0, 1, 3, 0, 2, 2, 0, 3, 1] // blocks of four: every position four times per sixteen
const records = players.map((p, i) => {
  const rng = seed('nba-' + p.personId)
  const decoys = [...p.decoys].sort((a, b) => seed(p.personId + a) - seed(p.personId + b))
  const pos = POS[i % 16]
  const texts = [...decoys]; texts.splice(pos, 0, p.team)
  const ids = ['a', 'b', 'c', 'd']
  const a = assets[p.personId]
  const reach = p.tier === 1 ? 'broad' : p.tier <= 3 ? 'shared' : 'deep'
  return {
    id: 'nba-' + slug(p.name).slice(0, 40),
    category: 'nba',
    tier: p.tier,
    format: 'image',
    prompt: 'Who does he play for?',
    subject: p.name,
    options: texts.map((t, k) => ({ id: ids[k], text: t })),
    answer: ids[pos],
    reveal: `${p.team}. ${acquired(p.how)}.`,
    media: { kind: 'image', src: `/tq/${a.q}.webp`, w: 512, h: 512, mime: 'image/webp' },
    revealMedia: { kind: 'image', src: `/tq/${a.a}.webp`, w: 1040, h: 760 },
    sources: [
      { url: p.url, note: `nba.com player page: ${p.team}, ${p.how}; roster status ${p.status}, #${p.jersey}`, checkedAt: p.checkedAt },
      { url: `https://www.nba.com/team/${''}`.replace(/team\/$/, 'players'), note: 'cross-checked against the ESPN team roster API, same team', checkedAt: p.checkedAt },
    ].map((s, k) => (k === 1 ? { url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams', note: s.note, checkedAt: p.checkedAt } : s)),
    verified: { by: 'web', at: p.checkedAt, cutoff },
    status: 'ready',
    tags: { topics: ['nba'], likely: p.tier <= 2 ? ['Evan', 'Eyob', 'Adi'] : [], possible: p.tier <= 2 ? ['Sahil'] : ['Evan', 'Eyob', 'Adi', 'Sahil'], reach },
    notes: `Roster as of ${cutoff}. A trade after that date changes the answer. Decoys are other teams, not verified past teams.`,
  }
})
fs.mkdirSync('worker/triviaQBank', { recursive: true })
fs.writeFileSync('worker/triviaQBank/nba.json', JSON.stringify(records, null, 2) + '\n')
const pc = [0, 0, 0, 0]; for (const r of records) pc['abcd'.indexOf(r.answer)]++
console.log(records.length, 'records; answer positions', pc.join(','))
