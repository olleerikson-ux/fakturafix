/**
 * Appens skal: navigering med hash-routing (#/kunder, #/fakturor/ny, #/fakturor/<id>, ...).
 * Varje vy är en funktion som får ett element att rita i.
 * Utvecklare 2 lägger till vyer i src/ui/views/ och registrerar dem här.
 */
import type { Store } from '../core/index';
import { h } from './dom';
import { customersView } from './views/customers';
import { invoiceFormView } from './views/invoice-form';
import { settingsView } from './views/settings';

export type View = (root: HTMLElement, store: Store) => void;

interface Route {
  path: string;
  label: string;
  view: View;
}

const placeholder =
  (title: string): View =>
  (root) => {
    root.replaceChildren(h('h1', {}, title), h('p', {}, 'Kommer snart.'));
  };

const routes: Route[] = [
  { path: '/oversikt', label: 'Översikt', view: placeholder('Översikt') },
  { path: '/fakturor/ny', label: 'Ny faktura', view: (root, store) => invoiceFormView(root, store) },
  { path: '/kunder', label: 'Kunder', view: customersView },
  { path: '/installningar', label: 'Inställningar', view: settingsView },
];

export function startApp(root: HTMLElement, store: Store): void {
  const nav = h(
    'nav',
    { class: 'nav' },
    h('strong', { class: 'brand' }, 'Fakturafix'),
    ...routes.map((r) => h('a', { href: `#${r.path}` }, r.label)),
  );
  const main = h('main', { class: 'main' });
  root.replaceChildren(nav, main);

  const render = () => {
    const path = location.hash.replace(/^#/, '') || '/oversikt';
    const invoiceId = /^\/fakturor\/([\w-]+)$/.exec(path)?.[1];
    const route = routes.find((r) => r.path === path);
    const activePath = route?.path ?? (invoiceId ? '' : routes[0]!.path);
    for (const a of nav.querySelectorAll('a')) {
      a.classList.toggle('active', a.getAttribute('href') === `#${activePath}`);
    }
    if (route) route.view(main, store);
    else if (invoiceId) invoiceFormView(main, store, invoiceId);
    else routes[0]!.view(main, store);
  };
  window.addEventListener('hashchange', render);
  render();
}
