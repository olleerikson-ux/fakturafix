/**
 * Kontroller av data som läses från lagringen. Datan kan vara trasig,
 * gammal eller ändrad för hand, så den granskas som `unknown` innan den
 * används som Customer, Invoice eller CompanySettings.
 */
import { isValidIsoDate } from './dates';
import { VAT_RATES, type Address, type Article, type CompanySettings, type Customer, type Invoice, type InvoiceLine } from './types';

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
    isOptionalBoolean(value.reverseCharge) &&
    isAddress(value.address) &&
    isString(value.createdAt)
  );
}

export function isArticle(value: unknown): value is Article {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.description) &&
    isOptionalString(value.unit) &&
    Number.isSafeInteger(value.unitPrice) &&
    (VAT_RATES as readonly unknown[]).includes(value.vatRate) &&
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

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

export const MAX_LOGO_LENGTH = 300_000;
const LOGO_PATTERN = /^data:image\/(png|jpeg|svg\+xml)[;,]/;

/** En logotyp som data-URL: PNG, JPEG eller SVG, högst MAX_LOGO_LENGTH tecken. */
export function isLogoDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_LOGO_LENGTH && LOGO_PATTERN.test(value);
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
    isOptionalString(value.creditFor) &&
    isOptionalBoolean(value.vatExempt) &&
    isOptionalBoolean(value.reverseCharge) &&
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
    (value.lateInterestPercent === undefined || isFiniteNumber(value.lateInterestPercent)) &&
    (value.reminderFee === undefined || (Number.isSafeInteger(value.reminderFee) && (value.reminderFee as number) >= 0)) &&
    isOptionalBoolean(value.vatExempt) &&
    isOptionalString(value.vatExemptText) &&
    (value.logoDataUrl === undefined || isLogoDataUrl(value.logoDataUrl))
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
