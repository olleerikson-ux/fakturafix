import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  createLocalStore,
  formatSek,
  today,
  type CompanySettings,
  type Customer,
  type Invoice,
  type Store,
} from '../../core/index';
import { fill } from '../test-utils';
import {
  invoiceFormView,
  oreToInput,
  parseQuantity,
  validateInvoice,
  type InvoiceInput,
} from './invoice-form';

const customer: Customer = {
  id: 'k1',
  name: 'Testkund AB',
  orgNumber: '556000-0000',
  address: { street: 'Testgatan 1', postalCode: '123 45', city: 'Teststad' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const settings: CompanySettings = {
  name: 'Testfirman',
  orgNumber: '556000-0001',
  address: { street: 'Påhittad väg 2', postalCode: '543 21', city: 'Exempelby' },
  bankgiro: '123-4567',
  fSkatt: true,
  paymentTermsDays: 20,
};

const draft: Invoice = {
  id: 'f1',
  number: 0,
  customerId: 'k1',
  issueDate: '2026-03-01',
  dueDate: '2026-03-31',
  lines: [{ id: 'r1', description: 'Konsulttimmar', quantity: 1.5, unit: 'tim', unitPrice: 100000, vatRate: 25 }],
  ocr: '',
  status: 'draft',
  createdAt: '2026-03-01T00:00:00.000Z',
};

function getForm(root: HTMLElement): HTMLFormElement {
  const form = root.querySelector('form');
  if (!form) throw new Error('Formuläret saknas');
  return form;
}

function control(root: HTMLElement, name: string): HTMLInputElement | HTMLSelectElement {
  const el = getForm(root).elements.namedItem(name);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) throw new Error(`Fält saknas: ${name}`);
  return el;
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!found) throw new Error(`Knappen saknas: ${text}`);
  return found;
}

/** Namnen på radfälten, i ordning, för den första raden i formuläret. */
function firstLine(root: HTMLElement): (field: string) => string {
  const id = root.querySelector<HTMLElement>('[data-line]')?.dataset.line;
  if (!id) throw new Error('Ingen rad');
  return (field) => `line-${id}-${field}`;
}

function totalsText(root: HTMLElement): string {
  return root.querySelector('.totals')?.textContent ?? '';
}

