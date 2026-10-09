import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`
const map = {
  "@minecraft/server": ${JSON.stringify(pathToFileURL(new URL("./mock-server.mjs", import.meta.url).pathname).href)},
  "@minecraft/server-ui": ${JSON.stringify(pathToFileURL(new URL("./mock-ui.mjs", import.meta.url).pathname).href)},
};
export async function resolve(spec, ctx, next) {
  if (map[spec]) return { url: map[spec], shortCircuit: true };
  return next(spec, ctx);
}
`),
  import.meta.url,
);
