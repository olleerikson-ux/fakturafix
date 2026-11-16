import type { Store } from './index';
import type { CompanySettings, Customer, Invoice } from './types';

const PREFIX = 'fakturafix:';
const KEYS = {
  version: `${PREFIX}version`,
  customers: `${PREFIX}customers`,
  invoices: `${PREFIX}invoices`,
  settings: `${PREFIX}settings`,
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

/** Läser JSON. Saknad nyckel, trasig JSON eller ett fel från lagringen ger undefined. */
function readJson(storage: Storage, key: string): unknown {
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
function readList<T extends HasId>(storage: Storage, key: string): T[] {
  const value = readJson(storage, key);
  if (!Array.isArray(value)) return [];
  return value.filter(hasId) as unknown as T[];
}

function writeJson(storage: Storage, key: string, value: unknown): void {
  storage.setItem(key, JSON.stringify(value));
}

function upsert<T extends HasId>(items: T[], item: T): T[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((existing, i) => (i === index ? item : existing));
}

function ensureVersion(storage: Storage): void {
  try {
    if (storage.getItem(KEYS.version) === null) {
      writeJson(storage, KEYS.version, STORAGE_VERSION);
    }
  } catch {
    // Lagringen kan vara otillgänglig (t.ex. privat läge). Appen ska ändå starta.
  }
}

/**
 * Skapar ett Store som sparar JSON i webbläsarens localStorage (eller i det
 * Storage-objekt som skickas in, t.ex. i tester). Varje anrop läser direkt
 * från lagringen, så flera Store-instanser ser alltid samma data.
 */
export function createLocalStore(storage: Storage = globalThis.localStorage): Store {
  ensureVersion(storage);

  const customers = (): Customer[] => readList<Customer>(storage, KEYS.customers);
  const invoices = (): Invoice[] => readList<Invoice>(storage, KEYS.invoices);

  return {
    listCustomers: customers,
    getCustomer: (id) => customers().find((customer) => customer.id === id),
    saveCustomer: (customer) => writeJson(storage, KEYS.customers, upsert(customers(), customer)),
    deleteCustomer: (id) =>
      writeJson(storage, KEYS.customers, customers().filter((customer) => customer.id !== id)),

    listInvoices: invoices,
    getInvoice: (id) => invoices().find((invoice) => invoice.id === id),
    saveInvoice: (invoice) => writeJson(storage, KEYS.invoices, upsert(invoices(), invoice)),
    deleteInvoice: (id) =>
      writeJson(storage, KEYS.invoices, invoices().filter((invoice) => invoice.id !== id)),
    nextInvoiceNumber: () => {
      const numbers = invoices()
        .map((invoice) => invoice.number)
        .filter((n) => Number.isInteger(n));
      return Math.max(FIRST_INVOICE_NUMBER - 1, ...numbers) + 1;
    },

    getSettings: () => {
      const value = readJson(storage, KEYS.settings);
      return isRecord(value) ? (value as unknown as CompanySettings) : undefined;
    },
    saveSettings: (settings) => writeJson(storage, KEYS.settings, settings),
  };
}
