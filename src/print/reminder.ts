/** Betalningspåminnelse (A4) för en förfallen faktura. Samma stil som fakturan, men svartvit och vänlig. */
import {
  addDays,
  formatSek,
  reminderAmounts,
  type CompanySettings,
  type Customer,
  type Invoice,
  type IsoDate,
} from '../core/index';
import { addressLines, el, lines, logoElement, metaRow, sellerFooter } from './invoice';

/** Antal dagar från påminnelsen till nytt sista betalningsdatum. */
export const REMINDER_DAYS = 10;

/** Kastar fel om fakturan inte kan påminnas (utkast, betald eller kreditfaktura). */
export function renderReminder(
  invoice: Invoice,
  customer: Customer,
  settings: CompanySettings,
  todayDate: IsoDate,
): HTMLElement {
  const amounts = reminderAmounts(invoice, settings, todayDate);
  const newDue = addDays(todayDate, REMINDER_DAYS);
  const root = el('article', 'invoice-print');

  const meta = el('dl', 'inv-meta');
  meta.append(
    metaRow('Datum', todayDate),
    metaRow('Avser faktura nr', String(invoice.number)),
    metaRow('Fakturadatum', invoice.issueDate),
    metaRow('Förfallodatum', invoice.dueDate),
  );
  root.append(
    el(
      'header',
      'inv-header',
      el('div', 'inv-seller', ...logoElement(settings), el('strong', 'inv-seller-name', settings.name)),
      el('div', 'inv-title', el('h1', undefined, 'BETALNINGSPÅMINNELSE'), meta),
    ),
    el('section', 'inv-buyer', el('h2', undefined, 'Till'), el('p', undefined, ...lines(customer.name, ...addressLines(customer.address)))),
    el(
      'p',
      'inv-reminder-text',
      `Vi har inte fått betalt för faktura ${invoice.number}, daterad ${invoice.issueDate}, med förfallodatum ${invoice.dueDate}. ` +
        'Om du redan har betalat kan du bortse från detta.',
    ),
  );

  const row = (label: string, value: string, className?: string) =>
    el('tr', className, el('th', undefined, label), el('td', 'num', value));
  const percent = settings.lateInterestPercent;
  root.append(
    el(
      'table',
      'inv-totals',
      el(
        'tbody',
        undefined,
        row('Ursprungligt belopp', formatSek(amounts.principal)),
        ...(percent !== undefined && amounts.interest > 0
          ? [row(`Dröjsmålsränta ${String(percent).replace('.', ',')} % (${amounts.daysLate} dagar)`, formatSek(amounts.interest))]
          : []),
        ...(amounts.fee > 0 ? [row('Påminnelseavgift', formatSek(amounts.fee))] : []),
        row('Summa att betala', formatSek(amounts.total), 'inv-total'),
      ),
    ),
  );

  const payRows: [string, string][] = [
    ...(settings.bankgiro ? [['Bankgiro', settings.bankgiro] as [string, string]] : []),
    ...(settings.plusgiro ? [['Plusgiro', settings.plusgiro] as [string, string]] : []),
    ...(invoice.ocr ? [['OCR-nummer', invoice.ocr] as [string, string]] : []),
    ['Att betala', formatSek(amounts.total)],
    ['Betala senast', newDue],
  ];
  root.append(
    el('section', 'inv-payment', el('h2', undefined, 'Betalning'), el('dl', undefined, ...payRows.map(([l, v]) => metaRow(l, v)))),
    sellerFooter(settings, invoice.vatExempt === true),
  );
  return root;
}
