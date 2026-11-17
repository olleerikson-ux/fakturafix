import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanySettings, Store } from '../../core/index';
import { createMemoryStore, fill } from '../test-utils';
import { settingsView } from './settings';

const testSettings: CompanySettings = {
  name: 'Testfirman',
  orgNumber: '556000-0000',
  address: { street: 'Testgatan 1', postalCode: '123 45', city: 'Teststad' },
  bankgiro: '123-4567',
  fSkatt: true,
  paymentTermsDays: 20,
  lateInterestPercent: 8.5,
};

function getForm(root: HTMLElement): HTMLFormElement {
  const form = root.querySelector('form');
  if (!form) throw new Error('Formuläret saknas');
  return form;
}

function input(form: HTMLFormElement, name: string): HTMLInputElement {
  return form.elements.namedItem(name) as HTMLInputElement;
}

describe('settingsView', () => {
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

  it('visar ett tomt formulär med 30 dagars betalningsvillkor som standard', () => {
    settingsView(root, store);
    const form = getForm(root);
    expect(root.querySelector('h1')?.textContent).toBe('Inställningar');
    expect(input(form, 'name').value).toBe('');
    expect(input(form, 'paymentTermsDays').value).toBe('30');
    expect(input(form, 'fSkatt').checked).toBe(false);
    for (const el of form.querySelectorAll('input')) {
      expect(root.querySelector(`label[for="${el.id}"]`)).not.toBeNull();
    }
  });

  it('fyller i sparade inställningar', () => {
    store.saveSettings(testSettings);
    settingsView(root, store);
    const form = getForm(root);
    expect(input(form, 'name').value).toBe('Testfirman');
    expect(input(form, 'bankgiro').value).toBe('123-4567');
    expect(input(form, 'fSkatt').checked).toBe(true);
    expect(input(form, 'paymentTermsDays').value).toBe('20');
    expect(input(form, 'lateInterestPercent').value).toBe('8,5');
  });

  it('sparar inställningarna och visar en bekräftelse', () => {
    settingsView(root, store);
    const form = getForm(root);
    fill(form, 'name', 'Testfirman');
    fill(form, 'orgNumber', '556000-0000');
    fill(form, 'street', 'Testgatan 1');
    fill(form, 'postalCode', '12345');
    fill(form, 'city', 'Teststad');
    fill(form, 'bankgiro', '123-4567');
    fill(form, 'lateInterestPercent', '8,5');
    input(form, 'fSkatt').checked = true;
    form.requestSubmit();

    expect(store.getSettings()).toEqual({
      name: 'Testfirman',
      orgNumber: '556000-0000',
      vatNumber: undefined,
      address: { street: 'Testgatan 1', postalCode: '123 45', city: 'Teststad', country: undefined },
      email: undefined,
      phone: undefined,
      bankgiro: '123-4567',
      plusgiro: undefined,
      fSkatt: true,
      paymentTermsDays: 30,
      lateInterestPercent: 8.5,
    });
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Inställningarna är sparade');
  });

  it('visar fel och sparar inte när uppgifter saknas eller är felaktiga', () => {
    settingsView(root, store);
    const form = getForm(root);
    fill(form, 'postalCode', '999');
    fill(form, 'paymentTermsDays', 'trettio');
    form.requestSubmit();

    expect(store.getSettings()).toBeUndefined();
    expect(root.querySelector('#inst-name-error')?.textContent).toBe('Ange företagets namn.');
    expect(root.querySelector('#inst-orgNumber-error')?.textContent).toBe('Ange organisationsnummer.');
    expect(root.querySelector('#inst-postalCode-error')?.textContent).toContain('5 siffror');
    expect(root.querySelector('#inst-paymentTermsDays-error')?.textContent).toContain('antal dagar');
    expect(root.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('behåller sparat land eftersom formuläret saknar landfält', () => {
    store.saveSettings({ ...testSettings, address: { ...testSettings.address, country: 'Sverige' } });
    settingsView(root, store);
    getForm(root).requestSubmit();

    expect(store.getSettings()?.address.country).toBe('Sverige');
  });

  it('visar ett fel om lagringen inte kan spara', () => {
    store.saveSettings(testSettings);
    vi.spyOn(store, 'saveSettings').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    settingsView(root, store);
    getForm(root).requestSubmit();

    expect(root.querySelector('[role="status"] .notice-error')?.textContent).toContain('Kunde inte spara inställningarna');
  });

  it('sparar momsbefrielse med text och behåller den vid nästa sparning', () => {
    store.saveSettings(testSettings);
    settingsView(root, store);
    const form = getForm(root);
    expect(input(form, 'vatExemptText').value).toContain('Momsbefriad');
    input(form, 'vatExempt').checked = true;
    form.requestSubmit();
    expect(store.getSettings()?.vatExempt).toBe(true);
    expect(store.getSettings()?.vatExemptText).toBeDefined();
  });

  it('laddar upp, sparar och tar bort en logotyp, och avvisar fel typ och för stor fil', async () => {
    store.saveSettings(testSettings);
    settingsView(root, store);
    const fileInput = root.querySelector<HTMLInputElement>('#inst-logo');
    if (!fileInput) throw new Error('Filväljaren saknas');
    const choose = (file: File) => {
      Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
      fileInput.dispatchEvent(new Event('change'));
    };

    choose(new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(root.textContent).toContain('PNG-, JPG- eller SVG');
    choose(new File([new Uint8Array(200_001)], 'stor.png', { type: 'image/png' }));
    expect(root.textContent).toContain('för stor');
    expect(root.querySelector('.logo-preview img')).toBeNull();

    choose(new File(['abc'], 'logo.png', { type: 'image/png' }));
    await vi.waitFor(() => expect(root.querySelector('.logo-preview img')).not.toBeNull());
    getForm(root).requestSubmit();
    expect(store.getSettings()?.logoDataUrl).toMatch(/^data:image\/png;base64,/);

    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Ta bort logotyp')?.click();
    getForm(root).requestSubmit();
    expect(store.getSettings()?.logoDataUrl).toBeUndefined();
  });
});
