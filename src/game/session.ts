// Флаги сессии в localStorage (1.0.128).
//
// Зачем отдельный файл: меню должно знать, есть ли сохранение и не закрывали ли
// страницу посреди партии, — но ради трёх строчек localStorage тащить весь движок
// (270 КБ чанка) нельзя. Раньше это были статики `Game.hasSave/wasInGame/setInGame`,
// и любой вызов из меню делал движок обязательным для первого рендера. Теперь меню
// живёт без движка, а `Game` держит тонкие обёртки ради совместимости вызовов.
const SAVE_KEY = 'empires-dawn-savegame-v1';
const INGAME_KEY = 'empires-dawn-ingame-v1';

export function hasSave(): boolean {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

/** Страницу закрыли во время партии (и сохранение на месте) — надо вернуть в бой. */
export function wasInGame(): boolean {
  try { return localStorage.getItem(INGAME_KEY) === '1' && hasSave(); } catch { return false; }
}

export function setInGame(on: boolean) {
  try {
    if (on) localStorage.setItem(INGAME_KEY, '1');
    else localStorage.removeItem(INGAME_KEY);
  } catch { /* приватный режим — просто не запомним */ }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(INGAME_KEY); } catch { /* noop */ }
}
