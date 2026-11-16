/** Sektionen "Säkerhetskopia" i Inställningar: ladda ner och läs in en kopia av all data. */
import { exportBackup, importBackup, parseBackup, today, type Store } from '../../core/index';
import { markBackupTaken } from '../backup-reminder';
import { h } from '../dom';
import { errorMessage } from '../form';

/** "1 kund", "2 kunder". */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function backupFileName(date: string): string {
  return `fakturafix-backup-${date}.json`;
}

function download(fileName: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = h('a', { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Filen kunde inte läsas.'));
    reader.readAsText(file);
  });
}

/** `onImported` anropas när all data har ersatts, så att vyn kan ritas om. */
export function backupSection(store: Store, onImported: () => void): HTMLElement {
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const say = (text: string, kind: 'ok' | 'error') =>
    status.replaceChildren(h('p', { class: `notice notice-${kind}` }, text));

  const save = () => {
    try {
      const date = today();
      download(backupFileName(date), JSON.stringify(exportBackup(store), null, 2));
      markBackupTaken(date);
      say('✓ Säkerhetskopian är nedladdad. Spara filen på en säker plats.', 'ok');
    } catch (error) {
      say(errorMessage(error, 'Säkerhetskopian kunde inte skapas.'), 'error');
    }
  };

  const picker = h('input', { type: 'file', accept: 'application/json,.json', id: 'backup-file', class: 'visually-hidden' });
  const restore = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      const backup = parseBackup(await readFile(file));
      const question =
        `Säkerhetskopian innehåller ${plural(backup.customers.length, 'kund', 'kunder')} och ${plural(backup.invoices.length, 'faktura', 'fakturor')}. ` +
        'Om du läser in den ERSÄTTS all data som finns i Fakturafix nu. Det går inte att ångra. Vill du fortsätta?';
      if (!window.confirm(question)) {
        say('Inläsningen avbröts. Inget har ändrats.', 'ok');
        return;
      }
      importBackup(store, backup, 'replace');
      onImported();
    } catch (error) {
      say(`Säkerhetskopian lästes inte in. ${errorMessage(error, 'Något gick fel.')} Inget har ändrats.`, 'error');
    } finally {
      picker.value = '';
    }
  };
  picker.addEventListener('change', () => void restore());

  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'backup-title' },
    h('h2', { id: 'backup-title' }, 'Säkerhetskopia'),
    h(
      'p',
      {},
      'Din data finns bara i den här webbläsaren. Ladda ner en säkerhetskopia regelbundet, så att du kan återställa den om webbplatsdata rensas eller du byter dator.',
    ),
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn-primary', onclick: save }, 'Ladda ner säkerhetskopia'),
      picker,
      h('label', { class: 'btn-secondary file-button', for: 'backup-file' }, 'Läs in säkerhetskopia'),
    ),
    status,
  );
}
