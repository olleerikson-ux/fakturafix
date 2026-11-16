import { describe, expect, it } from "vitest";
import { createCreditNote } from "./credit";
import { displayStatus } from "./dates";
import { createOcr } from "./ocr";
import { createLocalStore } from "./storage";
import type { Invoice } from "./types";

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

function inv(
  id: string,
  number: number,
  extra: Partial<Invoice> = {},
): Invoice {
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
        quantity: 2,
        unitPrice: 50000,
        vatRate: 25,
      },
    ],
    ocr: number > 0 ? createOcr(number) : "",
    status: number > 0 ? "sent" : "draft",
    createdAt: "2026-11-01T10:00:00.000Z",
    ...extra,
  };
}

function storeWithOriginal() {
  const store = createLocalStore(memory());
  const original = inv("o1", 1001);
  store.saveInvoice(original);
  return { store, original };
}

describe("createCreditNote", () => {
  it("skapar ett utkast med negerade rader och hänvisning", () => {
    const { original } = storeWithOriginal();
    const note = createCreditNote(original, "2026-11-10");
    expect(note).toMatchObject({
      number: 0,
      ocr: "",
      status: "draft",
      customerId: "k1",
      issueDate: "2026-11-10",
      dueDate: "2026-11-10",
      creditFor: "o1",
      notes: "Kreditering av faktura 1001 (2026-11-01)",
    });
    expect(note.lines[0]?.quantity).toBe(-2);
    expect(note.id).not.toBe(original.id);
  });

  it("kastar fel för utkast, kreditfaktura och ogiltigt datum", () => {
    expect(() => createCreditNote(inv("d", 0), "2026-11-10")).toThrow();
    expect(() =>
      createCreditNote(inv("c", 1002, { creditFor: "o1" }), "2026-11-10"),
    ).toThrow();
    expect(() => createCreditNote(inv("o", 1001), "2026-13-40")).toThrow();
  });
});

describe("displayStatus med kreditfakturor", () => {
  it("ger credit-note och credited", () => {
    const original = inv("o1", 1001);
    const note = inv("c1", 1002, { creditFor: "o1" });
    expect(displayStatus(note, "2026-11-02")).toBe("credit-note");
    expect(displayStatus(original, "2026-11-02", [original, note])).toBe(
      "credited",
    );
    expect(displayStatus(original, "2026-11-02", [original])).toBe("unpaid");
    expect(displayStatus(original, "2026-11-02")).toBe("unpaid");
  });

  it("ignorerar utkast till kreditfaktura", () => {
    const original = inv("o1", 1001);
    const draft = inv("c1", 0, { creditFor: "o1" });
    expect(displayStatus(original, "2026-11-02", [original, draft])).toBe(
      "unpaid",
    );
    expect(displayStatus(draft, "2026-11-02")).toBe("draft");
  });
});

describe("saveInvoice med kreditfakturor", () => {
  it("sparar och utfärdar en kreditfaktura i samma serie", () => {
    const { store, original } = storeWithOriginal();
    const draft = createCreditNote(original, "2026-11-10");
    store.saveInvoice(draft);
    store.saveInvoice({
      ...draft,
      number: 1002,
      ocr: createOcr(1002),
      status: "sent",
    });
    expect(store.getInvoice(draft.id)?.number).toBe(1002);
    expect(store.nextInvoiceNumber()).toBe(1003);
  });

  it("kräver creditFor för negativ total", () => {
    const { store } = storeWithOriginal();
    const neg = inv("n", 0, {
      lines: [
        {
          id: "l",
          description: "x",
          quantity: -1,
          unitPrice: 10000,
          vatRate: 25,
        },
      ],
    });
    expect(() =>
      store.saveInvoice({
        ...neg,
        number: 1002,
        ocr: createOcr(1002),
        status: "sent",
      }),
    ).toThrow(/negativ/);
  });

  it("kräver total ≤ 0 på kreditfaktura", () => {
    const { store } = storeWithOriginal();
    expect(() => store.saveInvoice(inv("c", 0, { creditFor: "o1" }))).toThrow(
      /0 eller lägre/,
    );
  });

  it("kräver utfärdad original som inte är kreditfaktura", () => {
    const { store, original } = storeWithOriginal();
    const note = createCreditNote(original, "2026-11-10");
    expect(() =>
      store.saveInvoice({ ...note, id: "x2", creditFor: "saknas" }),
    ).toThrow(/utfärdad/);
  });

  it("avvisar krediterad kreditfaktura och utkast som original", () => {
    const { store, original } = storeWithOriginal();
    const note = createCreditNote(original, "2026-11-10");
    store.saveInvoice({
      ...note,
      number: 1002,
      ocr: createOcr(1002),
      status: "sent",
    });
    const again = {
      ...createCreditNote(original, "2026-11-11"),
      creditFor: note.id,
    };
    expect(() => store.saveInvoice(again)).toThrow(/kreditfaktura/);
    const draftOrig = inv("dd", 0);
    store.saveInvoice(draftOrig);
    expect(() =>
      store.saveInvoice({ ...note, id: "z", creditFor: "dd" }),
    ).toThrow(/utfärdad/);
  });

  it("tillåter högst en utfärdad kreditfaktura per original", () => {
    const { store, original } = storeWithOriginal();
    const a = createCreditNote(original, "2026-11-10");
    const b = createCreditNote(original, "2026-11-11");
    store.saveInvoice(a);
    store.saveInvoice(b);
    store.saveInvoice({
      ...a,
      number: 1002,
      ocr: createOcr(1002),
      status: "sent",
    });
    expect(() =>
      store.saveInvoice({
        ...b,
        number: 1003,
        ocr: createOcr(1003),
        status: "sent",
      }),
    ).toThrow(/redan/);
  });
});
