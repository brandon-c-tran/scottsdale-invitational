// Rebuilds the NBA headshot assets from tq-raw/nba (downloads missing originals from cdn.nba.com).
// node scripts/tq/nba.mjs [--contact]   writes public/tq/<hash>.webp (neutral crop) and <hash>.webp (reveal, full)
import fs from 'node:fs'
import crypto from 'node:crypto'
import sharp from 'sharp'
const RAW = 'C:/dev/scottsdale/tq-raw/nba'
const SALT = 'tq-nba-v1'
const { players } = JSON.parse(fs.readFileSync(new URL('./nba.sources.json', import.meta.url), 'utf8'))
export const srcUrl = (id) => `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`
export const hashOf = (url, kind) => crypto.createHash('sha1').update(url + '|' + kind + '|' + SALT).digest('hex').slice(0, 12)
// crop box (source px) around the face; 1040x760 headshots centre the face
const CROP = { left: 300, top: 20, width: 440, height: 440 }
fs.mkdirSync(RAW + '/head', { recursive: true })
fs.mkdirSync(new URL('../../public/tq/', import.meta.url), { recursive: true })
const out = {}
for (const p of players) {
  const url = srcUrl(p.personId)
  const f = `${RAW}/head/${p.personId}.png`
  if (!fs.existsSync(f)) {
    const r = await fetch(url)
    if (!r.ok) { console.log('MISSING', p.name, r.status); continue }
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()))
  }
  const q = hashOf(url, 'q'), a = hashOf(url, 'a')
  // neutral: crop to the face, then fade everything below the chin to flat gray so no jersey colour or lettering shows
  const face = await sharp(f).extract(CROP).resize(512, 512).toBuffer()
  const mask = Buffer.from(`<svg width="512" height="512"><defs><radialGradient id="g" cx="50%" cy="42%" r="52%"><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs><rect width="512" height="512" fill="url(#g)"/></svg>`)
  const bg = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#3a3d45' } }).png().toBuffer()
  const masked = await sharp(face).ensureAlpha().composite([{ input: await sharp(mask).png().toBuffer(), blend: 'dest-in' }]).png().toBuffer()
  await sharp(bg).composite([{ input: masked }]).webp({ quality: 82 }).toFile(`public/tq/${q}.webp`)
  await sharp(f).webp({ quality: 82 }).toFile(`public/tq/${a}.webp`)
  out[p.personId] = { q, a, name: p.name }
}
fs.writeFileSync(RAW + '/assets.json', JSON.stringify(out, null, 1))
if (process.argv.includes('--contact')) {
  const ids = Object.keys(out), cols = 9, cell = 160
  const rows = Math.ceil(ids.length / cols)
  const comps = []
  for (let i = 0; i < ids.length; i++) comps.push({ input: await sharp(`public/tq/${out[ids[i]].q}.webp`).resize(cell, cell).toBuffer(), left: (i % cols) * cell, top: Math.floor(i / cols) * cell })
  await sharp({ create: { width: cols * cell, height: rows * cell, channels: 3, background: '#000' } }).composite(comps).jpeg().toFile(RAW + '/contact.jpg')
}
console.log(Object.keys(out).length, 'assets')
