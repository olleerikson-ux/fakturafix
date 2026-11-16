import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStore } from './storage';
import type { CompanySettings, Customer, Invoice } from './types';

const customer: Customer = {
  id: 'k1',
  name: 'Testkund AB',
  orgNumber: '556000-0000',
  address: { street: 'Testgatan 1', postalCode: '111 22', city: 'Teststad' },
  createdAt: '2026-11-01T10:00:00.000Z',
};

function invoice(id: string, number: number): Invoice {
  return {
    id,
    number,
    customerId: 'k1',
    issueDate: '2026-11-01',
    dueDate: '2026-12-01',
    lines: [],
    ocr: '',
    status: 'draft',
    createdAt: '2026-11-01T10:00:00.000Z',
  };
}

const settings: CompanySettings = {
  name: 'Testfirma',
  orgNumber: '556000-0000',
  address: { street: 'Testvägen 2', postalCode: '222 33', city: 'Testby' },
  fSkatt: true,
  paymentTermsDays: 30,
};

describe('createLocalStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('använder localStorage som standard och sparar en version', () => {
    const store = createLocalStore();
    store.saveCustomer(customer);
    expect(localStorage.getItem('fakturafix:version')).toBe('1');
    expect(localStorage.getItem('fakturafix:customers')).toContain('Testkund AB');
  });

  it('sparar, uppdaterar, hämtar och tar bort kunder', () => {
    const store = createLocalStore(localStorage);
    expect(store.listCustomers()).toEqual([]);

    store.saveCustomer(customer);
    store.saveCustomer({ ...customer, id: 'k2', name: 'Annan Testkund AB' });
    store.saveCustomer({ ...customer, name: 'Testkund AB (ny)' });

    expect(store.listCustomers().map((c) => c.name)).toEqual(['Testkund AB (ny)', 'Annan Testkund AB']);
    expect(store.getCustomer('k1')?.name).toBe('Testkund AB (ny)');
    expect(store.getCustomer('saknas')).toBeUndefined();

    store.deleteCustomer('k1');
    expect(store.listCustomers().map((c) => c.id)).toEqual(['k2']);
  });

  it('sparar, uppdaterar, hämtar och tar bort fakturor', () => {
    const store = createLocalStore(localStorage);
    store.saveInvoice(invoice('f1', 1001));
    store.saveInvoice({ ...invoice('f1', 1001), status: 'sent' });

    expect(store.listInvoices()).toHaveLength(1);
    expect(store.getInvoice('f1')?.status).toBe('sent');

    store.saveInvoice(invoice('f2', 0));
    store.deleteInvoice('f2');
    expect(store.getInvoice('f2')).toBeUndefined();
    expect(() => store.deleteInvoice('saknas')).not.toThrow();
  });

  it.each(['sent', 'paid'] as const)('vägrar radera en faktura med status %s', (status) => {
    const store = createLocalStore(localStorage);
    store.saveInvoice({ ...invoice('f1', 1001), status });
    expect(() => store.deleteInvoice('f1')).toThrow(/kan inte raderas/);
    expect(store.getInvoice('f1')).toBeDefined();
  });

  it('återanvänder aldrig ett fakturanummer och utkast med nummer 0 påverkar inte serien', () => {
    const store = createLocalStore(localStorage);
    store.saveInvoice({ ...invoice('f1', 1001), status: 'sent' });
    store.saveInvoice(invoice('utkast', 0));
    store.deleteInvoice('utkast');
    expect(store.nextInvoiceNumber()).toBe(1002);
    expect(localStorage.getItem('fakturafix:lastInvoiceNumber')).toBe('1001');
    expect(createLocalStore(localStorage).nextInvoiceNumber()).toBe(1002);
  });

  it('vägrar göra om en utfärdad faktura till utkast', () => {
    const store = createLocalStore(localStorage);
    const sent: Invoice = { ...invoice('f1', 1001), ocr: '100164', status: 'sent' };
    store.saveInvoice(sent);
    expect(() => store.saveInvoice({ ...sent, status: 'draft' })).toThrow(/utkast/);
    expect(store.getInvoice('f1')?.status).toBe('sent');
  });

  it('vägrar byta nummer eller OCR på en utfärdad faktura', () => {
    const store = createLocalStore(localStorage);
    const sent: Invoice = { ...invoice('f1', 1001), ocr: '100164', status: 'sent' };
    store.saveInvoice(sent);
    expect(() => store.saveInvoice({ ...sent, number: 1002 })).toThrow(/nummer/);
    expect(() => store.saveInvoice({ ...sent, ocr: '100260' })).toThrow(/OCR/);
    expect(store.getInvoice('f1')).toEqual(sent);
  });

  it('tillåter att en skickad faktura markeras som betald och att betaldatum ändras', () => {
    const store = createLocalStore(localStorage);
    const sent: Invoice = { ...invoice('f1', 1001), ocr: '100164', status: 'sent' };
    store.saveInvoice(sent);
    store.saveInvoice({ ...sent, status: 'paid', paidDate: '2026-12-01' });
    store.saveInvoice({ ...sent, status: 'paid', paidDate: '2026-12-02' });
    expect(store.getInvoice('f1')?.paidDate).toBe('2026-12-02');
  });

  it('tillåter att ett utkast utfärdas med nummer och OCR', () => {
    const store = createLocalStore(localStorage);
    store.saveInvoice(invoice('f1', 0));
    store.saveInvoice({ ...invoice('f1', 1001), ocr: '100164', status: 'sent' });
    expect(store.getInvoice('f1')?.number).toBe(1001);
  });

  it('använder det högsta av högvattenmärket och sparade nummer', () => {
    localStorage.setItem('fakturafix:lastInvoiceNumber', '1010');
    const store = createLocalStore(localStorage);
    expect(store.nextInvoiceNumber()).toBe(1011);
    store.saveInvoice(invoice('f1', 1020));
    expect(store.nextInvoiceNumber()).toBe(1021);
  });

  it('ignorerar ett trasigt högvattenmärke', () => {
    localStorage.setItem('fakturafix:lastInvoiceNumber', '"tusen"');
    expect(createLocalStore(localStorage).nextInvoiceNumber()).toBe(1001);
  });

  it('ger 1001 som första fakturanummer och sedan högsta plus 1', () => {
    const store = createLocalStore(localStorage);
    expect(store.nextInvoiceNumber()).toBe(1001);
    store.saveInvoice(invoice('f1', 1001));
    store.saveInvoice(invoice('f2', 1005));
    store.saveInvoice(invoice('f3', 1002));
    expect(store.nextInvoiceNumber()).toBe(1006);
  });

  it('sparar och hämtar företagsinställningar', () => {
    const store = createLocalStore(localStorage);
    expect(store.getSettings()).toBeUndefined();
    store.saveSettings(settings);
    expect(store.getSettings()).toEqual(settings);
  });

  it('delar data mellan instanser', () => {
    createLocalStore(localStorage).saveCustomer(customer);
    expect(createLocalStore(localStorage).getCustomer('k1')).toEqual(customer);
  });

  it('behandlar trasig JSON som tom data utan att krascha', () => {
    localStorage.setItem('fakturafix:customers', '{inte json');
    localStorage.setItem('fakturafix:invoices', '{"inte":"en lista"}');
    localStorage.setItem('fakturafix:settings', '[1,2,3]');
    const store = createLocalStore(localStorage);

    expect(store.listCustomers()).toEqual([]);
    expect(store.listInvoices()).toEqual([]);
    expect(store.nextInvoiceNumber()).toBe(1001);
    expect(store.getSettings()).toBeUndefined();

    store.saveCustomer(customer);
    expect(store.listCustomers()).toEqual([customer]);
  });

  it('hoppar över poster utan id', () => {
    localStorage.setItem('fakturafix:customers', JSON.stringify([null, 42, { name: 'utan id' }, customer]));
    expect(createLocalStore(localStorage).listCustomers()).toEqual([customer]);
  });

  it('skriver inte över en befintlig version', () => {
    localStorage.setItem('fakturafix:version', '2');
    createLocalStore(localStorage);
    expect(localStorage.getItem('fakturafix:version')).toBe('2');
  });
});

