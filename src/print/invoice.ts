/**
 * Renderar en faktura med svensk standardlayout (A4). Används för utskrift
 * och "Spara som PDF" via webbläsarens utskrift, se print.css.
 */
import {
  calculateTotals,
  DEFAULT_VAT_EXEMPT_TEXT,
  REVERSE_CHARGE_TEXT,
  formatSek,
  lineNet,
  type Address,
  type CompanySettings,
  type Customer,
  type Invoice,
} from '../core/index';
import './print.css';

type Child = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string | undefined,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function addressLines(address: Address): string[] {
  const country = address.country && address.country !== 'Sverige' ? [address.country] : [];
  return [address.street, `${address.postalCode} ${address.city}`.trim(), ...country];
}

function lines(...rows: string[]): Child[] {
  return rows.flatMap((row, i) => (i === 0 ? [row] : [document.createElement('br'), row]));
}

function metaRow(label: string, value: string): HTMLElement {
  return el('div', 'inv-meta-row', el('dt', undefined, label), el('dd', undefined, value));
}

function numberText(quantity: number): string {
  return String(quantity).replace('.', ',');
}

/**
 * Renderar fakturan. För en kreditfaktura (creditFor satt) skickas ursprungsfakturan med
 * som original, så att "Avser faktura nr X, daterad Y" kan skrivas ut.
 */
/** Logotypen visas bara som <img src>, aldrig som HTML, så att en SVG inte kan köra skript. */
function logoElement(settings: CompanySettings): HTMLElement[] {
  const url = settings.logoDataUrl;
  if (!url || !url.startsWith('data:image/')) return [];
  const img = document.createElement('img');
  img.className = 'inv-logo';
  img.alt = '';
  img.src = url;
  return [img];
}

function vatExemptRow(text: string): HTMLElement {
  const cell = el('td', undefined, text);
  cell.colSpan = 2;
  return el('tr', 'inv-vat-text', cell);
}

