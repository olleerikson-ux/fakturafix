/** Håller reda på när användaren senast tog en säkerhetskopia (bara i den här webbläsaren). */
import { addDays, isValidIsoDate, type IsoDate } from '../core/index';

const LAST_BACKUP_KEY = 'fakturafix-ui:lastBackup';
export const BACKUP_REMINDER_DAYS = 30;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export function getLastBackupDate(): IsoDate | undefined {
  try {
    const value = storage()?.getItem(LAST_BACKUP_KEY);
    return value && isValidIsoDate(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function markBackupTaken(date: IsoDate): void {
  try {
    storage()?.setItem(LAST_BACKUP_KEY, date);
  } catch {
    // Påminnelsen är en bekvämlighet. Misslyckas sparningen visas den bara oftare.
  }
}

/** Sant om det finns data att förlora och ingen kopia tagits de senaste 30 dagarna. */
export function needsBackupReminder(hasData: boolean, last: IsoDate | undefined, todayDate: IsoDate): boolean {
  if (!hasData) return false;
  return last === undefined || addDays(last, BACKUP_REMINDER_DAYS) <= todayDate;
}
