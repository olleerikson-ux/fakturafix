/**
 * Kärnans publika API. Gränssnittet (src/ui) importerar BARA härifrån,
 * aldrig direkt från enskilda filer i src/core.
 *
 * Funktionerna nedan är stubbar som Utvecklare 1 implementerar enligt sina
 * issues. Signaturerna är ett kontrakt: ändra dem inte utan VD:s godkännande.
 */
import type {
  CompanySettings,
  Customer,
  Invoice,
  InvoiceDisplayStatus,
  InvoiceLine,
  InvoiceTotals,
  IsoDate,
  Ore,
} from './types';

export * from './types';

const notImplemented = (name: string): never => {
  throw new Error(`Inte implementerat ännu: ${name}`);
};

// ---- Belopp och moms (issue: kärnlogik) ----

/** Radbelopp exkl. moms i öre, avrundat till närmaste öre. */
export function lineNet(_line: InvoiceLine): Ore {
  return notImplemented('lineNet');
}

/** Summerar fakturarader: netto, moms per sats, öresavrundning och total. */
export function calculateTotals(_lines: InvoiceLine[]): InvoiceTotals {
  return notImplemented('calculateTotals');
}

/** Formaterar öre som svensk valuta, t.ex. 123450 -> "1 234,50 kr". */
export function formatSek(_ore: Ore): string {
  return notImplemented('formatSek');
}

/** Tolkar inmatning som "1 234,50" eller "1234.5" till öre. Ogiltigt -> null. */
export function parseSek(_input: string): Ore | null {
  return notImplemented('parseSek');
}

// ---- OCR (issue: kärnlogik) ----

/** Skapar OCR-nummer från fakturanummer (längdsiffra + Luhn-kontrollsiffra). */
export function createOcr(_invoiceNumber: number): string {
  return notImplemented('createOcr');
}

/** Kontrollerar längdsiffra och Luhn-kontrollsiffra. */
export function isValidOcr(_ocr: string): boolean {
  return notImplemented('isValidOcr');
}

// ---- Datum och status (issue: kärnlogik) ----

/** Lägger till dagar på ett ISO-datum. */
export function addDays(_date: IsoDate, _days: number): IsoDate {
  return notImplemented('addDays');
}

/** Dagens datum som ISO-sträng i lokal tid. */
export function today(): IsoDate {
  return notImplemented('today');
}

/** Status för översikten: obetald faktura efter förfallodatum blir "overdue". */
export function displayStatus(_invoice: Invoice, _today: IsoDate): InvoiceDisplayStatus {
  return notImplemented('displayStatus');
}

// ---- Lagring (issue: lagring) ----

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

/** Skapar ett Store som sparar i webbläsarens localStorage. */
export function createLocalStore(_storage?: Storage): Store {
  return notImplemented('createLocalStore');
}

/** Slumpar ett unikt id. */
export function newId(): string {
  return crypto.randomUUID();
}
