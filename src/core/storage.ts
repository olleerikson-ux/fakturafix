import type { Store } from './index';
import type { Customer, Invoice } from './types';
import {
  FIRST_INVOICE_NUMBER,
  deepEqual,
  isCompanySettings,
  isCustomer,
  isInvoice,
  isRecord,
  isValidInvoiceNumber,
} from './validation';

const PREFIX = 'fakturafix:';
const KEYS = {
  version: `${PREFIX}version`,
  customers: `${PREFIX}customers`,
  invoices: `${PREFIX}invoices`,
  settings: `${PREFIX}settings`,
  lastInvoiceNumber: `${PREFIX}lastInvoiceNumber`,
} as const;
const STORAGE_VERSION = 1;

interface HasId {
  id: string;
}

/** Fält som får ändras på en utfärdad faktura. Allt annat är låst. */
const EDITABLE_AFTER_ISSUE: readonly string[] = ['status', 'paidDate', 'notes'];

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

/** Läser en lista som den är sparad. Allt som inte är en array blir tomt. */
function readRawList(storage: MaybeStorage, key: string): unknown[] {
  const value = readJson(storage, key);
  return Array.isArray(value) ? value : [];
}

function hasId(value: unknown, id: string): boolean {
  return isRecord(value) && value.id === id;
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

/**
 * Lägger till eller ersätter en post i den sparade listan. Poster som inte
 * klarar valideringen lämnas orörda, så att trasig data inte raderas tyst.
 */
function upsert(items: unknown[], item: HasId): unknown[] {
  const index = items.findIndex((existing) => hasId(existing, item.id));
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

function assertValidInvoiceNumber(invoice: Invoice): void {
  if (!isValidInvoiceNumber(invoice.number)) {
    throw new Error(
      `Ogiltigt fakturanummer: ${invoice.number}. Utkast har 0 och utfärdade fakturor ett heltal från ${FIRST_INVOICE_NUMBER}.`,
    );
  }
}

/**
 * En utfärdad faktura (status skild från "draft") är låst. Bara status (från
 * "sent" till "paid"), paidDate och notes får ändras. Den får alltså inte
 * göras om till ett utkast, byta nummer eller OCR, eller få andra rader,
 * kund eller datum.
 */
function assertIssuedInvoiceUnchanged(existing: Invoice, updated: Invoice): void {
  if (existing.status === 'draft') return;
  const name = `Faktura ${existing.number} är utfärdad`;
  if (updated.status === 'draft') {
    throw new Error(`${name} och kan inte göras om till ett utkast.`);
  }
  if (existing.status === 'paid' && updated.status !== 'paid') {
    throw new Error(`${name} och betald. Statusen kan inte ändras tillbaka.`);
  }
  if (updated.number !== existing.number || updated.ocr !== existing.ocr) {
    throw new Error(`${name} och kan inte byta nummer eller OCR-nummer.`);
  }
  const before: Record<string, unknown> = { ...existing };
  const after: Record<string, unknown> = { ...updated };
  const locked = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => !EDITABLE_AFTER_ISSUE.includes(key) && !deepEqual(before[key], after[key]),
  );
  if (locked.length > 0) {
    throw new Error(`${name} och låst. Följande kan inte ändras: ${locked.join(', ')}.`);
  }
}

/**
 * Skapar ett Store som sparar JSON i webbläsarens localStorage (eller i det
 * Storage-objekt som skickas in, t.ex. i tester). Varje anrop läser direkt
 * från lagringen, så flera Store-instanser ser alltid samma data.
 *
 * Om lagringen inte går att komma åt behandlas den som tom vid läsning och
 * skrivningar kastar fel. Sparade poster som inte har rätt form hoppas över
 * vid läsning och loggas med console.warn (en gång per post), men de raderas
 * inte vid nästa skrivning.
 *
 * Fakturanumren bildar en obruten serie som aldrig återanvänds. Utkast har
 * number 0 och påverkar inte serien. Det högsta utdelade numret sparas som
 * ett högvattenmärke. Utfärdade fakturor (status skild från "draft") kan inte
 * raderas och är låsta utom status (sent -> paid), paidDate och notes.
 */
export function createLocalStore(storageArg?: Storage): Store {
  const storage = resolveStorage(storageArg);
  ensureVersion(storage);

  const warned = new Set<string>();
  const warnOnce = (message: string, value: unknown): void => {
    const signature = `${message}:${JSON.stringify(value)}`;
    if (warned.has(signature)) return;
    warned.add(signature);
    console.warn(`Fakturafix: ${message}`, value);
  };

  function readValid<T>(key: string, guard: (value: unknown) => value is T, label: string): T[] {
    return readRawList(storage, key).filter((value): value is T => {
      if (guard(value)) return true;
      warnOnce(`hoppar över ${label} med fel form i ${key}`, value);
      return false;
    });
  }

  const customers = (): Customer[] => readValid(KEYS.customers, isCustomer, 'en kund');
  const invoices = (): Invoice[] => readValid(KEYS.invoices, isInvoice, 'en faktura');
  const lastInvoiceNumber = (): number =>
    Math.max(
      FIRST_INVOICE_NUMBER - 1,
      readInteger(storage, KEYS.lastInvoiceNumber) ?? 0,
      ...invoices().map((invoice) => invoice.number),
    );

  return {
    listCustomers: customers,
    getCustomer: (id) => customers().find((customer) => customer.id === id),
    saveCustomer: (customer) =>
      writeJson(storage, KEYS.customers, upsert(readRawList(storage, KEYS.customers), customer)),
    deleteCustomer: (id) =>
      writeJson(
        storage,
        KEYS.customers,
        readRawList(storage, KEYS.customers).filter((value) => !hasId(value, id)),
      ),

    listInvoices: invoices,
    getInvoice: (id) => invoices().find((invoice) => invoice.id === id),
    saveInvoice: (invoice) => {
      assertValidInvoiceNumber(invoice);
      const existing = invoices().find((stored) => stored.id === invoice.id);
      if (existing) assertIssuedInvoiceUnchanged(existing, invoice);
      const highest = Math.max(lastInvoiceNumber(), invoice.number);
      writeJson(storage, KEYS.invoices, upsert(readRawList(storage, KEYS.invoices), invoice));
      writeJson(storage, KEYS.lastInvoiceNumber, highest);
    },
    deleteInvoice: (id) => {
      // Kontrollera den sparade posten även om den har fel form, så att en
      // trasig utfärdad faktura inte kan raderas.
      const raw = readRawList(storage, KEYS.invoices);
      const existing = raw.find((value) => hasId(value, id));
      if (!isRecord(existing)) return;
      if (existing.status !== 'draft') {
        throw new Error(
          `Faktura ${String(existing.number)} är utfärdad och kan inte raderas. Skapa en kreditfaktura i stället.`,
        );
      }
      writeJson(storage, KEYS.invoices, raw.filter((value) => !hasId(value, id)));
    },
    nextInvoiceNumber: () => lastInvoiceNumber() + 1,

    getSettings: () => {
      const value = readJson(storage, KEYS.settings);
      if (value === undefined) return undefined;
      if (isCompanySettings(value)) return value;
      warnOnce(`ignorerar företagsinställningar med fel form i ${KEYS.settings}`, value);
      return undefined;
    },
    saveSettings: (settings) => writeJson(storage, KEYS.settings, settings),
  };
}
