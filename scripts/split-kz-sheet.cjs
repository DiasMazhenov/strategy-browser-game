// Режет лист-«двойник» казахского юнита (две фигуры на magenta-фоне, СЛЕВА — вид СЗАДИ,
// СПРАВА — вид СПЕРЕДИ) на два кадра kz_<name>_b.png (спина) и kz_<name>_f.png (перёд).
// Фигуры разделяются по связным компонентам после вырезки magenta, сортируются слева-направо.
// Запуск: node scripts/split-kz-sheet.cjs <name> <targetH>
//   пример: node scripts/split-kz-sheet.cjs kz_swordsman 150
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const RAW = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units', 'kz', 'raw');
const OUT = path.join(__dirname, '..', 'src', 'assets', 'sprites', 'units', 'kz');
const name = process.argv[2];
const TARGET_H = parseInt(process.argv[3] || '150', 10);
if (!name) { console.error('usage: split-kz-sheet.cjs <name> [targetH]'); process.exit(1); }

function decodePNG(file) {
  const data = fs.readFileSync(file);
  let pos = 8, idat = Buffer.alloc(0), W = 0, H = 0, ct = 0;
  while (pos < data.length) {
    const ln = data.readUInt32BE(pos), typ = data.slice(pos + 4, pos + 8).toString();
    const chunk = data.slice(pos + 8, pos + 8 + ln);
    if (typ === 'IHDR') { W = chunk.readUInt32BE(0); H = chunk.readUInt32BE(4); ct = chunk[9]; }
    else if (typ === 'IDAT') idat = Buffer.concat([idat, chunk]);
    pos += 12 + ln;
  }
  const ch = ct === 6 ? 4 : 3, raw = zlib.inflateSync(idat);
  const stride = W * ch, out = Buffer.alloc(H * stride);
  let p = 0; const prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const f = raw[p++], line = raw.slice(p, p + stride); p += stride; const cur = Buffer.from(line);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) cur[x] = (cur[x] + a) & 255; else if (f === 2) cur[x] = (cur[x] + b) & 255;
      else if (f === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    cur.copy(out, y * stride); cur.copy(prev);
  }
  return { W, H, ch, data: out };
}
const CRC_T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function encodePNG(W, H, rgba) {
  const stride = W * 4, raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const comp = zlib.deflateSync(raw, { level: 9 });
  const chunk = (typ, body) => { const b = Buffer.alloc(12 + body.length); b.writeUInt32BE(body.length, 0); b.write(typ, 4); body.copy(b, 8); b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(typ), body])), 8 + body.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', comp), chunk('IEND', Buffer.alloc(0))]);
}

// режим: по умолчанию лист «слева=спина(_b), справа=перёд(_f)»;
// mode='walk' — лист двух фаз шага (обе в профиль): слева фаза A (_wa), справа фаза B (_wb)
const mode = process.argv[4] || 'fb';
const rawName =
  mode === 'walk' ? name + '_walk_raw.png' :
  mode === 'fwalk' ? name + '_fwalk_raw.png' :
  mode === 'bwalk' ? name + '_bwalk_raw.png' :
  name + '_sheet_raw.png';
