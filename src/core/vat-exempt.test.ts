import { describe, expect, it } from "vitest";
import { exportBackup, importBackup, parseBackup } from "./backup";
import { DEFAULT_VAT_EXEMPT_TEXT } from "./index";
import { createOcr } from "./ocr";
import { createLocalStore } from "./storage";
import type { CompanySettings, Invoice } from "./types";
import {
  isCompanySettings,
  isInvoice,
  isLogoDataUrl,
  MAX_LOGO_LENGTH,
} from "./validation";

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

const settings: CompanySettings = {
  name: "Testfirma",
  orgNumber: "556000-0000",
  address: { street: "Testgatan 1", postalCode: "111 22", city: "Teststad" },
  fSkatt: true,
  paymentTermsDays: 30,
};

function draft(vatRate: 0 | 25, extra: Partial<Invoice> = {}): Invoice {
  return {
    id: "a",
    number: 0,
    customerId: "k1",
    issueDate: "2026-11-01",
    dueDate: "2026-12-01",
    lines: [
      {
        id: "l1",
        description: "Konsult",
        quantity: 1,
        unitPrice: 10000,
        vatRate,
      },
    ],
    ocr: "",
    status: "draft",
    createdAt: "2026-11-01T10:00:00.000Z",
    ...extra,
  };
}

const issued = (invoice: Invoice): Invoice => ({
  ...invoice,
  number: 1001,
  ocr: createOcr(1001),
  status: "sent",
});

describe("momsbefrielse", () => {
  it("exporterar standardtexten", () => {
    expect(DEFAULT_VAT_EXEMPT_TEXT).toBe(
      "Momsbefriad enligt reglerna om momsbefrielse för små företag.",
    );
  });

  it("utfärdar en momsbefriad faktura med 0 % moms", () => {
    const store = createLocalStore(memory());
    store.saveInvoice(issued(draft(0, { vatExempt: true })));
    expect(store.getInvoice("a")?.vatExempt).toBe(true);
  });

  it("kastar fel när en momsbefriad faktura utfärdas med moms", () => {
    const store = createLocalStore(memory());
    expect(() =>
      store.saveInvoice(issued(draft(25, { vatExempt: true }))),
    ).toThrow(/momsbefrielse.*Rad 1 har 25 % moms/);
    expect(store.listInvoices()).toHaveLength(0);
  });

  it("tillåter ett utkast med moms men blockerar utfärdandet", () => {
    const store = createLocalStore(memory());
    store.saveInvoice(draft(25, { vatExempt: true }));
    expect(() =>
      store.saveInvoice(issued(draft(25, { vatExempt: true }))),
    ).toThrow(/moms/);
  });

  it("tillåter moms när vatExempt saknas eller är false", () => {
    const store = createLocalStore(memory());
    store.saveInvoice(issued(draft(25)));
    const other = createLocalStore(memory());
    other.saveInvoice(issued(draft(25, { vatExempt: false })));
    expect(other.listInvoices()).toHaveLength(1);
  });

  it("låser vatExempt efter utfärdandet", () => {
    const store = createLocalStore(memory());
    const sent = issued(draft(0, { vatExempt: true }));
    store.saveInvoice(sent);
    expect(() => store.saveInvoice({ ...sent, vatExempt: false })).toThrow(
      /vatExempt/,
    );
    const { vatExempt: _v, ...without } = sent;
    expect(() => store.saveInvoice(without)).toThrow(/vatExempt/);
  });

  it("validerar vatExempt på faktura och inställningar", () => {
    expect(isInvoice(issued(draft(0, { vatExempt: true })))).toBe(true);
    expect(isInvoice({ ...draft(0), vatExempt: "ja" })).toBe(false);
    expect(
      isCompanySettings({
        ...settings,
        vatExempt: true,
        vatExemptText: "Text",
      }),
    ).toBe(true);
    expect(isCompanySettings({ ...settings, vatExempt: "ja" })).toBe(false);
    expect(isCompanySettings({ ...settings, vatExemptText: 5 })).toBe(false);
  });
});

describe("logoDataUrl", () => {
  it("accepterar PNG, JPEG och SVG", () => {
    expect(isLogoDataUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isLogoDataUrl("data:image/jpeg;base64,AAAA")).toBe(true);
    expect(isLogoDataUrl("data:image/svg+xml;utf8,<svg/>")).toBe(true);
  });

  it("avvisar andra typer, icke-strängar och för långa värden", () => {
    expect(isLogoDataUrl("data:text/html;base64,AAAA")).toBe(false);
    expect(isLogoDataUrl("https://example.com/logo.png")).toBe(false);
    expect(isLogoDataUrl(5)).toBe(false);
    expect(
      isLogoDataUrl(`data:image/png;base64,${"A".repeat(MAX_LOGO_LENGTH)}`),
    ).toBe(false);
    expect(
      isCompanySettings({ ...settings, logoDataUrl: "data:text/html,x" }),
    ).toBe(false);
    expect(
      isCompanySettings({
        ...settings,
        logoDataUrl: "data:image/png;base64,AAAA",
      }),
    ).toBe(true);
  });
});

describe("säkerhetskopia med nya fält", () => {
  it("tar med vatExempt, vatExemptText, logoDataUrl och fakturans vatExempt", () => {
    const source = createLocalStore(memory());
    const full: CompanySettings = {
      ...settings,
      vatExempt: true,
      vatExemptText: "Egen text",
      logoDataUrl: "data:image/png;base64,AAAA",
    };
    source.saveSettings(full);
    source.saveInvoice(issued(draft(0, { vatExempt: true })));
    const target = createLocalStore(memory());
    importBackup(
      target,
      parseBackup(JSON.stringify(exportBackup(source))),
      "replace",
    );
    expect(target.getSettings()).toEqual(full);
    expect(target.getInvoice("a")?.vatExempt).toBe(true);
  });

  it("avvisar en säkerhetskopia med ogiltig logotyp", () => {
    const source = createLocalStore(memory());
    source.saveSettings(settings);
    const backup = exportBackup(source);
    const bad = {
      ...backup,
      settings: { ...settings, logoDataUrl: "data:text/html,x" },
    };
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/inställningarna/);
  });
});
