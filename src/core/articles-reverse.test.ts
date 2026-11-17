import { describe, expect, it } from "vitest";
import { exportBackup, importBackup, parseBackup } from "./backup";
import { createCreditNote } from "./credit";
import { REVERSE_CHARGE_TEXT } from "./index";
import { createOcr } from "./ocr";
import { createLocalStore } from "./storage";
import type { Article, CompanySettings, Customer, Invoice } from "./types";
import { isArticle, isCustomer, isInvoice } from "./validation";

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

const address = { street: "Testgatan 1", postalCode: "111 22", city: "Teststad" };
const customer: Customer = {
  id: "k1",
  name: "Testkund GmbH",
  vatNumber: "DE123456789",
  reverseCharge: true,
  address,
  createdAt: "2026-11-01T10:00:00.000Z",
};
const settings: CompanySettings = {
  name: "Testfirma",
  orgNumber: "556000-0000",
  vatNumber: "SE556000000001",
  address,
  fSkatt: true,
  paymentTermsDays: 30,
};
const article: Article = {
  id: "art1",
  description: "Konsulttimme",
  unit: "tim",
  unitPrice: 85000,
  vatRate: 25,
  createdAt: "2026-11-01T10:00:00.000Z",
};

function sent(vatRate: 0 | 25, extra: Partial<Invoice> = {}): Invoice {
  return {
    id: "a",
    number: 1001,
    customerId: "k1",
    issueDate: "2026-11-01",
    dueDate: "2026-12-01",
    lines: [{ id: "l1", description: "Konsult", quantity: 1, unitPrice: 10000, vatRate }],
    ocr: createOcr(1001),
    status: "sent",
    reverseCharge: true,
    createdAt: "2026-11-01T10:00:00.000Z",
    ...extra,
  };
}

function setup(s: CompanySettings | null = settings, c: Customer = customer) {
  const store = createLocalStore(memory());
  store.saveCustomer(c);
  if (s) store.saveSettings(s);
  return store;
}

describe("artikelregister", () => {
  it("sparar, uppdaterar, listar och raderar artiklar", () => {
    const store = createLocalStore(memory());
    expect(store.listArticles()).toEqual([]);
    store.saveArticle(article);
    store.saveArticle({ ...article, unitPrice: 90000 });
    expect(store.listArticles()).toEqual([{ ...article, unitPrice: 90000 }]);
    store.deleteArticle("art1");
    expect(store.listArticles()).toEqual([]);
  });

  it("lagrar under fakturafix:articles och hoppar över trasiga poster", () => {
    const storage = memory();
    const store = createLocalStore(storage);
    store.saveArticle(article);
    expect(JSON.parse(storage.getItem("fakturafix:articles") ?? "[]")).toHaveLength(1);
    storage.setItem("fakturafix:articles", JSON.stringify([article, { id: "x" }]));
    expect(store.listArticles()).toEqual([article]);
  });

  it("validerar artiklar", () => {
    expect(isArticle(article)).toBe(true);
    expect(isArticle({ ...article, vatRate: 7 })).toBe(false);
    expect(isArticle({ ...article, unitPrice: 1.5 })).toBe(false);
    expect(isArticle({ ...article, createdAt: undefined })).toBe(false);
  });

  it("raderad artikel påverkar inte befintliga fakturor", () => {
    const store = setup();
    store.saveArticle(article);
    store.saveInvoice(sent(0, { reverseCharge: undefined }));
    store.deleteArticle("art1");
    expect(store.getInvoice("a")?.lines[0]?.description).toBe("Konsult");
  });
});

describe("omvänd skattskyldighet", () => {
  it("exporterar standardtexten", () => {
    expect(REVERSE_CHARGE_TEXT).toBe("Omvänd skattskyldighet");
  });

  it("utfärdar en faktura när alla villkor är uppfyllda", () => {
    const store = setup();
    store.saveInvoice(sent(0));
    expect(store.getInvoice("a")?.reverseCharge).toBe(true);
  });

  it("kräver 0 % moms på alla rader", () => {
    expect(() => setup().saveInvoice(sent(25))).toThrow(/0 % moms.*Rad 1 har 25 %/);
  });

  it("kräver momsnummer hos kunden", () => {
    const { vatNumber: _v, ...noVat } = customer;
    expect(() => setup(settings, noVat).saveInvoice(sent(0))).toThrow(/kunden/);
  });

  it("kräver momsnummer hos säljaren och att säljaren inte är momsbefriad", () => {
    const { vatNumber: _v, ...noVat } = settings;
    expect(() => setup(noVat).saveInvoice(sent(0))).toThrow(/inställningarna/);
    expect(() => setup(null).saveInvoice(sent(0))).toThrow(/inställningarna/);
    expect(() => setup({ ...settings, vatExempt: true }).saveInvoice(sent(0))).toThrow(/momsbefriat/);
  });

  it("tillåter utkast utan villkor men blockerar utfärdandet", () => {
    const store = setup(null);
    store.saveInvoice(sent(25, { number: 0, ocr: "", status: "draft" }));
    expect(() => store.saveInvoice(sent(25))).toThrow(/Omvänd/);
  });

  it("kontrollerar bara vid utfärdandet och låser reverseCharge efteråt", () => {
    const store = setup();
    store.saveInvoice(sent(0));
    store.saveSettings({ ...settings, vatNumber: undefined });
    store.saveInvoice({ ...sent(0), status: "paid", paidDate: "2026-11-05" });
    expect(() => store.saveInvoice({ ...sent(0), status: "paid", reverseCharge: false })).toThrow(
      /reverseCharge/,
    );
  });

  it("ärvs av kreditfakturan", () => {
    const original = sent(0);
    expect(createCreditNote(original, "2026-11-10").reverseCharge).toBe(true);
    expect(createCreditNote({ ...original, reverseCharge: undefined }, "2026-11-10")).not.toHaveProperty(
      "reverseCharge",
    );
  });

  it("validerar reverseCharge på kund och faktura", () => {
    expect(isCustomer({ ...customer, reverseCharge: "ja" })).toBe(false);
    expect(isInvoice({ ...sent(0), reverseCharge: 1 })).toBe(false);
    expect(isInvoice(sent(0))).toBe(true);
  });
});

describe("säkerhetskopia med artiklar", () => {
  it("tar med artiklar vid export och import", () => {
    const source = setup();
    source.saveArticle(article);
    const target = createLocalStore(memory());
    target.saveArticle({ ...article, id: "gammal" });
    importBackup(target, parseBackup(JSON.stringify(exportBackup(source))), "replace");
    expect(target.listArticles()).toEqual([article]);
  });

  it("läser äldre säkerhetskopior utan articles", () => {
    const { articles: _a, ...old } = exportBackup(setup());
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.articles).toBeUndefined();
    const target = createLocalStore(memory());
    importBackup(target, parsed, "replace");
    expect(target.listArticles()).toEqual([]);
  });

  it("avvisar ogiltiga och dubbla artiklar", () => {
    const base = exportBackup(setup());
    expect(() => parseBackup(JSON.stringify({ ...base, articles: [{ id: "x" }] }))).toThrow(/artikel/i);
    expect(() => parseBackup(JSON.stringify({ ...base, articles: [article, article] }))).toThrow(
      /flera gånger/,
    );
    expect(() => parseBackup(JSON.stringify({ ...base, articles: "nej" }))).toThrow();
  });
});
