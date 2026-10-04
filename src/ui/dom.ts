/** Tiny DOM helpers. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  parent?: HTMLElement,
  html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

/** Set textContent only when changed (avoids layout churn every frame). */
export function setText(e: HTMLElement, text: string) {
  if (e.textContent !== text) e.textContent = text;
}

export function setStyle(e: HTMLElement, prop: string, value: string) {
  if (e.style.getPropertyValue(prop) !== value) e.style.setProperty(prop, value);
}

export function toggle(e: HTMLElement, cls: string, on: boolean) {
  if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
}

/** Fire on tap without the 300 ms delay and without leaking to the play surface. */
export function onTap(e: HTMLElement, fn: (ev: PointerEvent) => void) {
  e.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    fn(ev);
  });
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
