import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 1.0.126: сборка ЧАНКАМИ, а не одним HTML на 14 МБ ─────────────────────────
// Раньше `viteSingleFile()` вшивал в index.html вообще всё: JS, CSS и ~9.5 МБ
// спрайтов в base64 → 14 МБ (10 МБ gzip) одним файлом. Браузер обязан скачать
// его целиком до первого рендера — отсюда «вечная загрузка» на Pages (1.0.125
// убрал только блокирующие шрифты, монолит остался).
// Теперь по умолчанию: крошечный index.html-оболочка + JS-чанки + спрайты
// файлами. Спрайты грузятся параллельно и по факту обращения, чанки кешируются
// отдельно (правишь движок — игрок не перекачивает React).
// Один HTML по-прежнему доступен для раздачи «в один файл»: SINGLE_FILE=1 npm run build
const singleFile = process.env.SINGLE_FILE === "1";

export default defineConfig({
  // Относительная база: чанки и спрайты лежат файлами рядом с index.html, поэтому
  // сборка одинаково работает на подпути Pages, в подпапке и на любом статик-хостинге.
  // (В singlefile-режиме путей не было вообще — база безвредна и там.)
  base: "./",
  plugins: [react(), tailwindcss(), ...(singleFile ? [viteSingleFile()] : [])],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: singleFile
    ? {} // singlefile сам ставит assetsInlineLimit/cssCodeSplit — не мешаем
    : {
        // Мелочь (иконки, svg-паттерн) уходит в бандл, чтобы не плодить запросы;
        // спрайты остаются отдельными файлами.
        assetsInlineLimit: 2048,
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
          output: {
            entryFileNames: "assets/[name]-[hash].js",
            chunkFileNames: "assets/[name]-[hash].js",
            assetFileNames: "assets/[name]-[hash][extname]",
            manualChunks(id) {
              const p = id.replace(/\\/g, "/");
              if (p.includes("/node_modules/")) {
                if (/\/(react|react-dom|scheduler)\//.test(p)) return "vendor-react";
                if (/\/(lucide-react|clsx|tailwind-merge)\//.test(p)) return "vendor-ui";
                return "vendor";
              }
              // 1.0.128: код игры НЕ раскладываем руками — границу проводит сам Rollup
              // по динамическому import('./game/engine') из App.tsx. Всё, что нужно
              // только движку (engine, pixelart, iso, audio, terrain), уезжает в
              // отдельный чанк и грузится по клику «В поход»; общие модули
              // (config, nations, prayer-times, iconset, session) остаются в главном.
              // Ручное правило вида «всё из src/game → один чанк» здесь вредно: в один
              // чанк попадают и statически нужные меню модули, и тогда чанк движка
              // становится частью статического графа и скачивается на первом рендере.
              return undefined;
            },
          },
        },
      },
});