describe('createLocalStore utan tillgänglig lagring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function blockLocalStorage(): void {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Åtkomst nekad', 'SecurityError');
    });
  }

  it('kraschar inte när localStorage kastar SecurityError', () => {
    blockLocalStorage();
    expect(() => createLocalStore()).not.toThrow();
  });

  it('behandlar otillgänglig lagring som tom vid läsning', () => {
    blockLocalStorage();
    const store = createLocalStore();
    expect(store.listCustomers()).toEqual([]);
    expect(store.listInvoices()).toEqual([]);
    expect(store.getSettings()).toBeUndefined();
    expect(store.nextInvoiceNumber()).toBe(1001);
  });

  it('kastar fel vid skrivning till otillgänglig lagring', () => {
    blockLocalStorage();
    const store = createLocalStore();
    expect(() => store.saveCustomer(customer)).toThrow(/inte tillgänglig/);
    expect(() => store.saveInvoice(invoice('f1', 1001))).toThrow(/inte tillgänglig/);
    expect(() => store.saveSettings(settings)).toThrow(/inte tillgänglig/);
  });
});

describe('createLocalStore: validering av sparad data', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sent: Invoice = { ...invoice('f1', 1001), ocr: '100164', status: 'sent' };

  it('hoppar över poster med fel form och varnar en gång per post', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const brokenCustomer = { id: 'k9', name: 'Saknar adress' };
    const brokenInvoices = [
      { ...sent, id: 'x1', lines: 'inte en lista' },
      { ...sent, id: 'x2', number: 1001.5 },
      { ...sent, id: 'x3', number: 500 },
      { ...sent, id: 'x4', dueDate: '2026-02-30' },
      { ...sent, id: 'x5', status: 'arkiverad' },
      { ...sent, id: 'x6', lines: [{ id: 'r', description: 'x', quantity: 1, unitPrice: 100, vatRate: 7 }] },
    ];
    localStorage.setItem('fakturafix:customers', JSON.stringify([brokenCustomer, customer]));
    localStorage.setItem('fakturafix:invoices', JSON.stringify([...brokenInvoices, sent]));
    const store = createLocalStore(localStorage);

    expect(store.listCustomers()).toEqual([customer]);
    expect(store.getCustomer('k9')).toBeUndefined();
    expect(store.listInvoices()).toEqual([sent]);
    expect(warn).toHaveBeenCalledTimes(7);

    store.listInvoices();
    store.listCustomers();
    expect(warn).toHaveBeenCalledTimes(7);
  });

  it('raderar inte trasiga poster när andra poster sparas', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = { id: 'k9', name: 'Saknar adress' };
    localStorage.setItem('fakturafix:customers', JSON.stringify([broken]));
    const store = createLocalStore(localStorage);
    store.saveCustomer(customer);
    store.deleteCustomer('finns-inte');
    expect(JSON.parse(localStorage.getItem('fakturafix:customers') ?? '[]')).toEqual([broken, customer]);
  });

  it('vägrar radera en trasig post som ser utfärdad ut', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem('fakturafix:invoices', JSON.stringify([{ ...sent, lines: null }]));
    expect(() => createLocalStore(localStorage).deleteInvoice('f1')).toThrow(/kan inte raderas/);
  });

  it('ignorerar och varnar för inställningar med fel form', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem('fakturafix:settings', JSON.stringify({ ...settings, fSkatt: 'ja' }));
    expect(createLocalStore(localStorage).getSettings()).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each([NaN, 1.5, -1, 1, 1000])('vägrar spara fakturanummer %s', (number) => {
    const store = createLocalStore(localStorage);
    expect(() => store.saveInvoice(invoice('f1', number))).toThrow(/Ogiltigt fakturanummer/);
    expect(store.listInvoices()).toEqual([]);
  });
});

