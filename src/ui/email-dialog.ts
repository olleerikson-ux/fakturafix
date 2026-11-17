/** Dialogen "Skicka med e-post": spara PDF och öppna mejlprogrammet med texten ifylld. */
import type { Store } from '../core/index';
import { today } from '../core/index';
import { printInvoice } from '../print/print';
import { buildMailto, markEmailed } from './email';
import { h } from './dom';
import { openModal } from './modal';

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
): void {
  const message = h('p', { class: 'notice notice-error', hidden: true, role: 'alert' });
  const fail = (text: string) => {
    message.textContent = text;
    message.hidden = false;
  };

  const savePdf = () => {
    const problem = printInvoice(store, invoiceId);
    if (problem) fail(problem);
  };

  const openMail = () => {
    const invoice = store.getInvoice(invoiceId);
    const customer = invoice ? store.getCustomer(invoice.customerId) : undefined;
    const settings = store.getSettings();
    if (!invoice || !customer) return fail('Fakturan eller kunden finns inte.');
    if (!settings) return fail('Fyll i dina företagsuppgifter under Inställningar först.');
    const original = invoice.creditFor ? store.getInvoice(invoice.creditFor) : undefined;
    markEmailed(invoice.id, today());
    open(buildMailto(invoice, customer, settings, original));
    onSent();
    modal.close();
  };

  const first = h('button', { type: 'button', class: 'btn-secondary', onclick: savePdf }, 'Spara PDF');
  const modal = openModal(
    [
      h('h2', { id: 'email-title' }, 'Skicka med e-post'),
      h('p', {}, EMAIL_INSTRUCTION),
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
