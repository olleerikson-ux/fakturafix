/**
 * Översikt (#/oversikt): nyckeltal, fakturalista med statusfilter och
 * åtgärderna Markera som betald och Ta bort utkast.
 */
import { calculateTotals, displayStatus, formatSek, today, type Invoice, type Store } from '../../core/index';
import { h } from '../dom';
import { errorMessage, STORAGE_ERROR_HINT } from '../form';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Utkast',
  unpaid: 'Obetald',
  overdue: 'Förfallen',
  paid: 'Betald',
  credited: 'Krediterad',
  'credit-note': 'Kreditfaktura',
};

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Alla' },
  { value: 'draft', label: 'Utkast' },
  { value: 'unpaid', label: 'Obetalda' },
  { value: 'overdue', label: 'Förfallna' },
  { value: 'paid', label: 'Betalda' },
  { value: 'credited', label: 'Krediterade' },
  { value: 'credit-note', label: 'Kreditfakturor' },
];

/** Statusen som text. Okända värden (t.ex. från nyare kärnversioner) visas som de är. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export interface OverviewKpis {
  unpaid: number;
  overdue: number;
  paidThisYear: number;
}

/** Räknar nyckeltalen (i öre). Utkast ingår inte. */
export function computeKpis(invoices: Invoice[], todayDate: string): OverviewKpis {
  const kpis: OverviewKpis = { unpaid: 0, overdue: 0, paidThisYear: 0 };
  const year = todayDate.slice(0, 4);
  for (const invoice of invoices) {
    const status: string = displayStatus(invoice, todayDate);
    const total = calculateTotals(invoice.lines).total;
    if (status === 'unpaid') kpis.unpaid += total;
    else if (status === 'overdue') {
      kpis.unpaid += total;
      kpis.overdue += total;
    } else if (status === 'paid' && (invoice.paidDate ?? '').startsWith(year)) kpis.paidThisYear += total;
  }
  return kpis;
}

export function overviewView(root: HTMLElement, store: Store): void {
  let filter = 'all';
  let message = '';

  const render = () => {
    const todayDate = today();
    const invoices = store.listInvoices();
    const kpis = computeKpis(invoices, todayDate);
    const kpi = (label: string, ore: number, cls = '') =>
      h('div', { class: `kpi ${cls}`.trim() }, h('span', { class: 'kpi-label' }, label), h('strong', {}, formatSek(ore)));

    const markPaid = (invoice: Invoice) => {
      try {
        store.saveInvoice({ ...invoice, status: 'paid', paidDate: todayDate });
        message = '';
      } catch (error) {
        message = `Kunde inte spara: ${errorMessage(error, STORAGE_ERROR_HINT)}`;
      }
      render();
    };
    const remove = (invoice: Invoice) => {
      try {
        store.deleteInvoice(invoice.id);
        message = '';
      } catch (error) {
        message = `Kunde inte ta bort: ${errorMessage(error, STORAGE_ERROR_HINT)}`;
      }
      render();
    };

    const shown = invoices
      .map((invoice) => ({ invoice, status: displayStatus(invoice, todayDate) as string }))
      .filter((x) => filter === 'all' || x.status === filter)
      .sort((a, b) => (a.invoice.number || Infinity) - (b.invoice.number || Infinity) || b.invoice.createdAt.localeCompare(a.invoice.createdAt));

    const rows = shown.map(({ invoice, status }) => {
      const customer = store.getCustomer(invoice.customerId);
      const name = customer?.name ?? 'Okänd kund';
      const label = invoice.number ? `faktura ${invoice.number}` : 'utkast';
      return h(
        'tr',
        {},
        h('td', { class: 'num' }, invoice.number ? String(invoice.number) : '–'),
        h('td', {}, name),
        h('td', {}, invoice.issueDate),
        h('td', {}, invoice.dueDate),
        h('td', { class: 'num' }, formatSek(calculateTotals(invoice.lines).total)),
        h('td', {}, h('span', { class: `badge badge-${status}` }, statusLabel(status))),
        h(
          'td',
          { class: 'actions' },
          h('a', { href: `#/fakturor/${invoice.id}`, 'aria-label': `Öppna ${label}` }, 'Öppna'),
          invoice.status === 'sent'
            ? h('button', { type: 'button', class: 'btn-secondary', 'aria-label': `Markera ${label} som betald`, onclick: () => markPaid(invoice) }, 'Markera som betald')
            : '',
          invoice.status === 'draft'
            ? h('button', { type: 'button', class: 'btn-danger', 'aria-label': `Ta bort ${label}`, onclick: () => remove(invoice) }, 'Ta bort utkast')
            : '',
        ),
      );
    });

    const select = h(
      'select',
      { id: 'status-filter', onchange: (e: Event) => { filter = (e.target as HTMLSelectElement).value; render(); } },
      ...FILTERS.map((f) => h('option', { value: f.value, selected: f.value === filter }, f.label)),
    );

    const list =
      invoices.length === 0
        ? h('div', { class: 'empty' }, h('p', {}, 'Du har inga fakturor än.'), h('a', { class: 'btn-primary', href: '#/fakturor/ny' }, 'Skapa din första faktura'))
        : shown.length === 0
          ? h('p', { class: 'empty' }, 'Inga fakturor matchar filtret.')
          : h(
              'table',
              { class: 'table' },
              h(
                'thead',
                {},
                h(
                  'tr',
                  {},
                  ...['Nr', 'Kund', 'Datum', 'Förfaller', 'Belopp', 'Status'].map((t) => h('th', { scope: 'col', class: t === 'Nr' || t === 'Belopp' ? 'num' : '' }, t)),
                  h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Åtgärder')),
                ),
              ),
              h('tbody', {}, ...rows),
            );

    const welcome = store.getSettings()
      ? ''
      : h(
          'section',
          { class: 'card welcome', 'aria-labelledby': 'welcome-title' },
          h('h2', { id: 'welcome-title' }, 'Välkommen till Fakturafix'),
          h('p', {}, 'Kom igång på tre steg:'),
          h(
            'ol',
            {},
            h('li', {}, h('a', { href: '#/installningar' }, 'Fyll i ditt företag')),
            h('li', {}, h('a', { href: '#/kunder' }, 'Lägg till en kund')),
            h('li', {}, h('a', { href: '#/fakturor/ny' }, 'Skapa en faktura')),
          ),
        );
    root.replaceChildren(
      h('h1', {}, 'Översikt'),
      welcome,
      h(
        'div',
        { class: 'kpis' },
        kpi('Obetalt', kpis.unpaid),
        kpi('Förfallet', kpis.overdue, kpis.overdue > 0 ? 'kpi-danger' : ''),
        kpi('Betalt i år', kpis.paidThisYear),
      ),
      h('div', { class: 'status', role: 'status', 'aria-live': 'polite' }, message),
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'filter' }, h('label', { for: 'status-filter' }, 'Visa: '), select),
        list,
      ),
    );
  };
  render();
}
