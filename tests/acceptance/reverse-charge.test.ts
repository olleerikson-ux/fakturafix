/**
 * Acceptanstester för issue #51 (del B): omvänd skattskyldighet.
 * Reglerna kommer från issuen: vid utfärdande med reverseCharge: true måste alla rader
 * ha 0 % moms, kunden ha vatNumber och säljaren ha vatNumber och inte vara momsbefriad.
 * Fältet låses efter utfärdandet, och en kreditfaktura ärver det från originalet.
 */
import { describe, expect, it } from 'vitest';
import {
  createCreditNote,
  createLocalStore,
  createOcr,
  REVERSE_CHARGE_TEXT,
  type Invoice,
  type Store,
} from '../../src/core';
import { customer, invoice, line, memoryStorage, settings } from './helpers';

const EU_CUSTOMER = { id: 'kund-eu', name: 'Testkund GmbH', vatNumber: 'DE000000000', reverseCharge: true };

function setup(options: { customerVat?: boolean; sellerVat?: boolean; sellerExempt?: boolean } = {}): Store {
  const { customerVat = true, sellerVat = true, sellerExempt = false } = options;
  const store = createLocalStore(memoryStorage());
  store.saveCustomer(customer({ ...EU_CUSTOMER, ...(customerVat ? {} : { vatNumber: undefined }) }));
  store.saveSettings(
    settings({
      ...(sellerVat ? {} : { vatNumber: undefined }),
      ...(sellerExempt ? { vatExempt: true } : {}),
    }),
  );
  return store;
}

function reverseChargeInvoice(store: Store, overrides: Partial<Invoice> = {}): Invoice {
  const number = store.nextInvoiceNumber();
  return invoice({
    id: `faktura-${number}`,
    customerId: EU_CUSTOMER.id,
    number,
    ocr: createOcr(number),
    status: 'sent',
    reverseCharge: true,
    lines: [line(1, 100000, 0)],
    ...overrides,
  });
}

describe('omvänd skattskyldighet: utfärdande', () => {
  it('exporterar standardtexten', () => {
    expect(REVERSE_CHARGE_TEXT).toBe('Omvänd skattskyldighet');
  });

  it('utfärdar när alla villkor är uppfyllda', () => {
    const store = setup();
    const issued = reverseChargeInvoice(store);
    store.saveInvoice(issued);
    expect(store.getInvoice(issued.id)?.reverseCharge).toBe(true);
  });

  it('avvisar en rad med moms', () => {
    const store = setup();
    const bad = reverseChargeInvoice(store, { lines: [line(1, 100000, 0), line(1, 50000, 25)] });
    expect(() => store.saveInvoice(bad)).toThrow(/moms/i);
    expect(store.listInvoices()).toEqual([]);
  });

  it('avvisar när kunden saknar vatNumber', () => {
    const store = setup({ customerVat: false });
    expect(() => store.saveInvoice(reverseChargeInvoice(store))).toThrow(/momsregistreringsnummer|vatNumber|momsnummer/i);
    expect(store.listInvoices()).toEqual([]);
  });

  it('avvisar när säljaren saknar vatNumber', () => {
    const store = setup({ sellerVat: false });
    expect(() => store.saveInvoice(reverseChargeInvoice(store))).toThrow(/momsregistreringsnummer|vatNumber|momsnummer/i);
    expect(store.listInvoices()).toEqual([]);
  });

  it('avvisar när säljaren är momsbefriad', () => {
    const store = setup({ sellerExempt: true });
    expect(() => store.saveInvoice(reverseChargeInvoice(store))).toThrow(/momsbefri/i);
    expect(store.listInvoices()).toEqual([]);
  });

  it('kräver inte reglerna för en vanlig faktura', () => {
    const store = setup({ customerVat: false, sellerVat: false });
    const number = store.nextInvoiceNumber();
    expect(() =>
      store.saveInvoice(invoice({ id: 'vanlig', customerId: EU_CUSTOMER.id, number, ocr: createOcr(number), status: 'sent' })),
    ).not.toThrow();
  });

  it('tillåter ett utkast med moms, men blockerar utfärdandet', () => {
    const store = setup();
    const draft = reverseChargeInvoice(store, { number: 0, ocr: '', status: 'draft', lines: [line(1, 100000, 25)] });
    expect(() => store.saveInvoice(draft)).not.toThrow();
    const number = store.nextInvoiceNumber();
    expect(() => store.saveInvoice({ ...draft, number, ocr: createOcr(number), status: 'sent' })).toThrow(/moms/i);
    expect(store.getInvoice(draft.id)?.status).toBe('draft');
    expect(store.nextInvoiceNumber()).toBe(number);
  });
});

