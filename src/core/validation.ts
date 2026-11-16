/**
 * Kontroller av data som läses från lagringen. Datan kan vara trasig,
 * gammal eller ändrad för hand, så den granskas som `unknown` innan den
 * används som Customer, Invoice eller CompanySettings.
 */
import { isValidIsoDate } from './dates';
import { VAT_RATES, type Address, type CompanySettings, type Customer, type Invoice, type InvoiceLine } from './types';

type UnknownRecord = Record<string, unknown>;

const INVOICE_STATUSES: readonly unknown[] = ['draft', 'sent', 'paid'];
export const FIRST_INVOICE_NUMBER = 1001;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoDate(value: unknown): boolean {
  return isString(value) && isValidIsoDate(value);
}

/** Fakturanummer: 0 för utkast, annars ett heltal från 1001 och uppåt. */
export function isValidInvoiceNumber(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value === 0 || (value as number) >= FIRST_INVOICE_NUMBER);
}

function isAddress(value: unknown): value is Address {
  return (
    isRecord(value) &&
    isString(value.street) &&
    isString(value.postalCode) &&
    isString(value.city) &&
    isOptionalString(value.country)
  );
}

export function isCustomer(value: unknown): value is Customer {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isOptionalString(value.orgNumber) &&
    isOptionalString(value.vatNumber) &&
    isOptionalString(value.email) &&
    isOptionalString(value.reference) &&
    isAddress(value.address) &&
    isString(value.createdAt)
  );
}

function isInvoiceLine(value: unknown): value is InvoiceLine {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.description) &&
    isFiniteNumber(value.quantity) &&
    isOptionalString(value.unit) &&
    Number.isSafeInteger(value.unitPrice) &&
    (VAT_RATES as readonly unknown[]).includes(value.vatRate)
  );
}

export function isInvoice(value: unknown): value is Invoice {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isValidInvoiceNumber(value.number) &&
    isString(value.customerId) &&
    isIsoDate(value.issueDate) &&
    isIsoDate(value.dueDate) &&
    Array.isArray(value.lines) &&
    value.lines.every(isInvoiceLine) &&
    isString(value.ocr) &&
    INVOICE_STATUSES.includes(value.status) &&
    (value.paidDate === undefined || isIsoDate(value.paidDate)) &&
    isOptionalString(value.notes) &&
    isString(value.createdAt)
  );
}

export function isCompanySettings(value: unknown): value is CompanySettings {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.orgNumber) &&
    isOptionalString(value.vatNumber) &&
    isAddress(value.address) &&
    isOptionalString(value.email) &&
    isOptionalString(value.phone) &&
    isOptionalString(value.bankgiro) &&
    isOptionalString(value.plusgiro) &&
    typeof value.fSkatt === 'boolean' &&
    Number.isSafeInteger(value.paymentTermsDays) &&
    (value.lateInterestPercent === undefined || isFiniteNumber(value.lateInterestPercent))
  );
}

/** Jämför två JSON-liknande värden på innehåll. Nycklarnas ordning spelar ingen roll. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}
