import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer, Store } from '../../core/index';
import { createMemoryStore, fill } from '../test-utils';
import { customersView, validateCustomer, type CustomerInput } from './customers';

const testCustomer: Customer = {
  id: 'k1',
  name: 'Testkund AB',
  orgNumber: '556000-0000',
  email: 'faktura@testkund.example',
  address: { street: 'Testgatan 1', postalCode: '123 45', city: 'Teststad' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

function getForm(root: HTMLElement): HTMLFormElement {
  const form = root.querySelector('form');
  if (!form) throw new Error('Formuläret saknas');
  return form;
}

function fillRequired(form: HTMLFormElement): void {
  fill(form, 'name', 'Exempelbolaget AB');
  fill(form, 'street', 'Påhittad väg 2');
  fill(form, 'postalCode', '54321');
  fill(form, 'city', 'Exempelby');
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!found) throw new Error(`Knappen saknas: ${text}`);
  return found;
}

describe('customersView', () => {
  let root: HTMLElement;
  let store: Store;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
    store = createMemoryStore();
  });

  afterEach(() => {
    root.remove();
    vi.restoreAllMocks();
  });

  it('visar en uppmaning när det inte finns några kunder', () => {
    customersView(root, store);
    expect(root.querySelector('h1')?.textContent).toBe('Kunder');
    expect(root.querySelector('.empty')?.textContent).toContain('Lägg till din första kund');
    expect(root.querySelector('table')).toBeNull();
  });

  it('listar kunder med namn, org.nr, ort och e-post', () => {
    store.saveCustomer(testCustomer);
    customersView(root, store);
    const cells = [...root.querySelectorAll('tbody td')].map((td) => td.textContent);
    expect(cells).toEqual(
      expect.arrayContaining(['Testkund AB', '556000-0000', 'Teststad', 'faktura@testkund.example']),
    );
  });

  it('har en etikett kopplad till varje fält', () => {
    customersView(root, store);
    for (const input of getForm(root).querySelectorAll('input')) {
      expect(root.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    }
  });

  it('sparar en ny kund och visar den i listan', () => {
    customersView(root, store);
    const form = getForm(root);
    fillRequired(form);
    fill(form, 'email', 'info@exempel.example');
    form.requestSubmit();

    const saved = store.listCustomers();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      name: 'Exempelbolaget AB',
      email: 'info@exempel.example',
      address: { street: 'Påhittad väg 2', postalCode: '543 21', city: 'Exempelby' },
    });
    expect(saved[0]?.orgNumber).toBeUndefined();
    expect(saved[0]?.id).toBeTruthy();
    expect(root.querySelector('tbody')?.textContent).toContain('Exempelbolaget AB');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('är tillagd');
  });

  it('visar fel och sparar inte när obligatoriska fält saknas', () => {
    customersView(root, store);
    const form = getForm(root);
    form.requestSubmit();

    expect(store.listCustomers()).toHaveLength(0);
    const name = form.elements.namedItem('name') as HTMLInputElement;
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(name);
    expect(root.querySelector('#kund-name-error')?.textContent).toBe('Ange kundens namn.');
    expect(root.querySelector('#kund-street-error')?.textContent).toBe('Ange gatuadress.');
    expect(root.querySelector('#kund-postalCode-error')?.textContent).toBe('Ange postnummer.');
    expect(root.querySelector('#kund-city-error')?.textContent).toBe('Ange ort.');
  });

  it('visar fel för felaktigt postnummer', () => {
    customersView(root, store);
    const form = getForm(root);
    fillRequired(form);
    fill(form, 'postalCode', '1234');
    form.requestSubmit();

    expect(store.listCustomers()).toHaveLength(0);
    expect(root.querySelector('#kund-postalCode-error')?.textContent).toContain('5 siffror');
  });

  it('redigerar en befintlig kund och behåller id och skapad-datum', () => {
    store.saveCustomer(testCustomer);
    customersView(root, store);
    button(root, 'Redigera').click();

    const form = getForm(root);
    expect((form.elements.namedItem('name') as HTMLInputElement).value).toBe('Testkund AB');
    fill(form, 'city', 'Nystad');
    form.requestSubmit();

    expect(store.listCustomers()).toHaveLength(1);
    expect(store.getCustomer('k1')).toMatchObject({
      id: 'k1',
      createdAt: testCustomer.createdAt,
      address: { city: 'Nystad' },
    });
  });

  it('tar bort en kund efter bekräftelse', () => {
    store.saveCustomer(testCustomer);
    customersView(root, store);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    button(root, 'Ta bort').click();

    expect(confirm).toHaveBeenCalledWith('Vill du ta bort kunden Testkund AB?');
    expect(store.listCustomers()).toHaveLength(0);
    expect(root.querySelector('.empty')).not.toBeNull();
  });

  it('tar inte bort kunden om användaren avbryter', () => {
    store.saveCustomer(testCustomer);
    customersView(root, store);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    button(root, 'Ta bort').click();

    expect(store.listCustomers()).toHaveLength(1);
  });
});

describe('validateCustomer', () => {
  const valid: CustomerInput = {
    name: 'Testkund AB',
    orgNumber: '',
    vatNumber: '',
    email: '',
    reference: '',
    street: 'Testgatan 1',
    postalCode: '123 45',
    city: 'Teststad',
    country: '',
  };

  it.each(['12345', '123 45', '1 2 3 4 5'])('godkänner postnumret "%s"', (postalCode) => {
    expect(validateCustomer({ ...valid, postalCode })).toEqual({});
  });

  it.each(['1234', '123456', '12a45'])('underkänner postnumret "%s"', (postalCode) => {
    expect(validateCustomer({ ...valid, postalCode })).toHaveProperty('postalCode');
  });

  it('underkänner en ogiltig e-postadress', () => {
    expect(validateCustomer({ ...valid, email: 'inte-en-adress' })).toHaveProperty('email');
  });
});