describe('omvänd skattskyldighet: låsning', () => {
  it('reverseCharge går inte att ändra efter utfärdandet', () => {
    const store = setup();
    const issued = reverseChargeInvoice(store);
    store.saveInvoice(issued);
    expect(() => store.saveInvoice({ ...issued, reverseCharge: false })).toThrow(/reverseCharge|låst/i);
    const { reverseCharge: _removed, ...without } = issued;
    expect(() => store.saveInvoice(without)).toThrow(/reverseCharge|låst/i);
    expect(store.getInvoice(issued.id)?.reverseCharge).toBe(true);
  });

  it('en utfärdad faktura kan fortfarande markeras som betald', () => {
    const store = setup();
    const issued = reverseChargeInvoice(store);
    store.saveInvoice(issued);
    store.saveInvoice({ ...issued, status: 'paid', paidDate: '2026-03-20' });
    const saved = store.getInvoice(issued.id);
    expect(saved?.status).toBe('paid');
    expect(saved?.reverseCharge).toBe(true);
  });

  it('en vanlig faktura går inte att göra om till omvänd skattskyldighet efteråt', () => {
    const store = setup();
    const number = store.nextInvoiceNumber();
    const normal = invoice({ id: 'vanlig', customerId: EU_CUSTOMER.id, number, ocr: createOcr(number), status: 'sent', lines: [line(1, 100000, 0)] });
    store.saveInvoice(normal);
    expect(() => store.saveInvoice({ ...normal, reverseCharge: true })).toThrow(/reverseCharge|låst/i);
  });
});

describe('omvänd skattskyldighet: kreditfaktura', () => {
  it('createCreditNote ärver reverseCharge från originalet', () => {
    const store = setup();
    const original = reverseChargeInvoice(store);
    store.saveInvoice(original);
    const credit = createCreditNote(original, '2026-04-01');
    expect(credit.reverseCharge).toBe(true);
    expect(credit.creditFor).toBe(original.id);
  });

  it('en utfärdad kreditfaktura behåller reverseCharge från originalet', () => {
    const store = setup();
    const original = reverseChargeInvoice(store);
    store.saveInvoice(original);
    const credit = createCreditNote(original, '2026-04-01');
    const number = store.nextInvoiceNumber();
    store.saveInvoice({ ...credit, number, ocr: createOcr(number), status: 'sent' });
    expect(store.getInvoice(credit.id)?.reverseCharge).toBe(true);
  });

  it('en vanlig original ger en vanlig kreditfaktura', () => {
    const original = invoice({ id: 'vanlig', number: 1001, status: 'sent' });
    expect(createCreditNote(original, '2026-04-01').reverseCharge).not.toBe(true);
  });
});

describe('omvänd skattskyldighet: bakåtkompatibilitet', () => {
  it('gamla fakturor och kunder utan fälten fungerar som förut', () => {
    const store = createLocalStore(memoryStorage());
    store.saveCustomer(customer());
    store.saveInvoice(invoice({ id: 'gammal', number: 1001, status: 'sent' }));
    expect(store.getCustomer('kund-1')?.reverseCharge).toBeUndefined();
    expect(store.getInvoice('gammal')?.reverseCharge).toBeUndefined();
  });
});
