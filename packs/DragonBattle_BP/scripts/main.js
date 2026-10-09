/* Dragon Ball battle addon — entry point. Characters fight each other; players set up the fights and watch. */
import { system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import "./core/interact.js";
import { onCommand } from "./core/interact.js";
import { msg } from "./core/fx.js";
import "./combat/damage.js";
import "./combat/terrain.js";
import { cleanupStray } from "./combat/projectiles.js";
import { allDimensions } from "./combat/teams.js";
import { adoptAll } from "./fighters/fighter.js";
import "./fighters/ai.js";
import { currentMatch, endMatch } from "./battle/match.js";
import "./battle/camera.js";
import "./battle/hud.js";
import { giveTools } from "./battle/tools.js";
import { battleMenu, HELP } from "./ui/menu.js";

world.afterEvents.worldLoad.subscribe(() => {
  system.runTimeout(() => {
    adoptAll();
    for (const d of allDimensions()) cleanupStray(d);
  }, 20);
});

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const p = ev.player;
  system.runTimeout(() => {
    try {
      if (!p.getDynamicProperty("dbb:welcomed")) {
        p.setDynamicProperty("dbb:welcomed", true);
        giveTools(p);
        msg(p, "§6ドラゴンボール バトル§f へようこそ！ §eバトルメニュー§fを使うか §e/dbb:battle§f で試合を組めます。");
      }
    } catch {
      // ignore
    }
  }, 60);
});

onCommand("dbb:battle", (p) => battleMenu(p));
onCommand("dbb:bkit", (p) => giveTools(p));
onCommand("dbb:bstop", (p) => {
  const m = currentMatch();
  if (m) endMatch(m, true);
  else msg(p, "§7今は試合をしていません。");
});
onCommand("dbb:bhelp", (p) => {
  new ActionFormData().title("遊び方").body(HELP).button("閉じる").show(p);
});
