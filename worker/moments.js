/* D11, the photo desk: weekend photos guests add from their phones.

   Storage. Every photo is two Durable Object values, the re-encoded JPEG
   (`moment:full:<id>`) and its grid thumbnail (`moment:thumb:<id>`), plus
   one index (`moment:index`) of small records. Nothing here lives in the
   tournament "state" value: a photo is not tournament truth, and keeping the
   bytes out of state keeps that value far from the per-value limit.

   Snapshots. The whole `moment:` prefix is NOT portable (worker/snapshot.js):
   a portable snapshot is one JSON body capped at 8 MB and 256 entries, and
   every rewind or reset copies every portable key into an internal backup in
   one transaction. A weekend of photos would break both. Photos are kept
   instead by their own export (`npm run moments:export`, the runbook), and a
   restore, a reset or a QA rewind never touches them.

   Frames. A state frame carries only the index's public records
   ({ id, by, at, takenAt, w, h }); hidden photos only for the commissioner
   (with `hidden:true`). No record ever holds a device id: a guest's delete is
   authorised by their device's current claim against `by`.

   The bytes. The phone resizes and re-encodes (which drops EXIF); the server
   still reads the JPEG itself for its real size, and strips any APP1 (EXIF,
   XMP), APP13 (IPTC) or comment segment before storing, so no location can
   reach another phone. */

const MOMENT_PREFIX = "moment:";
const MOMENT_INDEX_KEY = "moment:index";
const momentFullKey = id => `moment:full:${id}`;
const momentThumbKey = id => `moment:thumb:${id}`;
const MOMENT_ID = /^m[a-z0-9]{10,32}$/;

const MOMENT_LIMITS = Object.freeze({
  /* the phone sends ~1600px at JPEG 0.8, typically 250 to 700 KB */
  fullBytes:1_500_000,
  thumbBytes:160_000,
  /* whole multipart body: both files plus the form's own framing */
  bodyBytes:1_500_000 + 160_000 + 32_000,
  maxSide:2400,
  minSide:64,
  /* the desk as a whole */
  count:200,
  totalBytes:150 * 1024 * 1024,
  perPlayer:40,
  /* per player (whichever device), a sliding window */
  rateWindowMs:60_000,
  ratePerWindow:12,
  /* takenAt is a hint from the phone; never later than now, never ancient */
  takenAtFloorMs:60 * 24 * 60 * 60 * 1000,
});

const isMomentStorageKey = key => typeof key === "string" && key.startsWith(MOMENT_PREFIX);

/* ── JPEG reading ── */
const SOF = new Set([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF]);
/* segments that can carry who, where or when: EXIF/XMP, IPTC, comments */
const METADATA_MARKERS = new Set([0xE1, 0xED, 0xFE]);

const asBytes = value => value instanceof Uint8Array ? value
  : value instanceof ArrayBuffer ? new Uint8Array(value)
    : ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : null;

/* Walk the segments before the scan. Returns { width, height, segments }
   or null when this is not a readable baseline/progressive JPEG. */
function readJpeg(input) {
  const bytes = asBytes(input);
  if (!bytes || bytes.length < 16 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  const segments = [];
  let i = 2, width = 0, height = 0;
  while (i < bytes.length) {
    if (bytes[i] !== 0xFF) return null;
    while (bytes[i] === 0xFF && i < bytes.length) i++;
    const marker = bytes[i];
    const start = i - 1;
    i++;
    if (marker === undefined) return null;
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
    if (marker === 0xD9) return null;
    if (i + 1 >= bytes.length) return null;
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > bytes.length) return null;
    if (SOF.has(marker)) {
      if (length < 7) return null;
      height = (bytes[i + 3] << 8) | bytes[i + 4];
      width = (bytes[i + 5] << 8) | bytes[i + 6];
    }
    if (marker === 0xDA) {
      segments.push({ marker, start, end:bytes.length });
      return width && height ? { width, height, segments, bytes } : null;
    }
    segments.push({ marker, start, end:i + length });
    i += length;
  }
  return null;
}

function jpegInfo(input) {
  const read = readJpeg(input);
  return read ? { width:read.width, height:read.height } : null;
}

