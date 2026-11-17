import { daysBetween } from './dates';
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

/**
 * Dröjsmålsränta i heltal: kapital (öre) × räntesats i hundradels procent × dagar
 * / (10 000 × 365), avrundat till närmaste öre med halva ören bort från noll.
 * BigInt används så att stora belopp inte tappar precision.
 */
function lateInterest(principal: Ore, percent: number, daysLate: number): Ore {
  const basisPoints = BigInt(Math.round(percent * 100));
  const numerator = BigInt(principal) * basisPoints * BigInt(daysLate);
  const divisor = 10_000n * 365n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (2n * magnitude + divisor) / (2n * divisor);
  return Number(numerator < 0n ? -rounded : rounded);
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
  const interest = lateInterest(principal, percent, daysLate);
  const fee = Math.min(Math.max(0, settings.reminderFee ?? 0), MAX_REMINDER_FEE);
  return { principal, daysLate, interest, fee, total: principal + interest + fee };
}
