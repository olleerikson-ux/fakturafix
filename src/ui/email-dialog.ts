/** Dialogen "Skicka med e-post": spara PDF och öppna mejlprogrammet med texten ifylld. */
import type { Store } from '../core/index';
import { today } from '../core/index';
import { printInvoice, printReminder } from '../print/print';
import { buildMailto, buildReminderMailto, markEmailed, markReminded } from './email';
import { h } from './dom';
import { openModal } from './modal';

export const REMINDER_INSTRUCTION =
  '1. Spara påminnelsen som PDF (Skriv ut → Spara som PDF). 2. Ditt mejlprogram öppnas med texten ifylld. Bifoga PDF:en och skicka.';

export const EMAIL_INSTRUCTION =
  '1. Spara fakturan som PDF (Skriv ut → Spara som PDF). 2. Ditt mejlprogram öppnas med texten ifylld. Bifoga PDF:en och skicka.';

function openMailProgram(url: string): void {
  window.location.href = url;
}

/** Öppnar dialogen. `onSent` anropas när mejlprogrammet har öppnats. `open` kan bytas ut i tester. */
export function openEmailDialog(
  store: Store,
  invoiceId: string,
  onSent: () => void = () => undefined,
  open: (url: string) => void = openMailProgram,
  kind: 'invoice' | 'reminder' = 'invoice',
): void {
  const reminder = kind === 'reminder';
  const message = h('p', { class: 'notice notice-error', hidden: true, role: 'alert' });
  const fail = (text: string) => {
    message.textContent = text;
    message.hidden = false;
  };

  const savePdf = () => {
    const problem = reminder ? printReminder(store, invoiceId) : printInvoice(store, invoiceId);
    if (problem) fail(problem);
  };

  const openMail = () => {
    const invoice = store.getInvoice(invoiceId);
    const customer = invoice ? store.getCustomer(invoice.customerId) : undefined;
    const settings = store.getSettings();
    if (!invoice || !customer) return fail('Fakturan eller kunden finns inte.');
    if (!settings) return fail('Fyll i dina företagsuppgifter under Inställningar först.');
    const original = invoice.creditFor ? store.getInvoice(invoice.creditFor) : undefined;
    let url: string;
    try {
      url = reminder ? buildReminderMailto(invoice, customer, settings, today()) : buildMailto(invoice, customer, settings, original);
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Mejlet kunde inte skapas.');
    }
    if (reminder) markReminded(invoice.id, today());
    else markEmailed(invoice.id, today());
    open(url);
    onSent();
    modal.close();
  };

  const first = h('button', { type: 'button', class: 'btn-secondary', onclick: savePdf }, 'Spara PDF');
  const modal = openModal(
    [
      h('h2', { id: 'email-title' }, reminder ? 'Skicka påminnelse' : 'Skicka med e-post'),
      h('p', {}, reminder ? REMINDER_INSTRUCTION : EMAIL_INSTRUCTION),
      message,
      h(
        'div',
        { class: 'form-actions' },
        first,
        h('button', { type: 'button', class: 'btn-primary', onclick: openMail }, 'Öppna mejlprogrammet'),
        h('button', { type: 'button', class: 'btn-secondary', onclick: () => modal.close() }, 'Avbryt'),
      ),
    ],
    'email-title',
    () => first,
  );
}
