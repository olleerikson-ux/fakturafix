/** Luhn-kontrollsiffra (modulo 10) för en sträng med siffror. */
function luhnCheckDigit(digits: string): number {
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

/** Längdsiffra: total längd inklusive längd- och kontrollsiffra, modulo 10. */
function lengthDigit(payloadLength: number): number {
  return (payloadLength + 2) % 10;
}

/**
 * Skapar OCR-nummer från fakturanummer: fakturanumret, en längdsiffra och
 * en Luhn-kontrollsiffra. Exempel: 1001 -> "100164".
 */
export function createOcr(invoiceNumber: number): string {
  if (!Number.isSafeInteger(invoiceNumber) || invoiceNumber < 0) {
    throw new Error(`Ogiltigt fakturanummer för OCR: ${invoiceNumber}`);
  }
  const payload = String(invoiceNumber);
  const withLength = `${payload}${lengthDigit(payload.length)}`;
  return `${withLength}${luhnCheckDigit(withLength)}`;
}

/** Kontrollerar längdsiffra och Luhn-kontrollsiffra. */
export function isValidOcr(ocr: string): boolean {
  if (!/^\d{3,25}$/.test(ocr)) return false;
  const withLength = ocr.slice(0, -1);
  const lengthChar = ocr[ocr.length - 2];
  const checkChar = ocr[ocr.length - 1];
  return (
    Number(lengthChar) === ocr.length % 10 &&
    Number(checkChar) === luhnCheckDigit(withLength)
  );
}
