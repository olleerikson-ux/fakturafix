import type { Invoice, InvoiceDisplayStatus, IsoDate } from './types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** Tolkar "YYYY-MM-DD" till millisekunder i UTC, eller undefined om datumet är ogiltigt. */
function tryParseIsoDate(date: string): number | undefined {
  const match = ISO_DATE.exec(date);
  if (!match) return undefined;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  // setUTCFullYear i stället för Date.UTC, som tolkar år 0–99 som 1900–1999.
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  const time = parsed.getTime();
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return undefined;
  }
  return time;
}

/** Tolkar "YYYY-MM-DD" till millisekunder i UTC. Kastar fel vid ogiltigt datum. */
function parseIsoDate(date: IsoDate): number {
  const time = tryParseIsoDate(date);
  if (time === undefined) throw new Error(`Ogiltigt datum: ${date}`);
  return time;
}

/**
 * Kontrollerar att en sträng är ett giltigt datum på formen "YYYY-MM-DD",
 * t.ex. "2028-02-29" men inte "2027-02-29" eller "2026-1-5". Gränssnittet kan
 * använda den innan det anropar addDays.
 */
export function isValidIsoDate(s: string): boolean {
  return tryParseIsoDate(s) !== undefined;
}

function formatUtc(date: Date): IsoDate {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Lägger till (eller drar ifrån, vid negativt värde) hela dagar på ett ISO-datum. */
export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) throw new Error(`Antal dagar måste vara ett heltal: ${days}`);
  return formatUtc(new Date(parseIsoDate(date) + days * MS_PER_DAY));
}

/** Dagens datum som ISO-sträng i lokal tid. */
export function today(): IsoDate {
  const now = new Date();
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Status för översikten: obetald faktura efter förfallodatum blir "overdue".
 * En okänd status (t.ex. från trasig lagrad data) behandlas som "unpaid", så
 * att fakturan syns bland de obetalda i stället för att försvinna.
 */
export function displayStatus(
  invoice: Invoice,
  todayDate: IsoDate,
  invoices?: Invoice[],
): InvoiceDisplayStatus {
  if (invoice.status !== 'draft') {
    if (invoice.creditFor !== undefined) return 'credit-note';
    const credited = invoices?.some(
      (other) => other.creditFor === invoice.id && other.status !== 'draft',
    );
    if (credited) return 'credited';
  }
  switch (invoice.status) {
    case 'draft':
      return 'draft';
    case 'paid':
      return 'paid';
    case 'sent':
      return todayDate > invoice.dueDate ? 'overdue' : 'unpaid';
    default:
      return 'unpaid';
  }
}
