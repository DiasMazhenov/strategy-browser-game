// Генерация превью пиксель-арта в PNG без браузера: минимальный canvas-полифилл.
const { PNG } = require('pngjs');
const fs = require('fs');

function makeCanvas(w, h) {
  const cv = { width: w, height: h, data: new Uint8Array(w * h * 4).fill(0) };
  cv.getContext = () => ctx2d(cv);
  return cv;
}
function ctx2d(cv) {
  let fillColor = [0, 0, 0, 255];
  const fill = (x, y, w, h) => {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(cv.width, Math.ceil(x + w)), y1 = Math.min(cv.height, Math.ceil(y + h));
    const [r, g, b, a] = fillColor;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = (yy * cv.width + xx) * 4;
      const na = a / 255, oa = cv.data[i + 3] / 255;
      const out = na + oa * (1 - na);
      if (out <= 0) continue;
      cv.data[i] = (r * na + cv.data[i] * oa * (1 - na)) / out;
      cv.data[i + 1] = (g * na + cv.data[i + 1] * oa * (1 - na)) / out;
      cv.data[i + 2] = (b * na + cv.data[i + 2] * oa * (1 - na)) / out;
      cv.data[i + 3] = out * 255;
    }
  };
  function parseColor(c) {
    if (c.startsWith('#')) {
      let h = c.slice(1);
      if (h.length === 3) h = h.split('').map(s => s + s).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(',').map(s => parseFloat(s.trim()));
      return [p[0], p[1], p[2], Math.round((p[3] === undefined ? 1 : p[3]) * 255)];
    }
    return [255, 0, 255, 255];
  }
  const c2 = {
    fillStyle: '#000',
    fillStyle: '#000',
    set strokeStyle(c) { }, get strokeStyle() { return ''; },
    lineWidth: 0,
    beginPath() { }, moveTo() { }, lineTo() { }, closePath() { },
    stroke() { },
    set fillStyle(c) { fillColor = parseColor(c); }, get fillStyle() { return ''; },
    fillRect(x, y, w, h) { fill(x, y, w, h); },
    arc() { }, ellipse() { },
    drawImage() { },
    save() { }, restore() { },
    translate() { }, scale() { }, rotate() { },
    set imageSmoothingEnabled(_) { },
    globalAlpha: 1,
    globalCompositeOperation: '',
    fillText() { },
    setLineDash() { },
    roundRect() { },
  };
  return c2;
}

global.document = {
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas(400, 400);
    return {};
  },
};

// подменяем размеры канваса в getBldArt через хук: модуль сам ставит width/height
// обернём createElement, чтобы возвращать холст нужного размера
const { execSync } = require('child_process');
// Скомпилируем ts через esm? используем tsx? Проще: скопируем логику через vite-бинарь —
// вместо этого рендерим транспилированный модуль через TypeScript require
try {
  require('ts-node/register');
} catch { /* noop */ }

