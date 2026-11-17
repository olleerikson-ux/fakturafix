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

/** Standardtext på momsbefriade fakturor. Ska verifieras mot Skatteverket. Användaren kan ändra den. */
export const DEFAULT_VAT_EXEMPT_TEXT = 'Momsbefriad enligt reglerna om momsbefrielse för små företag.';

// ---- Belopp och moms ----
export { formatSek, parseSek } from './money';
export { lineNet, calculateTotals } from './vat';

// ---- OCR ----
export { createOcr, isValidOcr } from './ocr';

// ---- Datum och status ----
export { addDays, today, displayStatus, isValidIsoDate } from './dates';

// ---- Lagring ----
export { createLocalStore } from './storage';

// ---- Kreditfakturor ----
export { createCreditNote } from './credit';

// ---- Säkerhetskopiering ----
export { exportBackup, parseBackup, importBackup } from './backup';
export type { Backup } from './backup';

export interface Store {
  listCustomers(): Customer[];
  getCustomer(id: string): Customer | undefined;
  saveCustomer(customer: Customer): void;
  deleteCustomer(id: string): void;

  listInvoices(): Invoice[];
  getInvoice(id: string): Invoice | undefined;
  saveInvoice(invoice: Invoice): void;
  /**
   * Raderar ett utkast. Utfärdade fakturor (status skild från "draft") kan
   * inte raderas eftersom löpnummerserien måste vara obruten. Då kastas ett fel.
   */
  deleteInvoice(id: string): void;
  /** Nästa lediga fakturanummer (första är 1001). */
  nextInvoiceNumber(): number;
  /**
   * Ersätter ALL data (kunder, fakturor, inställningar, högvattenmärke) med
   * innehållet i en validerad säkerhetskopia. Används bara av importBackup.
   */
  replaceAll(data: {
    customers: Customer[];
    invoices: Invoice[];
    settings?: CompanySettings;
    lastInvoiceNumber: number;
  }): void;

  getSettings(): CompanySettings | undefined;
  saveSettings(settings: CompanySettings): void;
}

/** Slumpar ett unikt id. */
export function newId(): string {
  return crypto.randomUUID();
}
