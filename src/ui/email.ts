/** Bygger mailto-länken för att skicka en faktura, och minns när fakturan mejlades (bara i UI-lagringen). */
import {
  addDays,
  calculateTotals,
  formatSek,
  isValidIsoDate,
  reminderAmounts,
  type CompanySettings,
  type Customer,
  type Invoice,
  type IsoDate,
} from '../core/index';
import { REMINDER_DAYS } from '../print/reminder';

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

const REMINDED_KEY = 'fakturafix-ui:reminded';

function readReminded(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(REMINDED_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string' && isValidIsoDate(v)));
  } catch {
    return {};
  }
}

/** Datumet då en påminnelse senast skickades (mejlprogrammet öppnades) för fakturan. */
export function getRemindedDate(invoiceId: string): IsoDate | undefined {
  return readReminded()[invoiceId];
}

export function markReminded(invoiceId: string, date: IsoDate): void {
  try {
    globalThis.localStorage?.setItem(REMINDED_KEY, JSON.stringify({ ...readReminded(), [invoiceId]: date }));
  } catch {
    // Datumet är en bekvämlighet. Misslyckas sparningen visas det bara inte.
  }
}

export function reminderSubject(invoice: Invoice): string {
  return `Påminnelse: faktura ${invoice.number}`;
}

/** Vänlig text i mejlet. Kastar kärnans fel om fakturan inte kan påminnas. */
export function reminderBodyLines(invoice: Invoice, settings: CompanySettings, todayDate: IsoDate): string[] {
  const amounts = reminderAmounts(invoice, settings, todayDate);
  const payment = [
    settings.bankgiro ? `Bankgiro: ${settings.bankgiro}` : '',
    settings.plusgiro ? `Plusgiro: ${settings.plusgiro}` : '',
    invoice.ocr ? `OCR-nummer: ${invoice.ocr}` : '',
  ].filter(Boolean);
  return [
    'Hej,',
    '',
    `Vi har inte fått betalt för faktura ${invoice.number}, daterad ${invoice.issueDate}, med förfallodatum ${invoice.dueDate}. Om du redan har betalat kan du bortse från detta.`,
    '',
    `Ursprungligt belopp: ${formatSek(amounts.principal)}`,
    ...(amounts.interest > 0 ? [`Dröjsmålsränta: ${formatSek(amounts.interest)}`] : []),
    ...(amounts.fee > 0 ? [`Påminnelseavgift: ${formatSek(amounts.fee)}`] : []),
    `Summa att betala: ${formatSek(amounts.total)}`,
    `Betala senast: ${addDays(todayDate, REMINDER_DAYS)}`,
    ...payment,
    '',
    'Vänliga hälsningar,',
    settings.name,
  ];
}

export function buildReminderMailto(invoice: Invoice, customer: Customer, settings: CompanySettings, todayDate: IsoDate): string {
  const to = customer.email ? encodeURIComponent(customer.email).replace('%40', '@') : '';
  const subject = encodeURIComponent(reminderSubject(invoice));
  const body = encodeURIComponent(reminderBodyLines(invoice, settings, todayDate).join(NEWLINE));
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