export function renderInvoice(
  invoice: Invoice,
  customer: Customer,
  settings: CompanySettings,
  original?: Invoice,
): HTMLElement {
  const isCredit = invoice.creditFor !== undefined;
  const totals = calculateTotals(invoice.lines);
  const root = el('article', 'invoice-print');

  const meta = el('dl', 'inv-meta');
  meta.append(
    metaRow('Fakturanummer', invoice.number ? String(invoice.number) : 'Utkast'),
    metaRow('Fakturadatum', invoice.issueDate),
    ...(isCredit ? [] : [metaRow('Förfallodatum', invoice.dueDate)]),
  );
  if (invoice.ocr && !isCredit) meta.append(metaRow('OCR-nummer', invoice.ocr));
  if (customer.reference) meta.append(metaRow('Er referens', customer.reference));

  root.append(
    el(
      'header',
      'inv-header',
      el(
        'div',
        'inv-seller',
        ...logoElement(settings),
        el('strong', 'inv-seller-name', settings.name),
        ...(invoice.reverseCharge && settings.vatNumber ? [el('div', 'inv-small', `Momsnr: ${settings.vatNumber}`)] : []),
      ),
      el('div', 'inv-title', el('h1', undefined, isCredit ? 'KREDITFAKTURA' : 'FAKTURA'), meta),
    ),
  );

  const buyer = el('section', 'inv-buyer', el('h2', undefined, 'Faktureras till'), el('p', undefined, ...lines(customer.name, ...addressLines(customer.address))));
  const buyerIds = [
    customer.orgNumber ? `Org.nr: ${customer.orgNumber}` : '',
    customer.vatNumber ? `Momsnr: ${customer.vatNumber}` : '',
  ].filter(Boolean);
  if (buyerIds.length > 0) buyer.append(el('p', 'inv-small', ...lines(...buyerIds)));
  root.append(buyer);
  if (isCredit) {
    const ref = original ? `Avser faktura nr ${original.number}, daterad ${original.issueDate}` : 'Avser en tidigare faktura';
    root.append(el('p', 'inv-credit-ref', ref));
  }

  const rows = invoice.lines.map((line) =>
    el(
      'tr',
      undefined,
      el('td', undefined, line.description),
      el('td', 'num', numberText(line.quantity)),
      el('td', undefined, line.unit ?? ''),
      el('td', 'num', formatSek(line.unitPrice)),
      el('td', 'num', `${line.vatRate} %`),
      el('td', 'num', formatSek(lineNet(line))),
    ),
  );
  const head = ['Beskrivning', 'Antal', 'Enhet', 'À-pris', 'Moms', 'Belopp exkl. moms'];
  root.append(
    el(
      'table',
      'inv-lines',
      el('thead', undefined, el('tr', undefined, ...head.map((t, i) => el('th', i === 0 || i === 2 ? undefined : 'num', t)))),
      el('tbody', undefined, ...rows),
    ),
  );

  const sumRow = (label: string, value: string, className?: string) =>
    el('tr', className, el('th', undefined, label), el('td', 'num', value));
  const exempt = invoice.vatExempt === true;
  const reverse = invoice.reverseCharge === true;
  const vatRows = reverse
    ? [vatExemptRow(REVERSE_CHARGE_TEXT)]
    : exempt
      ? [vatExemptRow(settings.vatExemptText || DEFAULT_VAT_EXEMPT_TEXT)]
    : Object.entries(totals.vatByRate).map(([rate, amount]) => sumRow(`Moms ${rate} %`, formatSek(amount)));
  root.append(
    el(
      'table',
      'inv-totals',
      el(
        'tbody',
        undefined,
        sumRow('Summa exkl. moms', formatSek(totals.net)),
        ...vatRows,
        ...(totals.rounding !== 0 ? [sumRow('Öresavrundning', formatSek(totals.rounding))] : []),
        isCredit ? sumRow('Att få tillbaka', formatSek(-totals.total), 'inv-total') : sumRow('Att betala', formatSek(totals.total), 'inv-total'),
      ),
    ),
  );

  if (invoice.notes) root.append(el('p', 'inv-notes', invoice.notes));

  const creditRows: [string, string][] = [['Att få tillbaka', formatSek(-totals.total)]];
  const payRows = isCredit ? creditRows : [
    settings.bankgiro ? ['Bankgiro', settings.bankgiro] : undefined,
    settings.plusgiro ? ['Plusgiro', settings.plusgiro] : undefined,
    invoice.ocr ? ['OCR-nummer', invoice.ocr] : undefined,
    ['Att betala', formatSek(totals.total)],
    ['Förfallodatum', invoice.dueDate],
  ].filter((r): r is [string, string] => r !== undefined);
  root.append(
    el(
      'section',
      'inv-payment',
      el('h2', undefined, isCredit ? 'Återbetalning' : 'Betalning'),
      ...(isCredit ? [el('p', 'inv-small', 'Beloppet betalas tillbaka eller dras av på kommande fakturor. Ingen betalning krävs.')] : []),
      el('dl', undefined, ...payRows.map(([label, value]) => metaRow(label, value))),
    ),
  );

  const contact = [settings.email, settings.phone].filter((v): v is string => Boolean(v));
  const ids = [`Org.nr: ${settings.orgNumber}`, settings.vatNumber && !exempt ? `Momsnr: ${settings.vatNumber}` : ''].filter(Boolean);
  const extra = [
    settings.fSkatt ? 'Godkänd för F-skatt' : '',
    settings.lateInterestPercent !== undefined
      ? `Dröjsmålsränta: ${String(settings.lateInterestPercent).replace('.', ',')} %`
      : '',
  ].filter(Boolean);
  root.append(
    el(
      'footer',
      'inv-footer',
      el('div', undefined, el('strong', undefined, settings.name), ...[document.createElement('br')], ...lines(...addressLines(settings.address))),
      el('div', undefined, ...lines(...ids, ...extra)),
      el('div', undefined, ...lines(...contact)),
    ),
  );
  return root;
}
