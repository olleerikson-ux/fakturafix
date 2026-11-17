/**
 * Appens skal: navigering med hash-routing (#/kunder, #/fakturor/ny, #/fakturor/<id>, ...).
 * Varje vy är en funktion som får ett element att rita i.
 * Utvecklare 2 lägger till vyer i src/ui/views/ och registrerar dem här.
 */
import type { Store } from '../core/index';
import { h } from './dom';
import { articlesView } from './views/articles';
import { customersView } from './views/customers';
import { overviewView } from './views/overview';
import { invoiceFormView } from './views/invoice-form';
import { settingsView } from './views/settings';

const LOGO_SVG =
  '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="4" y="2" width="24" height="28" rx="4" fill="currentColor"/><path d="M10 11h12M10 16h12M10 21h7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';

export type View = (root: HTMLElement, store: Store) => void;

interface Route {
  path: string;
  label: string;
  view: View;
}

const routes: Route[] = [
  { path: '/oversikt', label: 'Översikt', view: overviewView },
  { path: '/fakturor/ny', label: 'Ny faktura', view: (root, store) => invoiceFormView(root, store) },
  { path: '/kunder', label: 'Kunder', view: customersView },
  { path: '/artiklar', label: 'Artiklar', view: articlesView },
  { path: '/installningar', label: 'Inställningar', view: settingsView },
];

export function startApp(root: HTMLElement, store: Store): void {
  const brand = h('a', { class: 'brand', href: '#/oversikt' });
  brand.innerHTML = `${LOGO_SVG}<span>Fakturafix</span>`;
  const links = h('div', { class: 'nav-links', id: 'nav-links' }, ...routes.map((r) => h('a', { href: `#${r.path}` }, r.label)));
  const toggle = h('button', { type: 'button', class: 'nav-toggle', 'aria-controls': 'nav-links', 'aria-expanded': 'false' }, 'Meny');
  const nav = h('nav', { class: 'nav', 'aria-label': 'Huvudmeny' }, brand, toggle, links);
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  const main = h('main', { class: 'main' });
  root.replaceChildren(nav, main);

  const render = () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    const path = location.hash.replace(/^#/, '') || '/oversikt';
    const invoiceId = /^\/fakturor\/([\w-]+)$/.exec(path)?.[1];
    const route = routes.find((r) => r.path === path);
    const activePath = route?.path ?? (invoiceId ? '' : routes[0]!.path);
    for (const a of links.querySelectorAll('a')) {
      a.classList.toggle('active', a.getAttribute('href') === `#${activePath}`);
    }
    if (route) route.view(main, store);
    else if (invoiceId) invoiceFormView(main, store, invoiceId);
    else routes[0]!.view(main, store);
  };
  window.addEventListener('hashchange', render);
  render();
}
