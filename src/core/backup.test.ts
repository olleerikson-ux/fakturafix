import { beforeEach, describe, expect, it } from "vitest";
import { exportBackup, importBackup, parseBackup } from "./backup";
import { createOcr } from "./ocr";
import { createLocalStore } from "./storage";
import type { Customer, Invoice } from "./types";

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

const customer: Customer = {
  id: "k1",
  name: "Testkund AB",
  orgNumber: "556000-0000",
  address: { street: "Testgatan 1", postalCode: "111 22", city: "Teststad" },
  createdAt: "2026-11-01T10:00:00.000Z",
};

function invoice(id: string, number: number): Invoice {
  return {
    id,
    number,
    customerId: "k1",
    issueDate: "2026-11-01",
    dueDate: "2026-12-01",
    lines: [
      {
        id: "l1",
        description: "Konsult",
        quantity: 1,
        unitPrice: 50000,
        vatRate: 25,
      },
    ],
    ocr: number > 0 ? createOcr(number) : "",
    status: number > 0 ? "sent" : "draft",
    createdAt: "2026-11-01T10:00:00.000Z",
  };
}

describe("säkerhetskopiering", () => {
  let source: ReturnType<typeof createLocalStore>;
  beforeEach(() => {
    source = createLocalStore(memory());
    source.saveCustomer(customer);
    source.saveInvoice(invoice("a", 1001));
    source.saveInvoice(invoice("b", 1002));
    source.saveInvoice(invoice("d", 0));
    source.saveSettings({
      name: "Testfirma",
      orgNumber: "556000-0000",
      address: customer.address,
      fSkatt: true,
      paymentTermsDays: 30,
    });
  });

  it("export och import ger identisk data", () => {
    const json = JSON.stringify(exportBackup(source));
    const target = createLocalStore(memory());
    importBackup(target, parseBackup(json), "replace");
    expect(target.listCustomers()).toEqual(source.listCustomers());
    expect(target.listInvoices()).toEqual(source.listInvoices());
    expect(target.getSettings()).toEqual(source.getSettings());
    expect(target.nextInvoiceNumber()).toBe(1003);
  });

  it("ersätter befintlig data och fortsätter nummerserien", () => {
    const target = createLocalStore(memory());
    target.saveInvoice(invoice("x", 1001));
    importBackup(
      target,
      parseBackup(JSON.stringify(exportBackup(source))),
      "replace",
    );
    expect(target.getInvoice("x")).toBeUndefined();
    target.saveInvoice(invoice("n", 1003));
    expect(target.nextInvoiceNumber()).toBe(1004);
  });

  it("högvattenmärket går inte bakåt trots lägre lastInvoiceNumber", () => {
    const backup = { ...exportBackup(source), lastInvoiceNumber: 1000 };
    const target = createLocalStore(memory());
    importBackup(target, backup, "replace");
    expect(target.nextInvoiceNumber()).toBe(1003);
  });

  it("behåller ett högre högvattenmärke än högsta fakturan", () => {
    const backup = { ...exportBackup(source), lastInvoiceNumber: 1010 };
    const target = createLocalStore(memory());
    importBackup(target, backup, "replace");
    expect(target.nextInvoiceNumber()).toBe(1011);
  });

  it("tar bort inställningar som saknas i kopian", () => {
    const { settings: _s, ...backup } = exportBackup(source);
    const target = createLocalStore(memory());
    target.saveSettings(source.getSettings()!);
    importBackup(target, backup, "replace");
    expect(target.getSettings()).toBeUndefined();
  });

  it("avvisar trasig JSON, fel app och fel version", () => {
    expect(() => parseBackup("{trasig")).toThrow(/JSON/);
    expect(() => parseBackup("[]")).toThrow(
      "Filen är inte en säkerhetskopia från Fakturafix",
    );
    expect(() => parseBackup('{"app":"annat"}')).toThrow(
      "inte en säkerhetskopia",
    );
    const wrong = { ...exportBackup(source), version: 2 };
    expect(() => parseBackup(JSON.stringify(wrong))).toThrow(/version/);
  });

  it("avvisar ogiltiga fakturor och kunder med begripligt fel", () => {
    const base = exportBackup(source);
    const badInvoice = {
      ...base,
      invoices: [...base.invoices, { ...invoice("z", 1003), status: "x" }],
    };
    expect(() => parseBackup(JSON.stringify(badInvoice))).toThrow(
      "Faktura 1003 är ogiltig.",
    );
    const badCustomer = { ...base, customers: [{ id: "k2" }] };
    expect(() => parseBackup(JSON.stringify(badCustomer))).toThrow(/kund/i);
    const badSettings = { ...base, settings: { name: 1 } };
    expect(() => parseBackup(JSON.stringify(badSettings))).toThrow(
      /inställningar/,
    );
    expect(() =>
      parseBackup(JSON.stringify({ ...base, lastInvoiceNumber: "x" })),
    ).toThrow(/fakturanummer/);
  });

  it("avvisar dubbletter av id och fakturanummer", () => {
    const base = exportBackup(source);
    const dupNumber = {
      ...base,
      invoices: [...base.invoices, invoice("c", 1002)],
    };
    expect(() => parseBackup(JSON.stringify(dupNumber))).toThrow(
      /används flera gånger/,
    );
    const dupId = { ...base, invoices: [...base.invoices, invoice("a", 1005)] };
    expect(() => parseBackup(JSON.stringify(dupId))).toThrow(/flera gånger/);
  });
});