describe('createLocalStore: utfärdade fakturor är låsta', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const sent: Invoice = { ...invoice('f1', 1001), ocr: '100164', status: 'sent' };

  it.each([
    ['lines', { lines: [{ id: 'r1', description: 'Ny rad', quantity: 1, unitPrice: 100, vatRate: 25 as const }] }],
    ['customerId', { customerId: 'k2' }],
    ['issueDate', { issueDate: '2026-11-02' }],
    ['dueDate', { dueDate: '2026-12-31' }],
  ])('vägrar ändra %s', (field, change) => {
    const store = createLocalStore(localStorage);
    store.saveInvoice(sent);
    expect(() => store.saveInvoice({ ...sent, ...change })).toThrow(new RegExp(`låst.*${field}`));
    expect(store.getInvoice('f1')).toEqual(sent);
  });

  it('tillåter ändrade notes, paidDate och sent -> paid', () => {
    const store = createLocalStore(localStorage);
    store.saveInvoice(sent);
    store.saveInvoice({ ...sent, notes: 'Påminnelse skickad' });
    store.saveInvoice({ ...sent, notes: 'Betald', status: 'paid', paidDate: '2026-12-01' });
    expect(store.getInvoice('f1')).toMatchObject({ status: 'paid', paidDate: '2026-12-01', notes: 'Betald' });
  });

  it('vägrar ändra en betald faktura tillbaka till skickad', () => {
    const store = createLocalStore(localStorage);
    store.saveInvoice({ ...sent, status: 'paid', paidDate: '2026-12-01' });
    expect(() => store.saveInvoice(sent)).toThrow(/betald/);
  });

  it('jämför rader på innehåll, inte på objektidentitet eller nyckelordning', () => {
    const line = { id: 'r1', description: 'Konsulttimme', quantity: 2, unitPrice: 95000, vatRate: 25 as const };
    const store = createLocalStore(localStorage);
    store.saveInvoice({ ...sent, lines: [line] });
    const reordered = { vatRate: 25 as const, unitPrice: 95000, quantity: 2, description: 'Konsulttimme', id: 'r1' };
    expect(() => store.saveInvoice({ ...sent, lines: [reordered], status: 'paid' })).not.toThrow();
  });

  it('utkast får ändras fritt', () => {
    const store = createLocalStore(localStorage);
    const draft = invoice('f1', 0);
    store.saveInvoice(draft);
    store.saveInvoice({ ...draft, customerId: 'k2', dueDate: '2027-01-15' });
    expect(store.getInvoice('f1')?.customerId).toBe('k2');
  });
});

