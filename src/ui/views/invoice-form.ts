/**
 * Fakturaformulär: ny faktura (#/fakturor/ny) och redigering av utkast (#/fakturor/<id>).
 *
 * Löpnummerserien ska vara obruten (se AGENTS.md). Ett utkast sparas därför med
 * number 0 och ocr ''. Nummer och OCR delas ut först vid "Markera som skickad",
 * i samma saveInvoice som sätter status 'sent'. En utfärdad faktura visas skrivskyddad.
 */
import {
  addDays,
  calculateTotals,
  createCreditNote,
  createOcr,
  formatSek,
  isValidIsoDate,
  lineNet,
  newId,
  parseSek,
  today,
  VAT_RATES,
  type Customer,
  type Invoice,
  type InvoiceLine,
  type IsoDate,
  type Store,
  type VatRate,
} from '../../core/index';
import { printInvoice } from '../../print/print';
import { h } from '../dom';
import {
  errorMessage,
  type FieldErrors,
  optional,
  readText,
  selectField,
  showErrors,
  textField,
} from '../form';

const ID_PREFIX = 'faktura';
const DEFAULT_PAYMENT_TERMS_DAYS = 30;

/** En fakturarad som den står i formuläret, innan den tolkats. */
export interface LineInput {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: VatRate;
}

/** Formulärets värden innan de blir en Invoice. */
export interface InvoiceInput {
  customerId: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  lines: LineInput[];
}

export type SaveMode = 'draft' | 'send';

/**
 * Tolkar antal som "2", "1,5" eller "1.5". Måste vara större än noll, annars null.
 * På en kreditfaktura (credit) ska antalet i stället vara mindre än noll, t.ex. "-1".
 */
export function parseQuantity(value: string, credit = false): number | null {
  const text = value.replace(/\s+/g, '');
  if (!/^-?\d+([.,]\d+)?$/.test(text)) return null;
  const quantity = Number(text.replace(',', '.'));
  if (credit) return quantity < 0 ? quantity : null;
  return quantity > 0 ? quantity : null;
}

/** Ett nytt utkast med samma kund, rader och meddelande, med dagens datum och nytt förfallodatum. */
export function copyAsDraft(source: Invoice, todayDate: IsoDate, termsDays: number): Invoice {
  return {
    id: newId(),
    number: 0,
    customerId: source.customerId,
    issueDate: todayDate,
    dueDate: addDays(todayDate, termsDays),
    lines: source.lines.map((line) => ({ ...line, id: newId() })),
    ocr: '',
    status: 'draft',
    ...(source.notes !== undefined ? { notes: source.notes } : {}),
    createdAt: new Date().toISOString(),
  };
}