const ts = require('typescript');
// конфиг транспилируем и подставляем прямо в модуль
const cfgSrc = fs.readFileSync('src/game/config.ts', 'utf8');
const cfgOut = ts.transpileModule(cfgSrc, { compilerOptions: { module: 'commonjs', target: 'es2020' } }).outputText;
let tsSrc = fs.readFileSync('src/game/pixelart.ts', 'utf8');
let out = ts.transpileModule(tsSrc, { compilerOptions: { module: 'commonjs', target: 'es2020' } }).outputText;
// инлайним конфиг: объявляем config_1 с его экспортами
const cfgBody = cfgOut.replace(/"use strict";/, '').replace(/Object\.defineProperty\(exports[^;]+;/g, '');
const cfgInline = `const config_1 = (() => { const exports = {}; ${cfgBody}; return exports; })();`;
out = out.replace(/const config_1 = require\(["']\.\/config["']\);/, cfgInline);
const Module = require('module');
const m = new Module('pixelart');
m._compile(out, __dirname + '/pixelart-virtual.js');
const PA = m.exports;

function cvToPng(cv, path) {
  const png = new PNG({ width: cv.width, height: cv.height });
  png.data = cv.data;
  fs.writeFileSync(path, PNG.sync.write(png));
}

// ── здания ──
const keys = ['towncenter', 'house', 'barracks', 'stable', 'blacksmith', 'market', 'tower', 'farm'];
const sheet = makeCanvas(400 * 4, 360 * 2);
const sctx = ctx2d(sheet);
// фон — трава
sctx.fillStyle = '#5b8a3a';
sctx.fillRect(0, 0, sheet.width, sheet.height);
keys.forEach((k, i) => {
  const art = PA.getBldArt(k);
  const col = i % 4, row = (i / 4) | 0;
  // вручную блитим канвас здания на лист
  const dx = col * 400 + (400 - art.img.width) / 2 - art.cx + 200;
  const dy = row * 360 + 220 - art.cy;
  for (let y = 0; y < art.img.height; y++) for (let x = 0; x < art.img.width; x++) {
    const si = (y * art.img.width + x) * 4;
    if (art.img.data[si + 3] === 0) continue;
    const tx = Math.floor(x + dx), ty = Math.floor(y + dy);
    const ti = (ty * sheet.width + tx) * 4;
    sheet.data[ti] = art.img.data[si];
    sheet.data[ti + 1] = art.img.data[si + 1];
    sheet.data[ti + 2] = art.img.data[si + 2];
    sheet.data[ti + 3] = 255;
  }
});
cvToPng(sheet, '/tmp/preview-buildings.png');

// ── юниты: кадры ходьбы/атаки ──
const unitSheet = makeCanvas(360 * 4, 200 * 5);
const uctx = ctx2d(unitSheet);
uctx.fillStyle = '#5b8a3a';
uctx.fillRect(0, 0, unitSheet.width, unitSheet.height);
const ukeys = ['villager', 'swordsman', 'archer', 'spearman', 'knight', 'cavalry', 'catapult', 'monk', 'wolf'];
ukeys.forEach((k, i) => {
  const col = i % 4, row = (i / 4) | 0;
  const baseX = col * 360 + 90, baseY = row * 200 + 130;
  const owner = k === 'wolf' ? 'neutral' : 'player';
  // 2 кадра: покой, шаг
  const frames = [
    { face: 1, anim: 0, atkAnim: 0, state: 'idle', x: 0 },
    { face: 1, anim: Math.PI / 2, atkAnim: 0, state: 'move', x: 70 },
    { face: 1, anim: Math.PI / 2, atkAnim: 1, state: 'move', x: 140 },
    { face: -1, anim: Math.PI, atkAnim: 0, state: 'move', x: 210 },
  ];
  for (const fr of frames) {
    const cv = makeCanvas(120, 120);
    const c = ctx2d(cv);
    PA.drawPixelUnit(c, { key: k, owner, face: fr.face, anim: fr.anim, atkAnim: fr.atkAnim, state: fr.state, carry: { type: 'wood', amt: k === 'villager' ? 10 : 0 } }, 60, 70, 0.5, false);
    for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
      const si = (y * 120 + x) * 4;
      if (cv.data[si + 3] === 0) continue;
      const tx = baseX + fr.x + x - 60, ty = baseY + y - 70;
      if (tx < 0 || ty < 0 || tx >= unitSheet.width || ty >= unitSheet.height) continue;
      const ti = (ty * unitSheet.width + tx) * 4;
      unitSheet.data[ti] = cv.data[si];
      unitSheet.data[ti + 1] = cv.data[si + 1];
      unitSheet.data[ti + 2] = cv.data[si + 2];
      unitSheet.data[ti + 3] = 255;
    }
  }
});
cvToPng(unitSheet, '/tmp/preview-units.png');
console.log('previews written');
