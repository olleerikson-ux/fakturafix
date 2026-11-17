/**
 * Översikt (#/oversikt): nyckeltal, fakturalista med statusfilter och
 * åtgärderna Markera som betald och Ta bort utkast.
 */
import { calculateTotals, displayStatus, formatSek, today, type Invoice, type Store } from '../../core/index';
import { h } from '../dom';
import { printInvoice } from '../../print/print';
import { getLastBackupDate, needsBackupReminder } from '../backup-reminder';
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

/**
 * Räknar nyckeltalen (i öre). Utkast ingår inte.
 * Fakturor räknas efter sin egen status, även när de är krediterade, och en
 * kreditfakturas negativa belopp dras av där ursprungsfakturan räknades: från
 * betalt i år om den var betald, annars från obetalt (och förfallet om den
 * var förfallen). En helt krediterad faktura ger därför netto noll.
 */
export function computeKpis(invoices: Invoice[], todayDate: string): OverviewKpis {
  const kpis: OverviewKpis = { unpaid: 0, overdue: 0, paidThisYear: 0 };
  const year = todayDate.slice(0, 4);
  const byId = new Map(invoices.map((i) => [i.id, i]));
  for (const invoice of invoices) {
    if (invoice.status === 'draft') continue;
    const total = calculateTotals(invoice.lines).total;
    const base = invoice.creditFor === undefined ? invoice : byId.get(invoice.creditFor);
    const status: string = base ? displayStatus(base, todayDate) : 'unpaid';
    const refund = invoice.creditFor !== undefined;
    if (status === 'unpaid') kpis.unpaid += total;
    else if (status === 'overdue') {
      kpis.unpaid += total;
      kpis.overdue += total;
    } else if (status === 'paid' && (refund ? invoice.issueDate : (invoice.paidDate ?? '')).startsWith(year)) {
      kpis.paidThisYear += total;
    }
  }
  return kpis;
}

/** Sant om fakturan matchar sökningen på kundnamn, fakturanummer eller belopp. Tom sökning matchar allt. */
export function matchesSearch(invoice: Invoice, customerName: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if (customerName.toLowerCase().includes(q)) return true;
  const compact = q.replace(/[\s\u00a0]/g, '').replace(/^#/, '');
  if (compact === '') return true;
  if (invoice.number > 0 && String(invoice.number).includes(compact)) return true;
  const amount = formatSek(calculateTotals(invoice.lines).total).replace(/[\s\u00a0]|kr/g, '');
  return amount.includes(compact.replace('.', ','));
}

export function overviewView(root: HTMLElement, store: Store): void {
  let filter = 'all';
  let query = '';
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
    const print = (invoice: Invoice) => {
      message = printInvoice(store, invoice.id) ?? '';
      if (message) render();
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
      .map((invoice) => ({ invoice, status: displayStatus(invoice, todayDate, invoices) as string }))
      .filter((x) => filter === 'all' || x.status === filter)
      .filter((x) => matchesSearch(x.invoice, store.getCustomer(x.invoice.customerId)?.name ?? '', query))
      .sort((a, b) => (a.invoice.number || Infinity) - (b.invoice.number || Infinity) || b.invoice.createdAt.localeCompare(a.invoice.createdAt));

    const rows = shown.map(({ invoice, status }) => {
      const customer = store.getCustomer(invoice.customerId);
      const name = customer?.name ?? 'Okänd kund';
      const label = invoice.number ? `faktura ${invoice.number}` : 'utkast';
      return h(
        'tr',
        {},
        h('td', { class: 'num', 'data-label': 'Nr' }, invoice.number ? String(invoice.number) : '–'),
        h('td', { 'data-label': 'Kund' }, name),
        h('td', { 'data-label': 'Datum' }, invoice.issueDate),
        h('td', { 'data-label': 'Förfaller' }, invoice.dueDate),
        h('td', { class: 'num', 'data-label': 'Belopp' }, formatSek(calculateTotals(invoice.lines).total)),
        h('td', { 'data-label': 'Status' }, h('span', { class: `badge badge-${status}` }, statusLabel(status))),
        h(
          'td',
          { class: 'actions' },
          h('a', { class: 'btn-secondary', href: `#/fakturor/${invoice.id}`, 'aria-label': `Öppna ${label}` }, 'Öppna'),
          invoice.status !== 'draft'
            ? h('button', { type: 'button', class: 'btn-secondary', 'aria-label': `Skriv ut ${label}`, onclick: () => print(invoice) }, 'Skriv ut')
            : '',
          status === 'unpaid' || status === 'overdue'
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

    const search = h('input', {
      type: 'search',
      id: 'invoice-search',
      placeholder: 'Kund, fakturanummer eller belopp',
      value: query,
      'aria-label': 'Sök bland fakturor',
    });
    search.addEventListener('input', () => {
      query = search.value;
      const caret = search.selectionStart ?? query.length;
      render();
      const next = root.querySelector<HTMLInputElement>('#invoice-search');
      next?.focus();
      next?.setSelectionRange(caret, caret);
    });

    const list =
      invoices.length === 0
        ? h('div', { class: 'empty' }, h('p', {}, 'Du har inga fakturor än.'), h('a', { class: 'btn-primary', href: '#/fakturor/ny' }, 'Skapa din första faktura'))
        : shown.length === 0
          ? h('p', { class: 'empty' }, 'Inga fakturor matchar sökningen eller filtret.')
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
    const hasData = invoices.length > 0 || store.listCustomers().length > 0;
    const reminder = needsBackupReminder(hasData, getLastBackupDate(), todayDate)
      ? h(
          'p',
          { class: 'hint backup-reminder' },
          'Du har inte tagit någon säkerhetskopia de senaste 30 dagarna. ',
          h('a', { href: '#/installningar' }, 'Ladda ner en säkerhetskopia'),
          '.',
        )
      : '';
    root.replaceChildren(
      h('h1', {}, 'Översikt'),
      welcome,
      reminder,
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
        h('div', { class: 'filter' }, search, h('label', { for: 'status-filter' }, 'Visa: '), select),
        list,
      ),
    );
  };
  render();
}
