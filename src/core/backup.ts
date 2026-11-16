import type { Store } from "./index";
import type { CompanySettings, Customer, Invoice } from "./types";
import {
  isCompanySettings,
  isCustomer,
  isInvoice,
  isRecord,
} from "./validation";

/** Säkerhetskopia av all data i Fakturafix. */
export interface Backup {
  app: "fakturafix";
  version: 1;
  exportedAt: string;
  customers: Customer[];
  invoices: Invoice[];
  settings?: CompanySettings;
  /** Högsta utdelade fakturanummer (högvattenmärket). */
  lastInvoiceNumber: number;
}

const NOT_A_BACKUP = "Filen är inte en säkerhetskopia från Fakturafix.";

/** Läser all data ur lagringen till en säkerhetskopia. */
export function exportBackup(store: Store): Backup {
  const settings = store.getSettings();
  return {
    app: "fakturafix",
    version: 1,
    exportedAt: new Date().toISOString(),
    customers: store.listCustomers(),
    invoices: store.listInvoices(),
    ...(settings ? { settings } : {}),
    lastInvoiceNumber: store.nextInvoiceNumber() - 1,
  };
}

function readList<T>(
  value: unknown,
  guard: (v: unknown) => v is T,
  label: (v: unknown) => string,
): T[] {
  if (!Array.isArray(value)) throw new Error(NOT_A_BACKUP);
  for (const item of value) {
    if (!guard(item)) throw new Error(`${label(item)} är ogiltig.`);
  }
  return value as T[];
}

function describe(kind: string, item: unknown, key: string): string {
  const id = isRecord(item) ? item[key] : undefined;
  return typeof id === "string" || typeof id === "number"
    ? `${kind} ${id}`
    : `En ${kind.toLowerCase()}`;
}

function assertNoDuplicates(customers: Customer[], invoices: Invoice[]): void {
  const customerIds = new Set<string>();
  for (const customer of customers) {
    if (customerIds.has(customer.id))
      throw new Error(`Kund ${customer.name} förekommer flera gånger.`);
    customerIds.add(customer.id);
  }
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const invoice of invoices) {
    if (ids.has(invoice.id))
      throw new Error(`Faktura ${invoice.number} förekommer flera gånger.`);
    ids.add(invoice.id);
    if (invoice.number > 0) {
      if (numbers.has(invoice.number))
        throw new Error(
          `Fakturanummer ${invoice.number} används flera gånger.`,
        );
      numbers.add(invoice.number);
    }
  }
}

/** Tolkar och validerar en säkerhetskopia. Kastar fel med svenskt meddelande. */
export function parseBackup(json: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Filen går inte att läsa. Den är inte giltig JSON.");
  }
  if (!isRecord(data) || data.app !== "fakturafix")
    throw new Error(NOT_A_BACKUP);
  if (data.version !== 1) {
    throw new Error(
      `Säkerhetskopians version (${String(data.version)}) stöds inte. Förväntad version är 1.`,
    );
  }
  if (typeof data.exportedAt !== "string") throw new Error(NOT_A_BACKUP);
  const customers = readList(data.customers, isCustomer, (v) =>
    describe("Kund", v, "name"),
  );
  const invoices = readList(data.invoices, isInvoice, (v) =>
    describe("Faktura", v, "number"),
  );
  if (data.settings !== undefined && !isCompanySettings(data.settings)) {
    throw new Error("Företagsinställningarna är ogiltiga.");
  }
  if (
    !Number.isSafeInteger(data.lastInvoiceNumber) ||
    (data.lastInvoiceNumber as number) < 0
  ) {
    throw new Error("Högsta fakturanummer är ogiltigt.");
  }
  assertNoDuplicates(customers, invoices);
  return {
    app: "fakturafix",
    version: 1,
    exportedAt: data.exportedAt,
    customers,
    invoices,
    ...(data.settings !== undefined ? { settings: data.settings } : {}),
    lastInvoiceNumber: data.lastInvoiceNumber as number,
  };
}

/** Ersätter all data i lagringen med säkerhetskopian. Nummerserien går aldrig bakåt. */
export function importBackup(
  store: Store,
  backup: Backup,
  mode: "replace",
): void {
  if (mode !== "replace") throw new Error(`Okänt importläge: ${String(mode)}`);
  const highest = Math.max(
    backup.lastInvoiceNumber,
    store.nextInvoiceNumber() - 1,
    ...backup.invoices.map((invoice) => invoice.number),
  );
  store.replaceAll({
    customers: backup.customers,
    invoices: backup.invoices,
    ...(backup.settings ? { settings: backup.settings } : {}),
    lastInvoiceNumber: highest,
  });
}
