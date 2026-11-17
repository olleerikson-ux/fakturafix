/** Bygger mailto-länken för att skicka en faktura, och minns när fakturan mejlades (bara i UI-lagringen). */
import { calculateTotals, formatSek, isValidIsoDate, type CompanySettings, type Customer, type Invoice, type IsoDate } from '../core/index';

const EMAILED_KEY = 'fakturafix-ui:emailed';
const NEWLINE = '\r\n';

export function emailSubject(invoice: Invoice, settings: CompanySettings): string {
  const kind = invoice.creditFor !== undefined ? 'Kreditfaktura' : 'Faktura';
  return `${kind} ${invoice.number} från ${settings.name}`;
}

/** Brödtexten som rader. `original` är ursprungsfakturan när fakturan är en kreditfaktura. */
export function emailBodyLines(invoice: Invoice, settings: CompanySettings, original?: Invoice): string[] {
  const total = calculateTotals(invoice.lines).total;
  const signature = ['Vänliga hälsningar,', settings.name];
  if (invoice.creditFor !== undefined) {
    const reference = original ? ` Den avser faktura nr ${original.number}, daterad ${original.issueDate}.` : '';
    return [
      'Hej,',
      '',
      `Bifogat finns kreditfaktura ${invoice.number}.${reference}`,
      '',
      `Belopp att få tillbaka: ${formatSek(-total)}`,
      '',
      ...signature,
    ];
  }
  const payment = [
    settings.bankgiro ? `Bankgiro: ${settings.bankgiro}` : '',
    settings.plusgiro ? `Plusgiro: ${settings.plusgiro}` : '',
    invoice.ocr ? `OCR-nummer: ${invoice.ocr}` : '',
  ].filter(Boolean);
  return [
    'Hej,',
    '',
    `Bifogat finns faktura ${invoice.number}.`,
    '',
    `Att betala: ${formatSek(total)}`,
    `Förfallodatum: ${invoice.dueDate}`,
    ...payment,
    '',
    ...signature,
  ];
}

/** mailto-länk med kundens e-post (tom om den saknas). Ämne och text kodas med encodeURIComponent. */
export function buildMailto(invoice: Invoice, customer: Customer, settings: CompanySettings, original?: Invoice): string {
  const to = customer.email ? encodeURIComponent(customer.email).replace('%40', '@') : '';
  const subject = encodeURIComponent(emailSubject(invoice, settings));
  const body = encodeURIComponent(emailBodyLines(invoice, settings, original).join(NEWLINE));
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

function readEmailed(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(EMAILED_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string' && isValidIsoDate(v)));
  } catch {
    return {};
  }
}

export function getEmailedDate(invoiceId: string): IsoDate | undefined {
  return readEmailed()[invoiceId];
}

export function markEmailed(invoiceId: string, date: IsoDate): void {
  try {
    globalThis.localStorage?.setItem(EMAILED_KEY, JSON.stringify({ ...readEmailed(), [invoiceId]: date }));
  } catch {
    // Datumet är en bekvämlighet. Misslyckas sparningen visas det bara inte.
  }
}