function input(root: HTMLElement, name: string, value: string): void {
  const el = control(root, name);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('invoiceFormView', () => {
  let root: HTMLElement;
  let store: Store;

  beforeEach(() => {
    localStorage.clear();
    root = document.createElement('div');
    document.body.append(root);
    store = createLocalStore(localStorage);
    store.saveCustomer(customer);
    store.saveSettings(settings);
  });

  afterEach(() => {
    root.remove();
    vi.restoreAllMocks();
    history.replaceState(null, '', '#');
  });

  it('ber användaren lägga till en kund först om kundregistret är tomt', () => {
    store.deleteCustomer('k1');
    invoiceFormView(root, store);
    expect(root.querySelector('a[href="#/kunder"]')).not.toBeNull();
    expect(root.querySelector('form')).toBeNull();
  });

  it('visar en ny faktura med dagens datum, förfallodatum enligt villkoren och en tom rad', () => {
    invoiceFormView(root, store);
    expect(root.querySelector('h1')?.textContent).toBe('Ny faktura');
    expect(control(root, 'issueDate').value).toBe(today());
    expect(control(root, 'dueDate').value).toBe(addDays(today(), 20));
    expect(root.querySelectorAll('[data-line]')).toHaveLength(1);
    expect(control(root, 'customerId').value).toBe('');
    expect([...(control(root, 'customerId') as HTMLSelectElement).options].map((o) => o.text)).toContain('Testkund AB');
    for (const el of getForm(root).querySelectorAll('input, select, textarea')) {
      expect(root.querySelector(`label[for="${el.id}"]`)).not.toBeNull();
    }
  });

  it('flyttar förfallodatumet när fakturadatumet ändras, men inte efter att det ändrats för hand', () => {
    invoiceFormView(root, store);
    input(root, 'issueDate', '2026-05-01');
    expect(control(root, 'dueDate').value).toBe('2026-05-21');
    input(root, 'dueDate', '2026-06-15');
    input(root, 'issueDate', '2026-05-10');
    expect(control(root, 'dueDate').value).toBe('2026-06-15');
  });

  it('summerar live med netto, moms per sats, öresavrundning och att betala', () => {
    invoiceFormView(root, store);
    const line = firstLine(root);
    input(root, line('description'), 'Konsulttimmar');
    input(root, line('quantity'), '2');
    input(root, line('unitPrice'), '100,10');

    const text = totalsText(root);
    expect(text).toContain(formatSek(20020));
    expect(text).toContain('Moms 25 %');
    expect(text).toContain(formatSek(5005));
    expect(text).toContain(formatSek(-25));
    expect(text).toContain(formatSek(25000));

    const vat = control(root, line('vatRate'));
    vat.value = '6';
    vat.dispatchEvent(new Event('change', { bubbles: true }));
    expect(totalsText(root)).toContain('Moms 6 %');
  });

  it('lägger till och tar bort rader', () => {
    invoiceFormView(root, store);
    button(root, '+ Lägg till rad').click();
    expect(root.querySelectorAll('[data-line]')).toHaveLength(2);
    root.querySelector<HTMLButtonElement>('[data-line] .line-remove')?.click();
    expect(root.querySelectorAll('[data-line]')).toHaveLength(1);
  });

  it('sparar ett utkast utan fakturanummer och OCR', () => {
    invoiceFormView(root, store);
    const line = firstLine(root);
    control(root, 'customerId').value = 'k1';
    fill(getForm(root), line('description'), 'Konsulttimmar');
    fill(getForm(root), line('quantity'), '1,5');
    fill(getForm(root), line('unit'), 'tim');
    fill(getForm(root), line('unitPrice'), '1 000');
    button(root, 'Spara utkast').click();

    const saved = store.listInvoices();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      number: 0,
      ocr: '',
      status: 'draft',
      customerId: 'k1',
      lines: [{ description: 'Konsulttimmar', quantity: 1.5, unit: 'tim', unitPrice: 100000, vatRate: 25 }],
    });
    expect(location.hash).toBe(`#/fakturor/${saved[0]?.id}`);
    expect(root.querySelector('h1')?.textContent).toBe('Redigera utkast');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Utkastet är sparat');
    expect(store.nextInvoiceNumber()).toBe(1001);
  });

  it('visar fel och sparar inte när kund saknas eller priset är ogiltigt', () => {
    invoiceFormView(root, store);
    const line = firstLine(root);
    fill(getForm(root), line('description'), 'Något');
    fill(getForm(root), line('unitPrice'), 'gratis');
    button(root, 'Spara utkast').click();

    expect(store.listInvoices()).toHaveLength(0);
    expect(root.querySelector('#faktura-customerId-error')?.textContent).toBe('Välj en kund.');
    expect(root.querySelector(`#faktura-${line('unitPrice')}-error`)?.textContent).toContain('Ange ett pris');
    expect(document.activeElement).toBe(control(root, 'customerId'));
  });

  it('delar ut fakturanummer och OCR när fakturan markeras som skickad', () => {
    store.saveInvoice(draft);
    invoiceFormView(root, store, 'f1');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    button(root, 'Markera som skickad').click();

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('nästa fakturanummer'));
    expect(store.getInvoice('f1')).toMatchObject({ number: 1001, ocr: '100164', status: 'sent' });
    expect(root.querySelector('h1')?.textContent).toBe('Faktura 1001');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('OCR-nummer: 100164');
    expect(root.querySelector<HTMLFieldSetElement>('.invoice-content')?.disabled).toBe(true);
    expect([...root.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Spara utkast');
  });

  it('hämtar fakturanumret först efter bekräftelsen', () => {
    store.saveInvoice(draft);
    invoiceFormView(root, store, 'f1');
    // En annan flik utfärdar faktura 1001 medan dialogen står öppen.
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      createLocalStore(localStorage).saveInvoice({ ...draft, id: 'annan', number: 1001, ocr: '100164', status: 'sent' });
      return true;
    });
    button(root, 'Markera som skickad').click();

    expect(store.getInvoice('f1')).toMatchObject({ number: 1002, ocr: '100263', status: 'sent' });
  });

  it('ber användaren försöka igen om numret inte kan sparas', () => {
    store.saveInvoice(draft);
    invoiceFormView(root, store, 'f1');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(store, 'saveInvoice').mockImplementation(() => {
      throw new Error('Fakturanummer 1001 används redan.');
    });
    button(root, 'Markera som skickad').click();

    expect(root.querySelector('[role="status"] .notice-error')?.textContent).toBe(
      'Fakturanummer 1001 används redan. Försök igen.',
    );
  });

  it('skickar inte en faktura med negativt belopp', () => {
    store.saveInvoice({ ...draft, lines: [{ ...draft.lines[0]!, unitPrice: -100000 }] });
    invoiceFormView(root, store, 'f1');
    const confirm = vi.spyOn(window, 'confirm');
    button(root, 'Markera som skickad').click();

    expect(confirm).not.toHaveBeenCalled();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('negativt belopp');
  });

  it('skickar inte om användaren avbryter bekräftelsen', () => {
    store.saveInvoice(draft);
    invoiceFormView(root, store, 'f1');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    button(root, 'Markera som skickad').click();

    expect(store.getInvoice('f1')).toMatchObject({ number: 0, status: 'draft' });
    expect(store.nextInvoiceNumber()).toBe(1001);
  });

  it('kräver företagsinställningar och minst en rad med beskrivning för att skicka', () => {
    localStorage.clear();
    store.saveCustomer(customer);
    store.saveInvoice(draft);
    invoiceFormView(root, store, 'f1');
    const confirm = vi.spyOn(window, 'confirm');
    button(root, 'Markera som skickad').click();

    expect(confirm).not.toHaveBeenCalled();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Inställningar');
    expect(store.getInvoice('f1')?.status).toBe('draft');
  });

  it('visar fel från lagringen när fakturan inte kan sparas', () => {
    store.saveInvoice(draft);
    invoiceFormView(root, store, 'f1');
    vi.spyOn(store, 'saveInvoice').mockImplementation(() => {
      throw new Error('Lagringen är inte tillgänglig. Ändringen kunde inte sparas.');
    });
    button(root, 'Spara utkast').click();

    expect(root.querySelector('[role="status"] .notice-error')?.textContent).toContain('Lagringen är inte tillgänglig');
  });

  it('raderar ett utkast efter bekräftelse', () => {
    store.saveInvoice(draft);
    invoiceFormView(root, store, 'f1');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    button(root, 'Radera utkast').click();

    expect(store.listInvoices()).toHaveLength(0);
    expect(root.querySelector('h1')?.textContent).toBe('Ny faktura');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Utkastet är raderat');
  });

  it('visar kärnans fel när en faktura har utfärdats i en annan flik och inte kan raderas', () => {
    store.saveInvoice(draft);
    invoiceFormView(root, store, 'f1');
    store.saveInvoice({ ...draft, number: 1001, ocr: '100164', status: 'sent' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    button(root, 'Radera utkast').click();

    expect(store.listInvoices()).toHaveLength(1);
    expect(root.querySelector('[role="status"] .notice-error')?.textContent).toContain('kreditfaktura');
  });

  it('visar en utfärdad faktura skrivskyddad', () => {
    store.saveInvoice({ ...draft, number: 1001, ocr: '100164', status: 'sent' });
    invoiceFormView(root, store, 'f1');

    expect(root.querySelector('h1')?.textContent).toBe('Faktura 1001');
    expect(root.textContent).toContain('kreditfaktura');
    expect(root.querySelector<HTMLFieldSetElement>('.invoice-content')?.disabled).toBe(true);
    expect(root.querySelectorAll('.form-actions button')).toHaveLength(0);
    expect(totalsText(root)).toContain(formatSek(187500));
  });

  it('visar ett meddelande om fakturan inte finns', () => {
    invoiceFormView(root, store, 'finns-inte');
    expect(root.textContent).toContain('Fakturan finns inte');
  });
});

