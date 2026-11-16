/**
 * Hjälpfunktioner och påhittad testdata för acceptanstesterna.
 * All data här är fiktiv (AGENTS.md regel 7).
 */
import { createOcr, type CompanySettings, type Customer, type Invoice, type InvoiceLine, type VatRate } from '../../src/core';

/** Enkel Storage i minnet så att varje test får en egen, tom lagring. */
export function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
  };
}

/** Alla nycklar i en Storage. */
export function storageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}

let lineCounter = 0;

export function line(quantity: number, unitPrice: number, vatRate: VatRate): InvoiceLine {
  lineCounter += 1;
  return { id: `rad-${lineCounter}`, description: `Testrad ${lineCounter}`, quantity, unitPrice, vatRate };
}

export function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'kund-1',
    name: 'Testkund AB',
    orgNumber: '556000-0000',
    email: 'faktura@testkund.example',
    address: { street: 'Testgatan 1', postalCode: '123 45', city: 'Teststad' },
    createdAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * En faktura med giltiga standardvärden. Om ocr inte anges räknas den fram
 * ur numret (createOcr), och ett utkast med nummer 0 får ocr ''.
 */
export function invoice(overrides: Partial<Invoice> = {}): Invoice {
  const number = overrides.number ?? 1001;
  return {
    id: 'faktura-1',
    number,
    customerId: 'kund-1',
    issueDate: '2026-03-01',
    dueDate: '2026-03-31',
    lines: [
      { id: 'rad-standard', description: 'Konsulttimme', quantity: 1, unit: 'tim', unitPrice: 100000, vatRate: 25 },
    ],
    ocr: number > 0 ? createOcr(number) : '',
    status: 'sent',
    createdAt: '2026-03-01T10:00:00.000Z',
    ...overrides,
  };
}

export function settings(overrides: Partial<CompanySettings> = {}): CompanySettings {
  return {
    name: 'Testfirma Exempel',
    orgNumber: '556000-0000',
    vatNumber: 'SE556000000001',
    address: { street: 'Påhittade vägen 2', postalCode: '111 11', city: 'Exempelby' },
    bankgiro: '000-0000',
    fSkatt: true,
    paymentTermsDays: 30,
    lateInterestPercent: 8,
    ...overrides,
  };
}