/** Öre till redigerbar text, t.ex. 125000 -> "1250,00". Bara heltalsräkning. */
export function oreToInput(ore: number): string {
  const abs = Math.abs(ore);
  return `${ore < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** En rad där varken beskrivning eller pris är ifyllt räknas som tom och sparas inte. */
function isBlankLine(line: LineInput): boolean {
  return line.description === '' && line.unitPrice === '';
}

function lineField(lineId: string, field: keyof Omit<LineInput, 'id'>): string {
  return `line-${lineId}-${field}`;
}

/** Tolkar en rad. Ogiltigt antal eller pris ger null. */
export function toInvoiceLine(line: LineInput, credit = false): InvoiceLine | null {
  const quantity = parseQuantity(line.quantity, credit);
  const unitPrice = parseSek(line.unitPrice);
  if (quantity === null || unitPrice === null) return null;
  return {
    id: line.id,
    description: line.description,
    quantity,
    unit: optional(line.unit),
    unitPrice,
    vatRate: line.vatRate,
  };
}

/**
 * Validerar formuläret. Ett utkast kräver kund, giltiga datum och tolkningsbara rader.
 * För att skicka krävs dessutom minst en rad och en beskrivning på varje rad.
 */
export function validateInvoice(input: InvoiceInput, mode: SaveMode, credit = false): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.customerId) errors.customerId = 'Välj en kund.';
  if (!isValidIsoDate(input.issueDate)) errors.issueDate = 'Ange fakturadatum som ÅÅÅÅ-MM-DD.';
  if (!isValidIsoDate(input.dueDate)) errors.dueDate = 'Ange förfallodatum som ÅÅÅÅ-MM-DD.';
  else if (!errors.issueDate && input.dueDate < input.issueDate) {
    errors.dueDate = 'Förfallodatum kan inte vara före fakturadatum.';
  }
  for (const line of input.lines.filter((l) => !isBlankLine(l))) {
    if (mode === 'send' && !line.description) {
      errors[lineField(line.id, 'description')] = 'Ange en beskrivning.';
    }
    if (parseQuantity(line.quantity, credit) === null) {
      errors[lineField(line.id, 'quantity')] = credit
        ? 'Ange ett negativt antal, t.ex. -1 eller -1,5.'
        : 'Ange ett antal större än 0, t.ex. 1 eller 1,5.';
    }
    if (parseSek(line.unitPrice) === null) {
      errors[lineField(line.id, 'unitPrice')] = 'Ange ett pris, t.ex. 1 250,00.';
    }
  }
  return errors;
}

function byName(a: Customer, b: Customer): number {
  return a.name.localeCompare(b.name, 'sv');
}

function emptyLine(): LineInput {
  return { id: newId(), description: '', quantity: '1', unit: '', unitPrice: '', vatRate: 25 };
}

function lineToInput(line: InvoiceLine): LineInput {
  return {
    id: line.id,
    description: line.description,
    quantity: String(line.quantity).replace('.', ','),
    unit: line.unit ?? '',
    unitPrice: oreToInput(line.unitPrice),
    vatRate: line.vatRate,
  };
}

function setHash(hash: string): void {
  // replaceState ändrar adressen utan hashchange, så vyn och dess meddelande ligger kvar.
  history.replaceState(null, '', hash);
}

interface Notice {
  text: string;
  kind: 'ok' | 'error';
}

/**
 * Ritar fakturaformuläret. Utan invoiceId skapas en ny faktura,
 * annars öppnas den sparade fakturan (utkast kan redigeras, utfärdade visas skrivskyddade).
 */
export function invoiceFormView(root: HTMLElement, store: Store, invoiceId?: string, notice?: Notice): void {
  const existing = invoiceId ? store.getInvoice(invoiceId) : undefined;
  if (invoiceId && !existing) {
    root.replaceChildren(
      h('h1', {}, 'Faktura'),
      h('p', { class: 'notice notice-error' }, 'Fakturan finns inte. Den kan ha raderats.'),
      h('p', {}, h('a', { href: '#/fakturor/ny' }, 'Skapa en ny faktura')),
    );
    return;
  }

  const issued = existing !== undefined && existing.status !== 'draft';
  const isCreditNote = existing?.creditFor !== undefined;
  const original = isCreditNote ? store.getInvoice(existing.creditFor ?? '') : undefined;
  const allInvoices = existing ? store.listInvoices() : [];
  const alreadyCredited = existing !== undefined && allInvoices.some((i) => i.creditFor === existing.id && i.status !== 'draft');
  const canCredit = issued && !isCreditNote && !alreadyCredited;
  const settings = store.getSettings();
  const customers = store.listCustomers().sort(byName);
  const rerender = (id: string | undefined, next: Notice) => invoiceFormView(root, store, id, next);

  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const announce = (text: string, kind: Notice['kind'] = 'ok') => {
    status.replaceChildren(...(text ? [h('p', { class: `notice notice-${kind}` }, text)] : []));
  };

  const title = isCreditNote
    ? issued
      ? `Kreditfaktura ${existing.number}`
      : 'Kreditfaktura (utkast)'
    : issued
      ? `Faktura ${existing.number}`
      : existing
        ? 'Redigera utkast'
        : 'Ny faktura';

  if (customers.length === 0 && !existing) {
    root.replaceChildren(
      h('h1', {}, title),
      h(
        'p',
        { class: 'empty' },
        'Du behöver lägga till en kund innan du kan skapa en faktura. ',
        h('a', { href: '#/kunder' }, 'Gå till Kunder'),
      ),
    );
    return;
  }

  // ---- Kund, datum och meddelande ----
  const issueDate = existing?.issueDate ?? today();
  const termsDays = settings?.paymentTermsDays ?? DEFAULT_PAYMENT_TERMS_DAYS;
  let dueDateTouched = existing !== undefined;

  const headerFields = h(
    'fieldset',
    {},
    h('legend', {}, 'Kund och datum'),
    selectField(ID_PREFIX, { name: 'customerId', label: 'Kund', value: existing?.customerId, required: true }, [
      { value: '', label: 'Välj kund …' },
      ...customers.map((c) => ({ value: c.id, label: c.name })),
    ]),
    textField(ID_PREFIX, { name: 'issueDate', label: 'Fakturadatum', type: 'date', value: issueDate, required: true }),
    textField(ID_PREFIX, {
      name: 'dueDate',
      label: 'Förfallodatum',
      type: 'date',
      value: existing?.dueDate ?? addDays(issueDate, termsDays),
      required: true,
      hint: `Standard är ${termsDays} dagar efter fakturadatum.`,
    }),
  );

  // ---- Rader ----
  const lineIds: string[] = [];
  const linesContainer = h('div', { class: 'lines' });

  const lineElement = (line: LineInput): HTMLElement => {
    const field = (name: keyof Omit<LineInput, 'id'>, label: string, value: string, extra: object = {}) =>
      textField(ID_PREFIX, { name: lineField(line.id, name), label, value, ...extra });
    const amount = h('output', { class: 'line-amount', 'data-line-amount': line.id });
    const row = h(
      'fieldset',
      { class: 'line', 'data-line': line.id },
      h('legend', { class: 'visually-hidden' }, 'Fakturarad'),
      field('description', 'Beskrivning', line.description),
      field('quantity', 'Antal', line.quantity, { inputmode: 'decimal' }),
      field('unit', 'Enhet', line.unit, { placeholder: 'st, tim' }),
      field('unitPrice', 'Á-pris exkl. moms', line.unitPrice, { inputmode: 'decimal', placeholder: 'kr' }),
      selectField(
        ID_PREFIX,
        { name: lineField(line.id, 'vatRate'), label: 'Moms', value: String(line.vatRate) },
        VAT_RATES.map((rate) => ({ value: String(rate), label: `${rate} %` })),
      ),
      h('div', { class: 'field line-total' }, h('span', { class: 'line-total-label' }, 'Belopp'), amount),
      h(
        'button',
        {
          type: 'button',
          class: 'btn-danger line-remove',
          'aria-label': 'Ta bort raden',
          onclick: () => {
            lineIds.splice(lineIds.indexOf(line.id), 1);
            row.remove();
            updateTotals();
            addLineButton.focus();
          },
        },
        'Ta bort',
      ),
    );
    return row;
  };

  const addLine = (line: LineInput) => {
    lineIds.push(line.id);
    linesContainer.append(lineElement(line));
  };

  const addLineButton = h(
    'button',
    {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => {
        const line = emptyLine();
        addLine(line);
        updateTotals();
        form.querySelector<HTMLInputElement>(`[name="${lineField(line.id, 'description')}"]`)?.focus();
      },
    },
    '+ Lägg till rad',
  );

  // ---- Summering ----
  const totals = h('dl', { class: 'totals' });

  const readInput = (): InvoiceInput => ({
    customerId: readText(form, 'customerId'),
    issueDate: readText(form, 'issueDate'),
    dueDate: readText(form, 'dueDate'),
    notes: readText(form, 'notes'),
    lines: lineIds.map((id) => ({
      id,
      description: readText(form, lineField(id, 'description')),
      quantity: readText(form, lineField(id, 'quantity')),
      unit: readText(form, lineField(id, 'unit')),
      unitPrice: readText(form, lineField(id, 'unitPrice')),
      vatRate: Number(readText(form, lineField(id, 'vatRate'))) as VatRate,
    })),
  });

  /** Raderna som går att tolka, tomma rader borträknade. */
  const parsedLines = (input: InvoiceInput): InvoiceLine[] =>
    input.lines.filter((l) => !isBlankLine(l)).flatMap((l) => toInvoiceLine(l, isCreditNote) ?? []);

  function updateTotals(): void {
    const input = readInput();
    for (const line of input.lines) {
      const parsed = toInvoiceLine(line, isCreditNote);
      const out = form.querySelector(`[data-line-amount="${line.id}"]`);
      if (out) out.textContent = parsed ? formatSek(lineNet(parsed)) : '–';
    }
    const sum = calculateTotals(parsedLines(input));
    const row = (label: string, value: string, cls = '') =>
      h('div', { class: `totals-row ${cls}`.trim() }, h('dt', {}, label), h('dd', {}, value));
    totals.replaceChildren(
      row('Netto', formatSek(sum.net)),
      ...VAT_RATES.flatMap((rate) => {
        const vat = sum.vatByRate[rate];
        return vat === undefined ? [] : [row(`Moms ${rate} %`, formatSek(vat))];
      }),
      row('Öresavrundning', formatSek(sum.rounding)),
      row('Att betala', formatSek(sum.total), 'totals-sum'),
    );
  }

  // ---- Spara, skicka och radera ----
  const buildInvoice = (input: InvoiceInput, mode: SaveMode, number: number): Invoice => ({
    id: existing?.id ?? newId(),
    number: mode === 'send' ? number : 0,
    customerId: input.customerId,
    issueDate: input.issueDate as IsoDate,
    dueDate: input.dueDate as IsoDate,
    lines: parsedLines(input),
    ocr: mode === 'send' ? createOcr(number) : '',
    status: mode === 'send' ? 'sent' : 'draft',
    notes: optional(input.notes),
    ...(existing?.creditFor !== undefined ? { creditFor: existing.creditFor } : {}),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });

  /** Om fakturan finns sparad med samma status och nummer som vi försökte spara (används vid utfärdande). */
  const isStoredAs = (invoice: Invoice): boolean => {
    try {
      const stored = store.getInvoice(invoice.id);
      return stored?.status === invoice.status && stored.number === invoice.number;
    } catch {
      return false;
    }
  };

  const save = (mode: SaveMode) => {
    const input = readInput();
    if (showErrors(form, validateInvoice(input, mode, isCreditNote))) {
      announce('Fakturan är inte sparad. Rätta de markerade fälten.', 'error');
      return;
    }
    if (mode === 'send') {
      if (!settings) {
        announce('Fyll i dina företagsuppgifter under Inställningar innan du skickar en faktura.', 'error');
        return;
      }
      if (parsedLines(input).length === 0) {
        announce('Lägg till minst en rad innan du skickar fakturan.', 'error');
        return;
      }
      const total = calculateTotals(parsedLines(input)).total;
      if (isCreditNote ? total > 0 : total < 0) {
        announce(
          isCreditNote
            ? 'Totalen på en kreditfaktura får inte vara positiv. Rätta antalen så att summan blir negativ.'
            : 'En faktura med negativt belopp kan inte skickas. Använd Kreditera på den ursprungliga fakturan.',
          'error',
        );
        return;
      }
      const question = 'Fakturan får nästa fakturanummer och kan sedan inte ändras eller raderas. Markera som skickad?';
      if (!window.confirm(question)) return;
    }

    let invoice: Invoice | undefined;
    try {
      // Numret hämtas först efter bekräftelsen, direkt före sparningen, så att en
      // annan flik inte hinner dela ut samma nummer medan dialogen står öppen.
      invoice = buildInvoice(input, mode, mode === 'send' ? store.nextInvoiceNumber() : 0);
      store.saveInvoice(invoice);
    } catch (error) {
      // Vid utfärdande kan lagringen ha sparat fakturan trots att den kastade fel
      // (t.ex. om bara nummerräknaren inte kunde skrivas). Då ska vyn visa den
      // utfärdade fakturan, annars skulle ett nytt försök utfärda samma underlag igen.
      if (mode !== 'send' || !invoice || !isStoredAs(invoice)) {
        const message = errorMessage(error, 'Fakturan kunde inte sparas.');
        announce(/försök igen/i.test(message) ? message : `${message} Försök igen.`, 'error');
        return;
      }
    }
    setHash(`#/fakturor/${invoice.id}`);
    rerender(invoice.id, {
      text:
        mode === 'send'
          ? `Faktura ${invoice.number} är markerad som skickad. OCR-nummer: ${invoice.ocr}.`
          : 'Utkastet är sparat.',
      kind: 'ok',
    });
  };

  const removeDraft = () => {
    if (!existing || !window.confirm('Vill du radera utkastet?')) return;
    try {
      store.deleteInvoice(existing.id);
    } catch (error) {
      announce(errorMessage(error, 'Fakturan kunde inte raderas. Försök igen.'), 'error');
      return;
    }
    setHash('#/fakturor/ny');
    rerender(undefined, { text: 'Utkastet är raderat.', kind: 'ok' });
  };

  const printNow = () => {
    if (!existing) return;
    const problem = printInvoice(store, existing.id);
    if (problem) announce(problem, 'error');
  };

  const credit = () => {
    if (!existing) return;
    try {
      const draft =
        allInvoices.find((i) => i.creditFor === existing.id && i.status === 'draft') ??
        createCreditNote(existing, today());
      if (draft.status === 'draft' && !store.getInvoice(draft.id)) store.saveInvoice(draft);
      setHash(`#/fakturor/${draft.id}`);
      rerender(draft.id, {
        text: 'Kreditfakturan är ett utkast. Justera raderna för en delkredit och markera den som skickad.',
        kind: 'ok',
      });
    } catch (error) {
      announce(errorMessage(error, 'Kreditfakturan kunde inte skapas. Försök igen.'), 'error');
    }
  };

  const copy = () => {
    if (!existing) return;
    try {
      const draft = copyAsDraft(existing, today(), termsDays);
      store.saveInvoice(draft);
      setHash(`#/fakturor/${draft.id}`);
      rerender(draft.id, { text: 'Ett nytt utkast är skapat som en kopia. Nummer och OCR delas ut när du markerar det som skickat.', kind: 'ok' });
    } catch (error) {
      announce(errorMessage(error, 'Kopian kunde inte skapas. Försök igen.'), 'error');
    }
  };
  const copyButton =
    existing && !isCreditNote ? [h('button', { type: 'button', class: 'btn-secondary', onclick: copy }, 'Kopiera till ny faktura')] : [];

  const actions = issued
    ? [
        h('button', { type: 'button', class: 'btn-primary', onclick: printNow }, 'Skriv ut'),
        ...copyButton,
        ...(canCredit ? [h('button', { type: 'button', class: 'btn-secondary', onclick: credit }, 'Kreditera')] : []),
      ]
    : [
        h('button', { type: 'button', class: 'btn-secondary', onclick: () => save('draft') }, 'Spara utkast'),
        h('button', { type: 'button', class: 'btn-primary', onclick: () => save('send') }, 'Markera som skickad'),
        ...copyButton,
        ...(existing ? [h('button', { type: 'button', class: 'btn-danger', onclick: removeDraft }, 'Radera utkast')] : []),
      ];

  const notesId = `${ID_PREFIX}-notes`;
  const content = h(
    'fieldset',
    { class: 'invoice-content', disabled: issued },
    h('legend', { class: 'visually-hidden' }, 'Fakturauppgifter'),
    headerFields,
    h(
      'fieldset',
      { class: 'lines-fieldset' },
      h('legend', {}, 'Rader'),
      linesContainer,
      ...(issued ? [] : [h('div', { class: 'form-actions' }, addLineButton)]),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: notesId }, 'Meddelande på fakturan'),
      h('textarea', { id: notesId, name: 'notes', rows: '3' }, existing?.notes ?? ''),
    ),
  );

  const form = h(
    'form',
    { novalidate: true, class: 'form invoice-form' },
    content,
    h('section', { class: 'totals-section', 'aria-label': 'Summering' }, h('h2', {}, 'Summering'), totals),
    h('div', { class: 'form-actions' }, ...actions),
  );
  // Enter i ett fält ska aldrig utfärda fakturan, det kräver ett aktivt knapptryck.
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === 'dueDate') dueDateTouched = true;
    if (target instanceof HTMLInputElement && target.name === 'issueDate' && !dueDateTouched && isValidIsoDate(target.value)) {
      const due = form.elements.namedItem('dueDate');
      if (due instanceof HTMLInputElement) due.value = addDays(target.value, termsDays);
    }
    updateTotals();
  });
  form.addEventListener('change', updateTotals);

  for (const line of existing ? existing.lines.map(lineToInput) : [emptyLine()]) addLine(line);

  const creditRef = isCreditNote
    ? [
        h(
          'p',
          { class: 'notice notice-info' },
          original
            ? `Avser faktura nr ${original.number}, daterad ${original.issueDate}. Antalen är negativa. Minska dem eller ta bort rader för en delkredit.`
            : 'Ursprungsfakturan finns inte längre.',
        ),
      ]
    : [];
  const intro = issued
    ? [
        h(
          'p',
          { class: 'notice notice-info' },
          `Fakturan är utfärdad (OCR-nummer ${existing.ocr}) och kan inte ändras eller raderas. Rätta den med en kreditfaktura.`,
        ),
      ]
    : existing
      ? [...creditRef, h('p', { class: 'hint' }, 'Utkast får fakturanummer och OCR-nummer först när de markeras som skickade.')]
      : [];

  root.replaceChildren(h('h1', {}, title), status, ...(issued ? creditRef : []), ...intro, h('section', { class: 'card' }, form));
  updateTotals();
  if (notice) announce(notice.text, notice.kind);
}
