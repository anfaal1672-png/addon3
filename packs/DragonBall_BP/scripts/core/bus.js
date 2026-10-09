/** Tiny event bus so feature modules can react to each other without import cycles. */
const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
}

export function emit(name, ...args) {
  const list = handlers.get(name);
  if (!list) return;
  for (const fn of list) {
    try {
      fn(...args);
    } catch (e) {
      console.warn(`[dbz bus:${name}] ${e}`);
    }
  }
}