describe('createLocalStore: trasiga sparade fakturor och betaldatum', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sent: Invoice = { ...invoice('f1', 1001), ocr: '100164', status: 'sent' };

  it.each([
    ['utfärdad med trasiga rader', { ...sent, lines: null }],
    ['okänd status', { ...sent, status: 'arkiverad' }],
    ['saknad status', { id: 'f1', number: 1001 }],
  ])('vägrar skriva över en trasig post (%s) och radera den', (_label, broken) => {
    localStorage.setItem('fakturafix:invoices', JSON.stringify([broken]));
    const store = createLocalStore(localStorage);
    expect(() => store.saveInvoice(invoice('f1', 0))).toThrow(/fel form/);
    expect(() => store.deleteInvoice('f1')).toThrow(/kan inte raderas/);
    expect(JSON.parse(localStorage.getItem('fakturafix:invoices') ?? '[]')).toEqual([broken]);
  });

  it('tillåter att ett trasigt utkast skrivs över med en giltig faktura', () => {
    localStorage.setItem('fakturafix:invoices', JSON.stringify([{ ...invoice('f1', 0), lines: null }]));
    const store = createLocalStore(localStorage);
    store.saveInvoice(invoice('f1', 0));
    expect(store.getInvoice('f1')).toEqual(invoice('f1', 0));
  });

  it.each(['draft', 'sent'] as const)('vägrar betaldatum när status är %s', (status) => {
    const store = createLocalStore(localStorage);
    const number = status === 'draft' ? 0 : 1001;
    expect(() => store.saveInvoice({ ...invoice('f1', number), status, paidDate: '2026-12-01' })).toThrow(
      /Betaldatum/,
    );
  });
});
