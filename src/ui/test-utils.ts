/** Hjälpmedel för gränssnittstester. Används bara i *.test.ts. */
import type { Article, CompanySettings, Customer, Invoice, Store } from '../core/index';

/** Ett enkelt minnesbaserat Store, så att UI-tester inte beror på localStorage. */
export function createMemoryStore(): Store {
  const customers = new Map<string, Customer>();
  const invoices = new Map<string, Invoice>();
  const articles = new Map<string, Article>();
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
    listArticles: () => [...articles.values()],
    saveArticle: (article) => {
      articles.set(article.id, structuredClone(article));
    },
    deleteArticle: (id) => {
      articles.delete(id);
    },
    listInvoices: () => [...invoices.values()],
    getInvoice: (id) => invoices.get(id),
    saveInvoice: (invoice) => {
      invoices.set(invoice.id, structuredClone(invoice));
    },
    deleteInvoice: (id) => {
      invoices.delete(id);
    },
    nextInvoiceNumber: () => Math.max(1000, ...[...invoices.values()].map((i) => i.number)) + 1,
    replaceAll: (data) => {
      customers.clear();
      invoices.clear();
      articles.clear();
      (data.articles ?? []).forEach((article) => articles.set(article.id, structuredClone(article)));
      data.customers.forEach((customer) => customers.set(customer.id, structuredClone(customer)));
      data.invoices.forEach((invoice) => invoices.set(invoice.id, structuredClone(invoice)));
      settings = data.settings ? structuredClone(data.settings) : undefined;
    },
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
