import { system } from "@minecraft/server";

/* Routes the custom block component "dbz:interact" and custom slash commands. */

const blockHandlers = [];
const commandHandlers = new Map();

export function onBlockInteract(match, fn) {
  blockHandlers.push({ match, fn });
}

export function onCommand(name, fn) {
  commandHandlers.set(name, fn);
}

system.beforeEvents.startup.subscribe((ev) => {
  ev.blockComponentRegistry.registerCustomComponent("dbz:interact", {
    onPlayerInteract(e) {
      const p = e.player;
      if (!p) return;
      const id = e.block.typeId;
      for (const h of blockHandlers) {
        if (typeof h.match === "string" ? id === h.match : h.match.test(id)) {
          const block = e.block;
          system.run(() => h.fn(p, block));
          return;
        }
      }
    },
  });
  const reg = ev.customCommandRegistry;
  const defs = [
    ["dbz:dbmenu", "ドラゴンボールのメニューを開く"],
    ["dbz:dbkit", "操作アイテム一式を受け取る"],
    ["dbz:dbhelp", "ドラゴンボールアドオンの操作説明を表示"],
  ];
  for (const [name, description] of defs) {
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
