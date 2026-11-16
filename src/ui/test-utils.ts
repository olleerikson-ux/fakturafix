/** Hjälpmedel för gränssnittstester. Används bara i *.test.ts. */
import type { CompanySettings, Customer, Invoice, Store } from '../core/index';

/** Ett enkelt minnesbaserat Store, så att UI-tester inte beror på localStorage. */
export function createMemoryStore(): Store {
  const customers = new Map<string, Customer>();
  const invoices = new Map<string, Invoice>();
  let settings: CompanySettings | undefined;

  return {
    listCustomers: () => [...customers.values()],
    getCustomer: (id) => customers.get(id),
    saveCustomer: (customer) => {
      customers.set(customer.id, structuredClone(customer));
    },
    deleteCustomer: (id) => {
      customers.delete(id);
    },
    listInvoices: () => [...invoices.values()],
    getInvoice: (id) => invoices.get(id),
    saveInvoice: (invoice) => {
      invoices.set(invoice.id, structuredClone(invoice));
    },
    deleteInvoice: (id) => {
      invoices.delete(id);
    },
    nextInvoiceNumber: () => 1001 + invoices.size,
    getSettings: () => settings,
    saveSettings: (next) => {
      settings = structuredClone(next);
    },
  };
}

/** Fyller i ett fält i ett formulär utifrån fältets name-attribut. */
export function fill(form: HTMLFormElement, name: string, value: string): void {
  const el = form.elements.namedItem(name);
  if (!(el instanceof HTMLInputElement)) throw new Error(`Hittade inget fält: ${name}`);
  el.value = value;
}
