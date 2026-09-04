# Contributing

Спасибо что хочешь помочь! Вариант A — стабильный релиз, вариант B — экспериментальный с внешними тайлами.

## Быстрый старт

```bash
npm install
npm run dev
```

## Где что лежит

- `src/game/iso.ts` — вся изометрия: `toIso/fromIso`, кэшированные ромбы, `isoBox/isoRoof`, деревья/золото/ягоды
- `src/game/engine.ts` — логика + рендер. Тайлы теперь с `TILE_STEP=32` для бесшовности
- `src/game/config.ts` — баланс (ресурсы, HP, урон, стоимость)
- `src/game/audio.ts` — WebAudio синт
- `src/App.tsx` — React UI (HUD, меню, пауза, game-over)

## Правила для PR

1. Не ломай бесшовность тайлов: `TILE_STEP` должен оставаться 32 world = 64×32px ромб. Проверяй формулой `toIso(32,0)=(32,16)`
2. Держи 60 FPS: кулл через `inView()`, лимиты на частицы (650), кэш тайлов в Map
3. Не добавляй тяжелые PNG без обсуждения — вариант A должен оставаться процедурным
4. Если добавляешь ассеты scrabling — укажи лицензию CC BY 4.0 и не коммить оригинальный zip (платный пак)

## Идеи для контрибьюта

- [ ] Баланс: стоимость Farm/Tower, интервалы волн
- [ ] Новые здания: Market (трейд), Archery Range
- [ ] 8-направленная анимация юнитов в iso
- [ ] Fog of War
- [ ] Сохранения (save/load в localStorage)

## Коммиты

Используй conventional commits: `feat:`, `fix:`, `perf:`, `docs:`.

Пример:
```
fix: seamless iso tiles - TILE_STEP 64->32, remove gaps between diamonds
```
