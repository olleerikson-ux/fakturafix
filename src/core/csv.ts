import { isValidIsoDate } from './dates';
import type { Customer, Invoice, IsoDate, Ore, VatRate } from './types';
import { calculateTotals, lineNet } from './vat';

const BOM = '﻿';
const EOL = '\r\n';
const HEADER = [
  'Fakturanummer',
  'Fakturadatum',
  'Förfallodatum',
  'Kund',
  'Kundens org.nr',
  'Momssats',
  'Netto',
  'Moms',
  'Totalt',
  'Status',
  'Betaldatum',
  'Avser faktura',
];

/** Belopp i kronor med decimalkomma och två decimaler, utan tusentalsavgränsare. */
function kronor(amount: Ore): string {
  const abs = Math.abs(amount);
  const text = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  return amount < 0 ? `-${text}` : text;
}

function quote(field: string): string {
  return /[;"\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

function statusLabel(invoice: Invoice, credited: ReadonlySet<string>): string {
  if (invoice.creditFor !== undefined) return 'Kreditfaktura';
  if (credited.has(invoice.id)) return 'Krediterad';
  return invoice.status === 'paid' ? 'Betald' : 'Obetald';
}

function netByRate(invoice: Invoice): Map<VatRate, Ore> {
  const sums = new Map<VatRate, Ore>();
  for (const line of invoice.lines) {
    sums.set(line.vatRate, (sums.get(line.vatRate) ?? 0) + lineNet(line));
  }
  if (sums.size === 0) sums.set(0, 0);
  return sums;
}

function assertOptionalDate(label: string, date: IsoDate | undefined): void {
  if (date !== undefined && !isValidIsoDate(date)) throw new Error(`Ogiltigt ${label}datum: ${date}`);
}

function invoiceRows(
  invoice: Invoice,
  customer: Customer | undefined,
  numberById: ReadonlyMap<string, number>,
  credited: ReadonlySet<string>,
): string[][] {
  const vatByRate = calculateTotals(invoice.lines).vatByRate;
  const original = invoice.creditFor === undefined ? undefined : numberById.get(invoice.creditFor);
  return [...netByRate(invoice)]
    .sort(([a], [b]) => a - b)
    .map(([rate, net]) => {
      const vat = vatByRate[rate] ?? 0;
      return [
        String(invoice.number),
        invoice.issueDate,
        invoice.dueDate,
        customer?.name ?? '',
        customer?.orgNumber ?? '',
        String(rate),
        kronor(net),
        kronor(vat),
        kronor(net + vat),
        statusLabel(invoice, credited),
        invoice.paidDate ?? '',
        original === undefined ? '' : String(original),
      ];
    });
}

/**
 * Bokföringsexport som CSV för svensk Excel: semikolon, decimalkomma, CRLF och BOM.
 * En rad per utfärdad faktura och momssats. Kreditfakturor får negativa belopp.
 * `from` och `to` filtrerar på fakturadatum (båda inklusive).
 */
export function invoicesToCsv(
  invoices: Invoice[],
  customers: Customer[],
  from?: IsoDate,
  to?: IsoDate,
): string {
  assertOptionalDate('från', from);
  assertOptionalDate('till', to);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const numberById = new Map(invoices.map((invoice) => [invoice.id, invoice.number]));
  const credited = new Set(
    invoices.filter((i) => i.status !== 'draft' && i.creditFor !== undefined).map((i) => i.creditFor as string),
  );
  const rows = invoices
    .filter((invoice) => invoice.status !== 'draft')
    .filter((invoice) => (from === undefined || invoice.issueDate >= from) && (to === undefined || invoice.issueDate <= to))
    .sort((a, b) => a.number - b.number)
    .flatMap((invoice) => invoiceRows(invoice, customerById.get(invoice.customerId), numberById, credited));
  return BOM + [HEADER, ...rows].map((row) => row.map(quote).join(';') + EOL).join('');
}
