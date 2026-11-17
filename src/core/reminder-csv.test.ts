import { describe, expect, it } from "vitest";
import { exportBackup, importBackup, parseBackup } from "./backup";
import { invoicesToCsv } from "./csv";
import { createOcr } from "./ocr";
import { MAX_REMINDER_FEE, reminderAmounts } from "./reminder";
import { createLocalStore } from "./storage";
import { calculateTotals } from "./vat";
import type { CompanySettings, Customer, Invoice } from "./types";
import { isCompanySettings } from "./validation";

const address = { street: "Testgatan 1", postalCode: "111 22", city: "Teststad" };
const settings: CompanySettings = {
  name: "Testfirma",
  orgNumber: "556000-0000",
  address,
  fSkatt: true,
  paymentTermsDays: 30,
  lateInterestPercent: 8,
  reminderFee: 6000,
};
const customer: Customer = {
  id: "k1",
  name: "Testkund AB",
  orgNumber: "556000-0001",
  address,
  createdAt: "2026-11-01T10:00:00.000Z",
};

function inv(number: number, extra: Partial<Invoice> = {}): Invoice {
  return {
    id: `i${number}`,
    number,
    customerId: "k1",
    issueDate: "2026-11-01",
    dueDate: "2026-12-01",
    lines: [{ id: "l1", description: "Konsult", quantity: 10, unitPrice: 10000, vatRate: 25 }],
    ocr: createOcr(number),
    status: "sent",
    createdAt: "2026-11-01T10:00:00.000Z",
    ...extra,
  };
}

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

describe("reminderAmounts", () => {
  // 10 × 100 kr = 1 000 kr + 25 % moms = 1 250 kr att betala.
  it("räknar kapital, dagar, ränta och avgift", () => {
    const r = reminderAmounts(inv(1001), settings, "2026-12-31");
    expect(r.principal).toBe(125000);
    expect(r.daysLate).toBe(30);
    // 125000 × 8 % × 30 / 365 = 821,917… öre
    expect(r.interest).toBe(822);
    expect(r.fee).toBe(6000);
    expect(r.total).toBe(125000 + 822 + 6000);
  });

  it("räknar från dagen efter förfallodatum", () => {
    expect(reminderAmounts(inv(1001), settings, "2026-12-02").daysLate).toBe(1);
    expect(reminderAmounts(inv(1001), settings, "2026-12-01").daysLate).toBe(0);
    expect(reminderAmounts(inv(1001), settings, "2026-11-15").daysLate).toBe(0);
  });

  it("ger ingen ränta före förfallodagen eller utan räntesats", () => {
    expect(reminderAmounts(inv(1001), settings, "2026-12-01").interest).toBe(0);
    const { lateInterestPercent: _l, ...noRate } = settings;
    expect(reminderAmounts(inv(1001), noRate, "2026-12-31").interest).toBe(0);
  });

  it("begränsar avgiften till 60 kr och saknad avgift blir 0", () => {
    expect(reminderAmounts(inv(1001), { ...settings, reminderFee: 10000 }, "2026-12-31").fee).toBe(
      MAX_REMINDER_FEE,
    );
    const { reminderFee: _r, ...noFee } = settings;
    expect(reminderAmounts(inv(1001), noFee, "2026-12-31").fee).toBe(0);
  });

  it("avrundar halva ören bort från noll", () => {
    // 365 dagars ränta på 100 kr med 0,005 % = 0,5 öre -> 1 öre
    const lines = [{ id: "l", description: "x", quantity: 1, unitPrice: 10000, vatRate: 0 as const }];
    const r = reminderAmounts(inv(1001, { lines, dueDate: "2025-12-31" }), { ...settings, lateInterestPercent: 0.005 }, "2026-12-31");
    expect(r.daysLate).toBe(365);
    expect(r.interest).toBe(1);
  });

  it("räknar räntan i heltal även för stora belopp och decimalräntor", () => {
    const big = [{ id: "l", description: "x", quantity: 1, unitPrice: 9_000_000_000_000, vatRate: 0 as const }];
    const r = reminderAmounts(inv(1001, { lines: big }), { ...settings, lateInterestPercent: 8.25 }, "2027-12-01");
    // 90 000 000 000 kr × 8,25 % × 365 / 365 dagar = exakt 8,25 % av kapitalet
    expect(r.daysLate).toBe(365);
    expect(r.interest).toBe(742_500_000_000);
  });

  it("kastar fel för utkast, betalda fakturor och kreditfakturor", () => {
    expect(() => reminderAmounts(inv(0, { status: "draft", ocr: "" }), settings, "2026-12-31")).toThrow(/utkast/i);
    expect(() => reminderAmounts(inv(1001, { status: "paid" }), settings, "2026-12-31")).toThrow(/betald/);
    expect(() => reminderAmounts(inv(1002, { creditFor: "i1001" }), settings, "2026-12-31")).toThrow(/kreditfaktura/);
  });

  it("kastar fel vid ogiltigt datum", () => {
    expect(() => reminderAmounts(inv(1001), settings, "2026-13-40")).toThrow();
  });

  it("validerar och säkerhetskopierar reminderFee", () => {
    expect(isCompanySettings(settings)).toBe(true);
    expect(isCompanySettings({ ...settings, reminderFee: -1 })).toBe(false);
    expect(isCompanySettings({ ...settings, reminderFee: 1.5 })).toBe(false);
    const source = createLocalStore(memory());
    source.saveSettings(settings);
    const target = createLocalStore(memory());
    importBackup(target, parseBackup(JSON.stringify(exportBackup(source))), "replace");
    expect(target.getSettings()?.reminderFee).toBe(6000);
  });
});

