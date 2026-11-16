/**
 * Kärnans publika API. Gränssnittet (src/ui) importerar BARA härifrån,
 * aldrig direkt från enskilda filer i src/core.
 *
 * Implementationen ligger i egna filer (money, vat, ocr, dates, storage) och
 * exporteras vidare härifrån. Signaturerna är ett kontrakt: ändra dem inte
 * utan VD:s godkännande.
 */
import type { CompanySettings, Customer, Invoice } from './types';

export * from './types';

// ---- Belopp och moms ----
export { formatSek, parseSek } from './money';
export { lineNet, calculateTotals } from './vat';

// ---- OCR ----
export { createOcr, isValidOcr } from './ocr';

// ---- Datum och status ----
export { addDays, today, displayStatus } from './dates';

// ---- Lagring ----
export { createLocalStore } from './storage';

export interface Store {
  listCustomers(): Customer[];
  getCustomer(id: string): Customer | undefined;
  saveCustomer(customer: Customer): void;
  deleteCustomer(id: string): void;

  listInvoices(): Invoice[];
  getInvoice(id: string): Invoice | undefined;
  saveInvoice(invoice: Invoice): void;
  deleteInvoice(id: string): void;
  /** Nästa lediga fakturanummer (första är 1001). */
  nextInvoiceNumber(): number;

  getSettings(): CompanySettings | undefined;
  saveSettings(settings: CompanySettings): void;
}

/** Slumpar ett unikt id. */
export function newId(): string {
  return crypto.randomUUID();
}
