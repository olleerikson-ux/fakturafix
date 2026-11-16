/**
 * Gemensamma datatyper för Fakturafix.
 *
 * Den här filen är ett KONTRAKT mellan kärnlogiken (src/core) och
 * gränssnittet (src/ui). Ändra den bara via en egen issue som VD godkänt.
 *
 * Belopp lagras alltid som heltal i öre (1 kr = 100 öre) för att undvika
 * avrundningsfel med flyttal. Datum lagras som ISO-strängar "YYYY-MM-DD".
 */

/** Tillåtna momssatser i procent. */
export type VatRate = 0 | 6 | 12 | 25;

export const VAT_RATES: readonly VatRate[] = [25, 12, 6, 0];

/** Belopp i öre. */
export type Ore = number;

/** Datum som "YYYY-MM-DD". */
export type IsoDate = string;

export interface Address {
  street: string;
  postalCode: string;
  city: string;
  /** Tomt eller "Sverige" för svenska adresser. */
  country?: string;
}

export interface Customer {
  id: string;
  name: string;
  /** Organisations- eller personnummer, t.ex. "556677-8899". */
  orgNumber?: string;
  /** Momsregistreringsnummer, t.ex. "SE556677889901". */
  vatNumber?: string;
  email?: string;
  /** "Er referens" på fakturan. */
  reference?: string;
  address: Address;
  createdAt: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  /** Antal, får ha decimaler (t.ex. 1.5 timmar). */
  quantity: number;
  /** Enhet, t.ex. "st" eller "tim". */
  unit?: string;
  /** Pris per enhet exklusive moms, i öre. */
  unitPrice: Ore;
  vatRate: VatRate;
}

/** Lagrad status. "Förfallen" lagras inte, den räknas fram (se InvoiceDisplayStatus). */
export type InvoiceStatus = 'draft' | 'sent' | 'paid';

/** Status som visas i översikten. */
export type InvoiceDisplayStatus = 'draft' | 'unpaid' | 'overdue' | 'paid';

export interface Invoice {
  id: string;
  /**
   * Löpande fakturanummer, börjar på 1001. Utkast har 0. Numret delas ut när
   * fakturan utfärdas (status 'sent'), så att serien blir obruten.
   */
  number: number;
  customerId: string;
  issueDate: IsoDate;
  dueDate: IsoDate;
  lines: InvoiceLine[];
  /** OCR-nummer med kontrollsiffror, se core/ocr.ts. Tom sträng för utkast. */
  ocr: string;
  status: InvoiceStatus;
  paidDate?: IsoDate;
  notes?: string;
  createdAt: string;
}

export interface InvoiceTotals {
  /** Summa exklusive moms. */
  net: Ore;
  /** Moms per sats (bara satser som förekommer på fakturan). */
  vatByRate: Partial<Record<VatRate, Ore>>;
  /** Total moms. */
  vat: Ore;
  /** Öresavrundning så att totalen blir hela kronor (kan vara negativ). */
  rounding: Ore;
  /** Att betala, i hela kronor uttryckt i öre. */
  total: Ore;
}

/** Säljarens uppgifter som skrivs ut på varje faktura. */
export interface CompanySettings {
  name: string;
  orgNumber: string;
  vatNumber?: string;
  address: Address;
  email?: string;
  phone?: string;
  bankgiro?: string;
  plusgiro?: string;
  /** "Godkänd för F-skatt". */
  fSkatt: boolean;
  /** Standardantal dagar till förfallodatum. */
  paymentTermsDays: number;
  /** Dröjsmålsränta i procent, skrivs ut på fakturan. */
  lateInterestPercent?: number;
}
