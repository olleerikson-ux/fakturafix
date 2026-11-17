import { isValidIsoDate } from './dates';
import type { Invoice, IsoDate } from './types';

/** Skapar ett utkast till kreditfaktura för en utfärdad faktura. */
export function createCreditNote(original: Invoice, today: IsoDate): Invoice {
  if (original.status === 'draft') {
    throw new Error('Ett utkast kan inte krediteras. Radera utkastet i stället.');
  }
  if (original.creditFor !== undefined) {
    throw new Error('En kreditfaktura kan inte själv krediteras.');
  }
  if (!isValidIsoDate(today)) throw new Error(`Ogiltigt datum: ${today}`);
  return {
    id: crypto.randomUUID(),
    number: 0,
    customerId: original.customerId,
    issueDate: today,
    dueDate: today,
    lines: original.lines.map((line) => ({
      ...line,
      id: crypto.randomUUID(),
      quantity: 0 - line.quantity,
    })),
    ocr: '',
    status: 'draft',
    creditFor: original.id,
    ...(original.vatExempt ? { vatExempt: true } : {}),
    ...(original.reverseCharge ? { reverseCharge: true } : {}),
    notes: `Kreditering av faktura ${original.number} (${original.issueDate})`,
    createdAt: new Date().toISOString(),
  };
}
