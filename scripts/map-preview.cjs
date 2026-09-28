// Прогон карты местности ВНУТРИ Node: бандл relief.ts+terrain.ts, мок канваса,
// PNG на выходе. Нужно, чтобы проверить отрисовку без браузера и посмотреть
// местность глазами (/-preview/map_*.png).
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const { makeCanvas, makeCtx, encodePNG } = require('./proc-preview.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tmp-preview');

(async () => {
  // ассеты (png/mp3) в Node не нужны — подменяем их заглушкой, как в proc-preview
  const stub = {
    name: 'stub-assets',
    setup(b) {
      b.onResolve({ filter: /\.(png|jpe?g|svg|webp|gif|mp3)$/ }, a => ({ path: a.path, namespace: 'stub-asset' }));
      b.onLoad({ filter: /.*/, namespace: 'stub-asset' }, a => ({ contents: `export default ${JSON.stringify('asset:' + a.path.replace(/^.*\//, ''))};`, loader: 'js' }));
    },
  };
  const res = await esbuild.build({
    entryPoints: [path.join(OUT, 'map-entry.ts')],
    bundle: true, format: 'cjs', write: false, platform: 'node', target: 'node18',
    loader: { '.css': 'empty' }, plugins: [stub],
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  });
  const code = res.outputFiles[0].text;
  global.document = { createElement: () => ({ width: 1, height: 1, getContext: () => null }) };
  new Function(code)();
  const { Terrain, Worldgen, buildField, drawReliefTop, drawHexGridTop } = globalThis.__MAP__;

  // Поле местности из нового генератора: та же сетка, что buildField, но считает
  // worldgen. Объект-заменитель terrain нужен режиму «биомы» (там нужен classAt).
  const fieldOf = (wg, x0, y0, w, h, step) => {
    const nx = Math.max(2, Math.ceil(w / step) + 2), ny = Math.max(2, Math.ceil(h / step) + 2);
    const elev = new Float32Array(nx * ny), moist = new Float32Array(nx * ny), river = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const wx = x0 + i * step, wy = y0 + j * step, k = j * nx + i;
      elev[k] = wg.height(wx, wy); moist[k] = wg.moisture(wx, wy); river[k] = wg.river(wx, wy);
    }
    return { x0, y0, step, nx, ny, elev, moist, river };
  };
  // «Материк или каша»: считаем связные области воды и гор. Один большой океан
  // и несколько озёр — это материковая карта; тысячи луж — шум без формы.
  const blobs = (f, test) => {
    const { nx, ny } = f, seen = new Uint8Array(nx * ny), sizes = [];
    const stack = [];
    for (let k = 0; k < nx * ny; k++) {
      if (seen[k] || !test(k)) continue;
      let n = 0; stack.length = 0; stack.push(k); seen[k] = 1;
      while (stack.length) {
        const c = stack.pop(); n++;
        const cx = c % nx, cy = (c / nx) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = cx + dx, Y = cy + dy;
          if (X < 0 || Y < 0 || X >= nx || Y >= ny) continue;
          const i2 = Y * nx + X;
          if (!seen[i2] && test(i2)) { seen[i2] = 1; stack.push(i2); }
        }
      }
      sizes.push(n);
    }
    sizes.sort((a, b) => b - a);
    const total = nx * ny;
    return { n: sizes.length, biggest: (sizes[0] || 0) / total * 100, over1pct: sizes.filter((z) => z / total > 0.01).length };
  };
  const stats = (f, sea, mountLine, forestLine) => {
    let water = 0, mount = 0, forest = 0;
    const vals = [];
    for (let i = 0; i < f.elev.length; i++) {
      const e = f.elev[i], m = f.moist[i];
      vals.push(e);
      if (e < sea) water++;
      if (e > mountLine) mount++;
      if (e >= sea && m > forestLine) forest++;
    }
    vals.sort((a, b) => a - b);
    const p = (q) => vals[Math.floor(q * (vals.length - 1))];
    return {
      water: (water / f.elev.length * 100), mount: (mount / f.elev.length * 100), forest: (forest / f.elev.length * 100),
      p05: p(0.05), med: p(0.5), p95: p(0.95),
    };
  };

  const WORLD = 48000;
  const seed = Number(process.argv[2] || 20250929);
  const SEED = seed;
  const t = new Terrain(SEED);
  const wg = new Worldgen(SEED, 0.42, 7);
  const seaNew = (wg.fit(0.30), wg.sea);            // границы подогнаны под доли карты
  const srcs = [
    // старый terrain.ts: пороги из его classAt (горы > 0.78, лес при влажности > 0.66)
    { name: 'old', field: (x0, y0, w, h, step) => buildField(t, x0, y0, w, h, step), cls: (x, y) => t.classAt(x, y), sea: 0.13, mountLine: 0.78, forestLine: 0.66 },
    { name: 'new', field: (x0, y0, w, h, step) => fieldOf(wg, x0, y0, w, h, step), cls: (x, y) => wg.classAt(x, y), sea: seaNew, mountLine: wg.mountLine, forestLine: wg.forestLine },
  ];
  const views = [
    { tag: 'world', wx: 0, wy: 0, perPx: WORLD / 620, w: 620, h: 620, grid: false },
    { tag: 'win', wx: WORLD / 2 - 760 * 8 / 2, wy: WORLD / 2 - 560 * 8 / 2, perPx: 8, w: 760, h: 560, grid: true },
  ];
  for (const s of srcs) {
    for (const v of views) {
      const t0 = Date.now();
      const f = s.field(v.wx - v.perPx * 2, v.wy - v.perPx * 2, v.w * v.perPx + v.perPx * 4, v.h * v.perPx + v.perPx * 4, v.perPx * 2);
      const cv = makeCanvas(v.w, v.h), ctx = makeCtx(cv);
      drawReliefTop(ctx, f, { classAt: s.cls }, v, 'relief', s.sea, true);
      if (v.grid) drawHexGridTop(ctx, v);
      fs.writeFileSync(path.join(OUT, `map_${s.name}_${v.tag}.png`), encodePNG(v.w, v.h, cv.data));
      const st = stats(f, s.sea, s.mountLine, s.forestLine);
      const wb = blobs(f, (k) => f.elev[k] < s.sea), mb = blobs(f, (k) => f.elev[k] > s.mountLine);
      st.water1 = wb.biggest; st.waterN = wb.n; st.mount1 = mb.biggest; st.mountN = mb.n;
      console.log(`${s.name}/${v.tag}: море ${st.water.toFixed(1)}% (крупнейшее ${st.water1.toFixed(1)}%, областей ${st.waterN}) · горы ${st.mount.toFixed(1)}% (хребтов ${st.mountN}, крупнейший ${st.mount1.toFixed(1)}%) · лес ${st.forest.toFixed(1)}%`);
    }
  }
  console.log(`\nуровень моря: старый 0.130 (жёстко), новый ${seaNew.toFixed(3)} (подогнан под 30% воды)`);
  console.log(`PNG: tmp-preview/map_world.png, tmp-preview/map_win.png (сид ${seed})`);
})();
