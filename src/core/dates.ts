import type { Invoice, InvoiceDisplayStatus, IsoDate } from './types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** Tolkar "YYYY-MM-DD" till millisekunder i UTC. Kastar fel vid ogiltigt datum. */
function parseIsoDate(date: IsoDate): number {
  const match = ISO_DATE.exec(date);
  if (!match) throw new Error(`Ogiltigt datum: ${date}`);
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);
  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`Ogiltigt datum: ${date}`);
  }
  return time;
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

/** Status för översikten: obetald faktura efter förfallodatum blir "overdue". */
export function displayStatus(invoice: Invoice, todayDate: IsoDate): InvoiceDisplayStatus {
  switch (invoice.status) {
    case 'draft':
      return 'draft';
    case 'paid':
      return 'paid';
    case 'sent':
      return todayDate > invoice.dueDate ? 'overdue' : 'unpaid';
  }
}
