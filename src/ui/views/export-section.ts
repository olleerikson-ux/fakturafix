/** Sektionen "Exportera till bokföring (CSV)" i Inställningar: välj period och ladda ner en CSV-fil. */
import { invoicesToCsv, isValidIsoDate, today, type IsoDate, type Store } from '../../core/index';
import { h } from '../dom';
import { errorMessage } from '../form';

export type Period = 'this-year' | 'last-year' | 'custom';

export function exportFileName(date: string): string {
  return `fakturafix-export-${date}.csv`;
}

/** Datumintervall för vald period. `null` betyder att det valfria intervallet är ogiltigt. */
export function periodRange(
  period: Period,
  todayDate: IsoDate,
  custom: { from: string; to: string },
): { from?: IsoDate; to?: IsoDate } | null {
  const year = Number(todayDate.slice(0, 4));
  if (period === 'this-year') return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (period === 'last-year') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  const { from, to } = custom;
  if ((from && !isValidIsoDate(from)) || (to && !isValidIsoDate(to))) return null;
  if (from && to && to < from) return null;
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = h('a', { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportSection(store: Store): HTMLElement {
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const say = (text: string, kind: 'ok' | 'error') => status.replaceChildren(h('p', { class: `notice notice-${kind}` }, text));

  const select = h(
    'select',
    { id: 'export-period', name: 'period' },
    h('option', { value: 'this-year' }, 'I år'),
    h('option', { value: 'last-year' }, 'Förra året'),
    h('option', { value: 'custom' }, 'Valfritt intervall'),
  );
  const from = h('input', { type: 'text', id: 'export-from', placeholder: 'ÅÅÅÅ-MM-DD', inputmode: 'numeric', 'aria-label': 'Från och med' });
  const to = h('input', { type: 'text', id: 'export-to', placeholder: 'ÅÅÅÅ-MM-DD', inputmode: 'numeric', 'aria-label': 'Till och med' });
  const range = h('div', { class: 'export-range', hidden: true }, from, to);
  select.addEventListener('change', () => {
    range.hidden = select.value !== 'custom';
  });

  const run = () => {
    const todayDate = today();
    const period = periodRange(select.value as Period, todayDate, { from: from.value.trim(), to: to.value.trim() });
    if (!period) return say('Ange datum som ÅÅÅÅ-MM-DD, och låt slutdatumet vara samma som eller senare än startdatumet.', 'error');
    try {
      const csv = invoicesToCsv(store.listInvoices(), store.listCustomers(), period.from, period.to);
      download(exportFileName(todayDate), csv);
      say('✓ Exportfilen är nedladdad. Den innehåller utfärdade fakturor och kreditfakturor för perioden.', 'ok');
    } catch (error) {
      say(errorMessage(error, 'Exporten kunde inte skapas.'), 'error');
    }
  };

  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'export-title' },
    h('h2', { id: 'export-title' }, 'Exportera till bokföring (CSV)'),
    h('p', {}, 'Ladda ner utfärdade fakturor som en CSV-fil för din bokförare eller ditt bokföringsprogram. Filen öppnas i Excel.'),
    h('div', { class: 'field' }, h('label', { for: 'export-period' }, 'Period'), select),
    range,
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn-primary', onclick: run }, 'Exportera till bokföring (CSV)')),
    status,
  );
}
