// Mock of @minecraft/server-ui: every form is chainable and resolves as "canceled" unless a scripted answer is queued.
export const answers = [];
class Form {
  constructor() { return new Proxy(this, { get: (t, k) => (k === "show" ? t.show.bind(t) : k in t ? t[k] : () => t.__proxy) }); }
  async show() {
    const a = answers.shift();
    if (a === undefined) return { canceled: true, cancelationReason: "UserClosed" };
    return Object.assign({ canceled: false }, a);
  }
}
function make() {
  const f = new Form();
  return f;
}
export class ActionFormData { constructor() { const f = make(); f.__proxy = f; return f; } }
export class ModalFormData { constructor() { const f = make(); f.__proxy = f; return f; } }
export class MessageFormData { constructor() { const f = make(); f.__proxy = f; return f; } }
