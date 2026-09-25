export interface OverlayAction {
  label: string;
  onClick: () => void;
}

export function showOverlay(title: string, message: string, actions: OverlayAction[] = []): HTMLElement {
  hideOverlay();
  const el = document.createElement('div');
  el.id = 'overlay';
  el.className = 'overlay';
  const h = document.createElement('h1');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = message;
  el.append(h, p);
  for (const action of actions) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', action.onClick);
    el.append(b);
  }
  document.body.append(el);
  return el;
}

export function hideOverlay(): void {
  document.getElementById('overlay')?.remove();
}