/* The same JPEG without EXIF/XMP, IPTC or comment segments. */
function stripJpegMetadata(input) {
  const read = readJpeg(input);
  if (!read) return null;
  const kept = read.segments.filter(segment => !METADATA_MARKERS.has(segment.marker));
  const size = 2 + kept.reduce((sum, segment) => sum + segment.end - segment.start, 0);
  const out = new Uint8Array(size);
  out[0] = 0xFF; out[1] = 0xD8;
  let at = 2;
  for (const segment of kept) {
    out.set(read.bytes.subarray(segment.start, segment.end), at);
    at += segment.end - segment.start;
  }
  return out;
}

/* ── the index ── */
const cleanRecord = record => {
  if (!record || typeof record !== "object" || !MOMENT_ID.test(record.id || "")) return null;
  if (typeof record.by !== "string" || !record.by) return null;
  const out = {
    id:record.id,
    by:record.by,
    at:Number(record.at) || 0,
    takenAt:Number(record.takenAt) || Number(record.at) || 0,
    w:Math.max(0, Math.round(Number(record.w) || 0)),
    h:Math.max(0, Math.round(Number(record.h) || 0)),
    bytes:Math.max(0, Number(record.bytes) || 0),
    thumbBytes:Math.max(0, Number(record.thumbBytes) || 0),
  };
  if (record.hidden === true) {
    out.hidden = true;
    out.hiddenAt = Number(record.hiddenAt) || 0;
  }
  return out;
};

/* newest first, unique ids */
function cleanMomentIndex(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const record = cleanRecord(item);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    out.push(record);
  }
  return out.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
}

const deskBytes = index => index.reduce((sum, record) => sum + record.bytes + record.thumbBytes, 0);

/* What a frame may carry: public records, hidden ones only for the
   commissioner. Never the byte counts, never who hid it. */
function publicMoments(index, { isGm = false } = {}) {
  const out = [];
  for (const record of Array.isArray(index) ? index : []) {
    if (record.hidden && !isGm) continue;
    const item = { id:record.id, by:record.by, at:record.at, takenAt:record.takenAt, w:record.w, h:record.h };
    if (record.hidden) item.hidden = true;
    out.push(item);
  }
  return out;
}

/* Whether one more photo of these sizes fits: the desk's count and bytes,
   and this player's own share. */
function admitMoment(index, { by, bytes, thumbBytes }) {
  if (index.length >= MOMENT_LIMITS.count)
    return { ok:false, status:409, error:"The photo desk is full" };
  if (deskBytes(index) + bytes + thumbBytes > MOMENT_LIMITS.totalBytes)
    return { ok:false, status:409, error:"The photo desk is full" };
  if (index.filter(record => record.by === by).length >= MOMENT_LIMITS.perPlayer)
    return { ok:false, status:409, error:`You have ${MOMENT_LIMITS.perPlayer} photos up. Delete one first` };
  return { ok:true };
}

/* A guest removes their own; the commissioner removes any. */
const canRemoveMoment = (record, { player = null, isGm = false } = {}) =>
  !!record && (isGm || (!!player && record.by === player));

function clampTakenAt(value, now) {
  const at = Number(value);
  if (!Number.isFinite(at) || at <= 0) return now;
  return Math.min(now, Math.max(now - MOMENT_LIMITS.takenAtFloorMs, Math.round(at)));
}

/* sliding window per key; returns false when the key is over */
function takeRate(windows, key, now) {
  const recent = (windows.get(key) || []).filter(at => now - at < MOMENT_LIMITS.rateWindowMs);
  if (recent.length >= MOMENT_LIMITS.ratePerWindow) {
    windows.set(key, recent);
    return false;
  }
  recent.push(now);
  windows.set(key, recent);
  return true;
}