const file = path.join(RAW, rawName);
if (!fs.existsSync(file)) { console.error('missing', file); process.exit(1); }
let { W, H, ch, data } = decodePNG(file);
const isMag = (idx) => { const r = data[idx], g = data[idx + 1], b = data[idx + 2]; return r > 170 && b > 150 && g < 120 && (r - g) > 80 && (b - g) > 60; };
// карта непрозрачного (не magenta)
const solid = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) solid[i] = isMag(i * ch) ? 0 : 1;
// связные компоненты
const lbl = new Int32Array(W * H); const comps = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const idx = y * W + x; if (!solid[idx] || lbl[idx]) continue;
  const id = comps.length; comps.push({ cells: [], minX: x, maxX: x, minY: y, maxY: y });
  const stk = [idx]; lbl[idx] = id + 1;
  while (stk.length) { const j = stk.pop(); const c = comps[id]; c.cells.push(j);
    const jx = j % W, jy = (j / W) | 0; if (jx < c.minX) c.minX = jx; if (jx > c.maxX) c.maxX = jx; if (jy < c.minY) c.minY = jy; if (jy > c.maxY) c.maxY = jy;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = jx + dx, ny = jy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const k = ny * W + nx; if (solid[k] && !lbl[k]) { lbl[k] = id + 1; stk.push(k); } } }
}
// берём 2 крупнейшие компоненты (две фигуры), сортируем по minX
comps.sort((a, b) => b.cells.length - a.cells.length);
const figs = comps.slice(0, 2).sort((a, b) => a.minX - b.minX);
if (figs.length < 2) { console.error('found', figs.length, 'figures for', name); process.exit(1); }
// figs[0] = слева = СПИНА (b), figs[1] = справа = ПЕРЁД (f)
function emit(fig, suffix) {
  const cw = fig.maxX - fig.minX + 1, chh = fig.maxY - fig.minY + 1;
  const scale = TARGET_H / chh;
  const dw = Math.max(1, Math.round(cw * scale)), dh = TARGET_H;
  const out = Buffer.alloc(dw * dh * 4);
  const px = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  for (let dy = 0; dy < dh; dy++) {
    const sy = fig.minY + Math.min(chh - 1, Math.floor((dy + 0.5) / scale));
    for (let dx = 0; dx < dw; dx++) {
      const sx = fig.minX + Math.min(cw - 1, Math.floor((dx + 0.5) / scale));
      const o = (dy * dw + dx) * 4;
      if (!solid[sy * W + sx]) { out[o + 3] = 0; continue; }
      const c = px(sx, sy); out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
  // чистка magenta/пурпурной каймы
  for (let i = 0; i < dw * dh; i++) { const o = i * 4; if (out[o + 3] === 0) continue;
    if (out[o] > 150 && out[o + 2] > 140 && out[o + 1] < out[o] - 40 && out[o + 1] < out[o + 2] - 30) out[o + 3] = 0; }
  // стереть чёрную линию-«землю» у нижней кромки (near-black пиксели нижних рядов; сапоги коричневые — не трём)
  for (let y = dh - 1; y >= dh - 5; y--) for (let x = 0; x < dw; x++) {
    const o = (y * dw + x) * 4; if (out[o + 3] === 0) continue;
    if (Math.max(out[o], out[o + 1], out[o + 2]) < 46) out[o + 3] = 0;
  }
  for (let pass = 0; pass < 2; pass++) { const kill = [];
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const o = (y * dw + x) * 4; if (out[o + 3] === 0) continue;
      const ne = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => { const nx=x+dx,ny=y+dy; return nx<0||ny<0||nx>=dw||ny>=dh||out[(ny*dw+nx)*4+3]===0; });
      if (ne && out[o] > 120 && out[o + 2] > 120 && Math.abs(out[o] - out[o + 2]) < 70 && out[o + 1] < (out[o] + out[o + 2]) / 2 - 40) kill.push(o); }
    for (const o of kill) out[o + 3] = 0;
  }
  fs.writeFileSync(path.join(OUT, name + suffix + '.png'), encodePNG(dw, dh, out));
  let by = -1; for (let y = dh - 1; y >= 0 && by < 0; y--) for (let x = 0; x < dw; x++) if (out[(y * dw + x) * 4 + 3] > 110) { by = y; break; }
  let sxv = 0, n = 0; for (let y = Math.max(0, by - 8); y <= by; y++) for (let x = 0; x < dw; x++) if (out[(y * dw + x) * 4 + 3] > 110) { sxv += x; n++; }
  const ax = Math.round((n ? sxv / n : dw / 2) * 10) / 10;
  console.log(`  "${name}${suffix}": { "ax": ${ax}, "ay": ${by + 1}, "baseW": ${dw}, "w": ${dw}, "h": ${dh} },`);
}
const sufA = mode === 'walk' ? '_wa' : mode === 'bwalk' ? '_wba' : '_fwa'; // слева
const sufB = mode === 'walk' ? '_wb' : mode === 'bwalk' ? '_wbb' : '_fwb'; // справа
// fb: слева=спина(_b), справа=перёд(_f); walk: боковые фазы _wa/_wb;
// fwalk: перёд-ходьба _fwa/_fwb; bwalk: спина-ходьба _wba/_wbb
if (mode === 'fb') { emit(figs[0], '_b'); emit(figs[1], '_f'); }
else { emit(figs[0], sufA); emit(figs[1], sufB); }
console.log('split done', name);
