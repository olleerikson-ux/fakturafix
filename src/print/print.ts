/** Skriver ut en faktura eller påminnelse med webbläsarens utskrift ("Spara som PDF" finns i utskriftsdialogen). */
import { today, type Store } from '../core/index';
import { renderInvoice } from './invoice';
import { renderReminder } from './reminder';

const PRINT_ROOT_ID = 'print-root';

function printElement(content: HTMLElement): void {
  document.getElementById(PRINT_ROOT_ID)?.remove();
  const holder = document.createElement('div');
  holder.id = PRINT_ROOT_ID;
  holder.append(content);
  document.body.append(holder);
  window.addEventListener('afterprint', () => holder.remove(), { once: true });
  window.print();
}

/** Returnerar ett felmeddelande om fakturan inte kan skrivas ut, annars undefined. */
export function printInvoice(store: Store, invoiceId: string): string | undefined {
  const invoice = store.getInvoice(invoiceId);
  if (!invoice) return 'Fakturan finns inte.';
  const customer = store.getCustomer(invoice.customerId);
  if (!customer) return 'Kunden för fakturan saknas.';
  const settings = store.getSettings();
  if (!settings) return 'Fyll i dina företagsuppgifter under Inställningar innan du skriver ut.';
  printElement(renderInvoice(invoice, customer, settings, invoice.creditFor ? store.getInvoice(invoice.creditFor) : undefined));
  return undefined;
}

/** Som printInvoice, men för en betalningspåminnelse. Kärnans fel (t.ex. betald faktura) returneras som text. */
export function printReminder(store: Store, invoiceId: string): string | undefined {
  const invoice = store.getInvoice(invoiceId);
  if (!invoice) return 'Fakturan finns inte.';
  const customer = store.getCustomer(invoice.customerId);
  if (!customer) return 'Kunden för fakturan saknas.';
  const settings = store.getSettings();
  if (!settings) return 'Fyll i dina företagsuppgifter under Inställningar innan du skriver ut.';
  try {
    printElement(renderReminder(invoice, customer, settings, today()));
  } catch (error) {
    return error instanceof Error ? error.message : 'Påminnelsen kunde inte skapas.';
  }
  return undefined;
}
