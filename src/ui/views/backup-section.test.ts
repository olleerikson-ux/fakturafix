import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportBackup, today, type Customer, type Store } from '../../core/index';
import { getLastBackupDate, needsBackupReminder } from '../backup-reminder';
import { createMemoryStore } from '../test-utils';
import { backupFileName, plural } from './backup-section';
import { overviewView } from './overview';
import { settingsView } from './settings';

const customer: Customer = {
  id: 'k1',
  name: 'Testkund AB',
  address: { street: 'Testgatan 1', postalCode: '123 45', city: 'Teststad' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('needsBackupReminder', () => {
  it('påminner när data finns och ingen kopia tagits på 30 dagar eller aldrig', () => {
    expect(needsBackupReminder(false, undefined, '2026-06-01')).toBe(false);
    expect(needsBackupReminder(true, undefined, '2026-06-01')).toBe(true);
    expect(needsBackupReminder(true, '2026-05-10', '2026-06-01')).toBe(false);
    expect(needsBackupReminder(true, '2026-05-02', '2026-06-01')).toBe(true);
  });
});

describe('säkerhetskopiering i gränssnittet', () => {
  let root: HTMLElement;
  let store: Store;

  beforeEach(() => {
    localStorage.clear();
    root = document.createElement('div');
    document.body.append(root);
    store = createMemoryStore();
  });
  afterEach(() => {
    root.remove();
    vi.restoreAllMocks();
  });

  it('filnamnet innehåller datumet', () => {
    expect(backupFileName('2026-11-16')).toBe('fakturafix-backup-2026-11-16.json');
  });

  it('böjer kund och faktura rätt', () => {
    expect(plural(1, 'kund', 'kunder')).toBe('1 kund');
    expect(plural(0, 'faktura', 'fakturor')).toBe('0 fakturor');
    expect(plural(2, 'faktura', 'fakturor')).toBe('2 fakturor');
  });

  it('Ladda ner skapar en fil och sparar datumet', () => {
    store.saveCustomer(customer);
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    settingsView(root, store);
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Ladda ner säkerhetskopia')?.click();
    expect(click).toHaveBeenCalledOnce();
    expect(getLastBackupDate()).toBe(today());
    expect(root.textContent).toContain('nedladdad');
  });

  it('Läs in ersätter data efter bekräftelse och avvisar fel fil utan att ändra något', async () => {
    store.saveCustomer(customer);
    const json = JSON.stringify(exportBackup(store));
    store.saveCustomer({ ...customer, id: 'k2', name: 'Annan Kund AB' });
    settingsView(root, store);
    const input = root.querySelector<HTMLInputElement>('#backup-file');
    if (!input) throw new Error('Filväljaren saknas');
    const choose = (text: string) => {
      Object.defineProperty(input, 'files', { configurable: true, value: [new File([text], 'b.json')] });
      input.dispatchEvent(new Event('change'));
    };

    choose('inte json');
    await vi.waitFor(() => expect(root.textContent).toContain('Inget har ändrats'));
    expect(store.listCustomers()).toHaveLength(2);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    choose(json);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(String(confirm.mock.calls[0]?.[0])).toContain('ERSÄTTS');
    expect(String(confirm.mock.calls[0]?.[0])).toContain('1 kund, 0 fakturor och 0 artiklar');
    expect(store.listCustomers()).toHaveLength(2);

    confirm.mockReturnValue(true);
    choose(json);
    await vi.waitFor(() => expect(store.listCustomers()).toHaveLength(1));
    expect(root.textContent).toContain('inläst');
  });

  it('varnar i bekräftelsen när en gammal kopia saknar artiklar', async () => {
    store.saveCustomer(customer);
    const { articles: _articles, ...old } = exportBackup(store);
    settingsView(root, store);
    const input = root.querySelector<HTMLInputElement>('#backup-file');
    if (!input) throw new Error('Filväljaren saknas');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([JSON.stringify(old)], 'gammal.json')] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(String(confirm.mock.calls[0]?.[0])).toContain('artikelregister töms (Artiklar: 0)');
  });

  it('översikten visar påminnelse tills en kopia tagits', () => {
    overviewView(root, store);
    expect(root.querySelector('.backup-reminder')).toBeNull();
    store.saveCustomer(customer);
    overviewView(root, store);
    expect(root.querySelector('.backup-reminder')).not.toBeNull();
    localStorage.setItem('fakturafix-ui:lastBackup', today());
    overviewView(root, store);
    expect(root.querySelector('.backup-reminder')).toBeNull();
  });
});
