import type { Store } from './index';
import type { CompanySettings, Customer, Invoice } from './types';

const PREFIX = 'fakturafix:';
const KEYS = {
  version: `${PREFIX}version`,
  customers: `${PREFIX}customers`,
  invoices: `${PREFIX}invoices`,
  settings: `${PREFIX}settings`,
  lastInvoiceNumber: `${PREFIX}lastInvoiceNumber`,
} as const;
const STORAGE_VERSION = 1;
const FIRST_INVOICE_NUMBER = 1001;

interface HasId {
  id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasId(value: unknown): value is HasId {
  return isRecord(value) && typeof value.id === 'string';
}

/** Lagringen, eller undefined om den inte går att komma åt (t.ex. SecurityError). */
type MaybeStorage = Storage | undefined;

/**
 * Hämtar det Storage-objekt som ska användas. I vissa webbläsarlägen kastar
 * redan åtkomsten till `localStorage` ett SecurityError, så den görs här
 * inuti try/catch i stället för i ett standardargument.
 */
function resolveStorage(storage: Storage | undefined): MaybeStorage {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/** Läser JSON. Saknad nyckel, trasig JSON eller otillgänglig lagring ger undefined. */
function readJson(storage: MaybeStorage, key: string): unknown {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

/**
 * Läser en lista med poster. Allt som inte är en array behandlas som tom
 * data, och element utan sträng-id hoppas över.
 */
function readList<T extends HasId>(storage: MaybeStorage, key: string): T[] {
  const value = readJson(storage, key);
  if (!Array.isArray(value)) return [];
  return value.filter(hasId) as unknown as T[];
}

/** Läser ett heltal. Allt annat ger undefined. */
function readInteger(storage: MaybeStorage, key: string): number | undefined {
  const value = readJson(storage, key);
  return Number.isSafeInteger(value) ? (value as number) : undefined;
}

/** Skriver JSON. Kastar fel om lagringen är otillgänglig, så att gränssnittet kan visa det. */
function writeJson(storage: MaybeStorage, key: string, value: unknown): void {
  if (!storage) {
    throw new Error('Lagringen är inte tillgänglig. Ändringen kunde inte sparas.');
  }
  storage.setItem(key, JSON.stringify(value));
}

function upsert<T extends HasId>(items: T[], item: T): T[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((existing, i) => (i === index ? item : existing));
}

function ensureVersion(storage: MaybeStorage): void {
  try {
    if (storage && storage.getItem(KEYS.version) === null) {
      writeJson(storage, KEYS.version, STORAGE_VERSION);
    }
  } catch {
    // Lagringen kan vara full eller spärrad. Appen ska ändå starta.
  }
}

/**
 * En utfärdad faktura (status skild från "draft") får inte göras om till ett
 * utkast och får inte byta nummer eller OCR. Annars skulle den kunna raderas
 * eller ge luckor och dubbletter i löpnummerserien. Övergången från "sent"
 * till "paid" och ändringar av t.ex. paidDate är tillåtna.
 */
function assertIssuedInvoiceUnchanged(existing: Invoice, updated: Invoice): void {
  if (existing.status === 'draft') return;
  if (updated.status === 'draft') {
    throw new Error(`Faktura ${existing.number} är utfärdad och kan inte göras om till ett utkast.`);
  }
  if (updated.number !== existing.number || updated.ocr !== existing.ocr) {
    throw new Error(`Faktura ${existing.number} är utfärdad och kan inte byta nummer eller OCR-nummer.`);
  }
}

/**
 * Skapar ett Store som sparar JSON i webbläsarens localStorage (eller i det
 * Storage-objekt som skickas in, t.ex. i tester). Varje anrop läser direkt
 * från lagringen, så flera Store-instanser ser alltid samma data.
 *
 * Om lagringen inte går att komma åt behandlas den som tom vid läsning och
 * skrivningar kastar fel.
 *
 * Fakturanumren bildar en obruten serie som aldrig återanvänds. Utkast har
 * number 0 och påverkar inte serien. Det högsta utdelade numret sparas som
 * ett högvattenmärke. Utfärdade fakturor (status skild från "draft") kan inte
 * raderas, göras om till utkast eller byta nummer eller OCR.
 */
export function createLocalStore(storageArg?: Storage): Store {
  const storage = resolveStorage(storageArg);
  ensureVersion(storage);

  const customers = (): Customer[] => readList<Customer>(storage, KEYS.customers);
  const invoices = (): Invoice[] => readList<Invoice>(storage, KEYS.invoices);
  const lastInvoiceNumber = (): number =>
    Math.max(
      FIRST_INVOICE_NUMBER - 1,
      readInteger(storage, KEYS.lastInvoiceNumber) ?? 0,
      ...invoices()
        .map((invoice) => invoice.number)
        .filter((n) => Number.isSafeInteger(n)),
    );

  return {
    listCustomers: customers,
    getCustomer: (id) => customers().find((customer) => customer.id === id),
    saveCustomer: (customer) => writeJson(storage, KEYS.customers, upsert(customers(), customer)),
    deleteCustomer: (id) =>
      writeJson(storage, KEYS.customers, customers().filter((customer) => customer.id !== id)),

    listInvoices: invoices,
    getInvoice: (id) => invoices().find((invoice) => invoice.id === id),
    saveInvoice: (invoice) => {
      const existing = invoices().find((stored) => stored.id === invoice.id);
      if (existing) assertIssuedInvoiceUnchanged(existing, invoice);
      const highest = Math.max(lastInvoiceNumber(), invoice.number);
      writeJson(storage, KEYS.invoices, upsert(invoices(), invoice));
      writeJson(storage, KEYS.lastInvoiceNumber, highest);
    },
    deleteInvoice: (id) => {
      const existing = invoices().find((invoice) => invoice.id === id);
      if (!existing) return;
      if (existing.status !== 'draft') {
        throw new Error(
          `Faktura ${existing.number} är utfärdad och kan inte raderas. Skapa en kreditfaktura i stället.`,
        );
      }
      writeJson(storage, KEYS.invoices, invoices().filter((invoice) => invoice.id !== id));
    },
    nextInvoiceNumber: () => lastInvoiceNumber() + 1,

    getSettings: () => {
      const value = readJson(storage, KEYS.settings);
      return isRecord(value) ? (value as unknown as CompanySettings) : undefined;
    },
    saveSettings: (settings) => writeJson(storage, KEYS.settings, settings),
  };
}