describe('validateInvoice', () => {
  const base: InvoiceInput = {
    customerId: 'k1',
    issueDate: '2026-03-01',
    dueDate: '2026-03-31',
    notes: '',
    lines: [{ id: 'r1', description: 'Arbete', quantity: '1', unit: '', unitPrice: '500', vatRate: 25 }],
  };

  it('godkänner en komplett faktura', () => {
    expect(validateInvoice(base, 'send')).toEqual({});
  });

  it('underkänner förfallodatum före fakturadatum och ogiltiga datum', () => {
    expect(validateInvoice({ ...base, dueDate: '2026-02-01' }, 'draft')).toHaveProperty('dueDate');
    expect(validateInvoice({ ...base, issueDate: '2026-02-30' }, 'draft')).toHaveProperty('issueDate');
  });

  it('kräver beskrivning bara när fakturan skickas', () => {
    const lines = [{ ...base.lines[0]!, description: '' }];
    expect(validateInvoice({ ...base, lines }, 'draft')).toEqual({});
    expect(validateInvoice({ ...base, lines }, 'send')).toHaveProperty('line-r1-description');
  });

  it('ignorerar helt tomma rader', () => {
    const lines = [{ ...base.lines[0]!, description: '', unitPrice: '', quantity: '' }];
    expect(validateInvoice({ ...base, lines }, 'draft')).toEqual({});
  });
});

describe('hjälpfunktioner', () => {
  it.each([
    ['2', 2],
    ['1,5', 1.5],
    ['0.25', 0.25],
    ['0', null],
    ['-1', null],
    ['två', null],
  ])('parseQuantity("%s") ger %s', (text, expected) => {
    expect(parseQuantity(text)).toBe(expected);
  });

  it.each([
    [125000, '1250,00'],
    [5, '0,05'],
    [-2550, '-25,50'],
  ])('oreToInput(%i) ger "%s"', (ore, expected) => {
    expect(oreToInput(ore)).toBe(expected);
  });
});