const newMomentId = () => `m${Date.now().toString(36)}${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;

const json = (body, status = 200) => Response.json(body, { status, headers:{ "Cache-Control":"no-store" } });
const jpeg = (bytes, cache) => new Response(bytes, { headers:{ "Content-Type":"image/jpeg", "Cache-Control":cache } });

async function blobBytes(value) {
  if (!value || typeof value === "string" || typeof value.arrayBuffer !== "function") return null;
  if (value.type && value.type !== "image/jpeg") return null;
  return new Uint8Array(await value.arrayBuffer());
}

/* The desk's HTTP surface, bound to one Durable Object.
     storage     the DO's ctx.storage
     playerFor   deviceId -> active roster player it claims, or null
     isGmToken   async token -> boolean
     onChange    after any change to the index: re-send every socket's frame
   Routes:
     POST   /api/moments               multipart { photo, thumb, takenAt }, X-Field-Day-Device
     GET    /api/moments/<id>          the photo (hidden: commissioner only)
     GET    /api/moments/<id>/thumb    its thumbnail
     DELETE /api/moments/<id>          the author's device, or the commissioner
     POST   /api/moments/<id>          { hidden } commissioner only */
class MomentDesk {
  constructor({ storage, playerFor, isGmToken, onChange = () => {}, now = () => Date.now(), newId = newMomentId }) {
    this.storage = storage;
    this.playerFor = playerFor;
    this.isGmToken = isGmToken;
    this.onChange = onChange;
    this.now = now;
    this.newId = newId;
    this.index = [];
    this.windows = new Map();
    this.gate = Promise.resolve();
  }

  async load() {
    this.index = cleanMomentIndex(await this.storage.get(MOMENT_INDEX_KEY));
    return this.index;
  }

  publicList(viewer) { return publicMoments(this.index, viewer); }

  /* index writes one at a time, so two uploads never read the same list */
  serial(work) {
    const run = this.gate.then(work, work);
    this.gate = run.catch(() => null);
    return run;
  }

  async gmFrom(req) {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("X-Field-Day-GM-Token");
    return !!token && !!await this.isGmToken(token);
  }

  deviceFrom(req) {
    const id = req.headers.get("X-Field-Day-Device") || "";
    return id && id.length <= 200 ? id : "";
  }

  async handle(req, url) {
    const parts = url.pathname.split("/").filter(Boolean); // ["api","moments",id?,"thumb"?]
    if (parts.length === 2) {
      if (req.method === "POST") return this.upload(req);
      return json({ ok:false, error:"Method not allowed" }, 405);
    }
    const id = parts[2];
    if (!MOMENT_ID.test(id || "") || parts.length > 4 || (parts.length === 4 && parts[3] !== "thumb"))
      return json({ ok:false, error:"Not found" }, 404);
    if (req.method === "GET") return this.read(req, id, parts[3] === "thumb");
    if (parts.length === 4) return json({ ok:false, error:"Method not allowed" }, 405);
    if (req.method === "DELETE") return this.remove(req, id);
    if (req.method === "POST") return this.moderate(req, id);
    return json({ ok:false, error:"Method not allowed" }, 405);
  }

  async read(req, id, thumb, { admin = false } = {}) {
    const record = this.index.find(item => item.id === id);
    if (!record) return new Response("Not found", { status:404 });
    const privileged = admin || (record.hidden && await this.gmFrom(req));
    if (record.hidden && !privileged) return new Response("Not found", { status:404 });
    const bytes = await this.storage.get(thumb ? momentThumbKey(id) : momentFullKey(id));
    if (!bytes) return new Response("Not found", { status:404 });
    /* an id never changes its bytes; a hidden photo is never cached */
    return jpeg(bytes, record.hidden || admin ? "no-store" : "public, max-age=31536000, immutable");
  }

  async upload(req) {
    const player = this.playerFor(this.deviceFrom(req));
    if (!player) return json({ ok:false, error:"Check in first" }, 403);
    const declared = Number(req.headers.get("Content-Length") || 0);
    if (declared > MOMENT_LIMITS.bodyBytes) return json({ ok:false, error:"That photo is too large" }, 413);
    const now = this.now();
    if (!takeRate(this.windows, player, now))
      return json({ ok:false, error:"Wait a minute, then add more" }, 429);

    let form;
    try { form = await req.formData(); } catch { return json({ ok:false, error:"That photo could not be read" }, 400); }
    const [full, small] = await Promise.all([blobBytes(form.get("photo")), blobBytes(form.get("thumb"))]);
    if (!full || !small) return json({ ok:false, error:"That photo could not be read" }, 400);
    if (full.byteLength > MOMENT_LIMITS.fullBytes || small.byteLength > MOMENT_LIMITS.thumbBytes)
      return json({ ok:false, error:"That photo is too large" }, 413);
    const photo = stripJpegMetadata(full);
    const thumb = stripJpegMetadata(small);
    const info = photo && jpegInfo(photo);
    if (!info || !thumb) return json({ ok:false, error:"That photo could not be read" }, 400);
    if (Math.max(info.width, info.height) > MOMENT_LIMITS.maxSide
        || Math.min(info.width, info.height) < MOMENT_LIMITS.minSide)
      return json({ ok:false, error:"That photo could not be read" }, 400);

    return this.serial(async () => {
      const admitted = admitMoment(this.index, { by:player, bytes:photo.byteLength, thumbBytes:thumb.byteLength });
      if (!admitted.ok) return json({ ok:false, error:admitted.error }, admitted.status);
      const record = cleanRecord({
        id:this.newId(), by:player, at:now, takenAt:clampTakenAt(form.get("takenAt"), now),
        w:info.width, h:info.height, bytes:photo.byteLength, thumbBytes:thumb.byteLength,
      });
      const next = cleanMomentIndex([record, ...this.index]);
      /* bytes and index land in one write: a failure leaves neither */
      await this.storage.put({
        [momentFullKey(record.id)]:photo,
        [momentThumbKey(record.id)]:thumb,
        [MOMENT_INDEX_KEY]:next,
      });
      this.index = next;
      this.onChange();
      return json({ ok:true, moment:publicMoments([record])[0] });
    });
  }

  async remove(req, id) {
    const isGm = await this.gmFrom(req);
    const player = this.playerFor(this.deviceFrom(req));
    return this.serial(async () => {
      const record = this.index.find(item => item.id === id);
      /* a second tap after it is gone is already done */
      if (!record) return json({ ok:true, unchanged:true });
      if (!canRemoveMoment(record, { player, isGm }))
        return json({ ok:false, error:"Only its author or the commissioner can delete it" }, 403);
      const next = this.index.filter(item => item.id !== id);
      await this.storage.put(MOMENT_INDEX_KEY, next);
      await this.storage.delete([momentFullKey(id), momentThumbKey(id)]);
      this.index = next;
      this.onChange();
      return json({ ok:true });
    });
  }

  async moderate(req, id) {
    if (!await this.gmFrom(req)) return json({ ok:false, error:"Commissioner only" }, 403);
    let body;
    try { body = await req.json(); } catch { body = null; }
    if (typeof body?.hidden !== "boolean") return json({ ok:false, error:"Say hidden true or false" }, 400);
    return this.serial(async () => {
      const record = this.index.find(item => item.id === id);
      if (!record) return json({ ok:false, error:"That photo is gone" }, 404);
      if (!!record.hidden === body.hidden) return json({ ok:true, unchanged:true });
      const next = cleanMomentIndex(this.index.map(item => item.id !== id ? item
        : body.hidden ? { ...item, hidden:true, hiddenAt:this.now() } : { ...item, hidden:false }));
      await this.storage.put(MOMENT_INDEX_KEY, next);
      this.index = next;
      this.onChange();
      return json({ ok:true });
    });
  }

  /* the commissioner export (scripts/snapshot.mjs moments): every record,
     hidden included, and the bytes of any one */
  adminIndex() {
    return {
      ok:true,
      moments:this.index.map(({ id, by, at, takenAt, w, h, bytes, hidden }) =>
        ({ id, by, at, takenAt, w, h, bytes, ...(hidden ? { hidden:true } : {}) })),
      count:this.index.length,
      bytes:deskBytes(this.index),
      limits:{ count:MOMENT_LIMITS.count, totalBytes:MOMENT_LIMITS.totalBytes },
    };
  }
}

export {
  MOMENT_PREFIX,
  MOMENT_INDEX_KEY,
  MOMENT_ID,
  MOMENT_LIMITS,
  MomentDesk,
  admitMoment,
  canRemoveMoment,
  clampTakenAt,
  cleanMomentIndex,
  deskBytes,
  isMomentStorageKey,
  jpegInfo,
  momentFullKey,
  momentThumbKey,
  publicMoments,
  stripJpegMetadata,
  takeRate,
};
