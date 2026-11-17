import { daysBetween } from './dates';
import { roundHalfAwayFromZero } from './rounding';
import type { CompanySettings, Invoice, IsoDate, Ore } from './types';
import { calculateTotals } from './vat';

/** Högsta påminnelseavgift enligt lag: 60 kr. */
export const MAX_REMINDER_FEE: Ore = 6000;

export interface ReminderAmounts {
  /** Fakturans "att betala". */
  principal: Ore;
  /** Dagar efter förfallodatum till och med idag, 0 om fakturan inte har förfallit. */
  daysLate: number;
  /** Dröjsmålsränta i öre. */
  interest: Ore;
  /** Påminnelseavgift i öre, högst MAX_REMINDER_FEE. */
  fee: Ore;
  total: Ore;
}

function assertReminderAllowed(invoice: Invoice): void {
  if (invoice.status === 'draft') throw new Error('Ett utkast kan inte påminnas.');
  if (invoice.status === 'paid') throw new Error(`Faktura ${invoice.number} är betald och kan inte påminnas.`);
  if (invoice.creditFor !== undefined) {
    throw new Error(`Faktura ${invoice.number} är en kreditfaktura och kan inte påminnas.`);
  }
}

/** Beräknar belopp för en påminnelse: kapital, dröjsmålsränta och påminnelseavgift. */
export function reminderAmounts(invoice: Invoice, settings: CompanySettings, today: IsoDate): ReminderAmounts {
  assertReminderAllowed(invoice);
  const principal = calculateTotals(invoice.lines).total;
  const daysLate = Math.max(0, daysBetween(invoice.dueDate, today));
  const percent = settings.lateInterestPercent ?? 0;
  const interest = roundHalfAwayFromZero((principal * percent * daysLate) / (100 * 365));
  const fee = Math.min(Math.max(0, settings.reminderFee ?? 0), MAX_REMINDER_FEE);
  return { principal, daysLate, interest, fee, total: principal + interest + fee };
}
