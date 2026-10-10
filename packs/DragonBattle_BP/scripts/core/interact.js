import { system } from "@minecraft/server";

/* Custom slash commands (no cheats needed). */

const commandHandlers = new Map();

export function onCommand(name, fn) {
  commandHandlers.set(name, fn);
}

const DEFS = [
  ["dbb:battle", "ドラゴンボール バトルのメニューを開く"],
  ["dbb:bkit", "バトルの道具一式を受け取る"],
  ["dbb:bstop", "今の試合を終わらせる"],
  ["dbb:bhelp", "ドラゴンボール バトルの遊び方を表示"],
];

system.beforeEvents.startup.subscribe((ev) => {
  const reg = ev.customCommandRegistry;
  for (const [name, description] of DEFS) {
    try {
      reg.registerCommand({ name, description, permissionLevel: 0, cheatsRequired: false }, (origin) => {
        const p = origin.sourceEntity;
        const fn = commandHandlers.get(name);
        if (p && fn) system.run(() => fn(p));
        return { status: 0 };
      });
    } catch {
      // already registered
    }
  }
});
