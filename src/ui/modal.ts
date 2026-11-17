/** Enkel modal dialog: fångar fokus, stängs med Escape eller klick utanför och återställer fokus. */
import { h } from './dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

export interface Modal {
  close(): void;
}

/** `content` är dialogens innehåll. `labelledBy` är id på dess rubrik. `initialFocus` får fokus först. */
export function openModal(content: HTMLElement[], labelledBy: string, initialFocus?: () => HTMLElement | null): Modal {
  const previouslyFocused = document.activeElement;
  const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelledBy }, ...content);
  const overlay = h('div', { class: 'modal-overlay' }, dialog);

  const focusable = (): HTMLElement[] => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusable();
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (!dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  (initialFocus?.() ?? focusable()[0])?.focus();
  return { close };
}
