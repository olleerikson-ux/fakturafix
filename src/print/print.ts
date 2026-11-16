/** Skriver ut en faktura med webbläsarens utskrift ("Spara som PDF" finns i utskriftsdialogen). */
import type { Store } from '../core/index';
import { renderInvoice } from './invoice';

const PRINT_ROOT_ID = 'print-root';

/** Returnerar ett felmeddelande om fakturan inte kan skrivas ut, annars undefined. */
export function printInvoice(store: Store, invoiceId: string): string | undefined {
  const invoice = store.getInvoice(invoiceId);
  if (!invoice) return 'Fakturan finns inte.';
  const customer = store.getCustomer(invoice.customerId);
  if (!customer) return 'Kunden för fakturan saknas.';
  const settings = store.getSettings();
  if (!settings) return 'Fyll i dina företagsuppgifter under Inställningar innan du skriver ut.';

  document.getElementById(PRINT_ROOT_ID)?.remove();
  const holder = document.createElement('div');
  holder.id = PRINT_ROOT_ID;
  holder.append(renderInvoice(invoice, customer, settings));
  document.body.append(holder);
  window.addEventListener('afterprint', () => holder.remove(), { once: true });
  window.print();
  return undefined;
}