describe("invoicesToCsv", () => {
  const header =
    "Fakturanummer;Fakturadatum;Förfallodatum;Kund;Kundens org.nr;Momssats;Netto;Moms;Totalt;Status;Betaldatum;Avser faktura";

  it("har BOM, CRLF och rubrikrad", () => {
    const csv = invoicesToCsv([], []);
    expect(csv).toBe(`﻿${header}\r\n`);
  });

  it("skriver en rad per faktura och momssats med decimalkomma", () => {
    const mixed = inv(1001, {
      lines: [
        { id: "a", description: "x", quantity: 10, unitPrice: 10000, vatRate: 25 },
        { id: "b", description: "y", quantity: 1, unitPrice: 123450, vatRate: 6 },
      ],
    });
    const lines = invoicesToCsv([mixed], [customer]).split("\r\n");
    expect(lines[1]).toBe("1001;2026-11-01;2026-12-01;Testkund AB;556000-0001;6;1234,50;74,07;1308,57;Obetald;;");
    expect(lines[2]).toBe("1001;2026-11-01;2026-12-01;Testkund AB;556000-0001;25;1000,00;250,00;1250,00;Obetald;;");
    expect(lines[3]).toBe("1001;2026-11-01;2026-12-01;Testkund AB;556000-0001;Öresavrundning;0,00;0,00;0,43;Obetald;;");
    expect(lines[4]).toBe("");
  });

  it("tar bara med utfärdade fakturor och sorterar på nummer", () => {
    const csv = invoicesToCsv(
      [inv(1002), inv(0, { id: "d", status: "draft", ocr: "" }), inv(1001)],
      [customer],
    );
    const rows = csv.split("\r\n").slice(1, -1);
    expect(rows.map((r) => r.split(";")[0])).toEqual(["1001", "1002"]);
  });

  it("filtrerar på fakturadatum, inklusive gränserna", () => {
    const list = [
      inv(1001, { issueDate: "2026-10-31" }),
      inv(1002, { issueDate: "2026-11-01" }),
      inv(1003, { issueDate: "2026-11-30" }),
      inv(1004, { issueDate: "2026-12-01" }),
    ];
    const nums = (csv: string) => csv.split("\r\n").slice(1, -1).map((r) => r.split(";")[0]);
    expect(nums(invoicesToCsv(list, [customer], "2026-11-01", "2026-11-30"))).toEqual(["1002", "1003"]);
    expect(nums(invoicesToCsv(list, [customer], "2026-11-30"))).toEqual(["1003", "1004"]);
    expect(nums(invoicesToCsv(list, [customer], undefined, "2026-10-31"))).toEqual(["1001"]);
    expect(() => invoicesToCsv(list, [customer], "2026-13-01")).toThrow();
  });

  it("ger kreditfakturor negativa belopp och hänvisar till originalet", () => {
    const original = inv(1001);
    const credit = inv(1002, {
      creditFor: "i1001",
      lines: [{ id: "l", description: "Konsult", quantity: -10, unitPrice: 10000, vatRate: 25 }],
    });
    const rows = invoicesToCsv([original, credit], [customer]).split("\r\n");
    expect(rows[1]).toContain(";Krediterad;;");
    expect(rows[2]).toBe("1002;2026-11-01;2026-12-01;Testkund AB;556000-0001;25;-1000,00;-250,00;-1250,00;Kreditfaktura;;1001");
  });

  it("visar status Betald med betaldatum", () => {
    const paid = inv(1001, { status: "paid", paidDate: "2026-11-20" });
    expect(invoicesToCsv([paid], [customer]).split("\r\n")[1]).toContain(";Betald;2026-11-20;");
  });

  it("lägger till en rad Öresavrundning när avrundningen inte är 0", () => {
    const up = inv(1001, {
      lines: [{ id: "l", description: "x", quantity: 1, unitPrice: 100050, vatRate: 0 }],
    });
    const down = inv(1002, {
      lines: [{ id: "l", description: "x", quantity: 1, unitPrice: 100049, vatRate: 0 }],
    });
    const rows = invoicesToCsv([up, down], [customer]).split("\r\n");
    expect(rows[2]).toBe("1001;2026-11-01;2026-12-01;Testkund AB;556000-0001;Öresavrundning;0,00;0,00;0,50;Obetald;;");
    expect(rows[4]).toBe("1002;2026-11-01;2026-12-01;Testkund AB;556000-0001;Öresavrundning;0,00;0,00;-0,49;Obetald;;");
    expect(rows).toHaveLength(6);
  });

  it("summan av Totalt per faktura är lika med att betala", () => {
    const mixed = inv(1001, {
      lines: [
        { id: "a", description: "x", quantity: 1, unitPrice: 33333, vatRate: 25 },
        { id: "b", description: "y", quantity: 1, unitPrice: 12345, vatRate: 6 },
      ],
    });
    const sum = invoicesToCsv([mixed], [customer])
      .split("\r\n")
      .slice(1, -1)
      .map((r) => Number(r.split(";")[8]?.replace(",", ".")))
      .reduce((a, b) => a + b, 0);
    expect(Math.round(sum * 100)).toBe(calculateTotals(mixed.lines).total);
  });

  it("citerar fält med semikolon och citattecken", () => {
    const odd: Customer = { ...customer, name: 'Test; "Kund" AB' };
    expect(invoicesToCsv([inv(1001)], [odd]).split("\r\n")[1]).toContain('"Test; ""Kund"" AB"');
  });

  it("hanterar saknad kund och fakturor utan rader", () => {
    const noLines = inv(1001, { lines: [], customerId: "okänd" });
    expect(invoicesToCsv([noLines], []).split("\r\n")[1]).toBe("1001;2026-11-01;2026-12-01;;;0;0,00;0,00;0,00;Obetald;;");
  });
});
