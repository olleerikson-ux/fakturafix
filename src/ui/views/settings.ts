/**
 * Företagsinställningar (#/installningar): säljarens uppgifter på fakturan.
 */
import { DEFAULT_VAT_EXEMPT_TEXT, type CompanySettings, type Store } from '../../core/index';
import { h } from '../dom';
import { canInstall, isIosBrowser, isStandalone, onInstallStateChange, promptInstall } from '../pwa';
import { backupSection } from './backup-section';
import {
  checkboxField,
  type FieldErrors,
  formatPostalCode,
  isValidEmail,
  isValidPostalCode,
  optional,
  readChecked,
  readText,
  showErrors,
  STORAGE_ERROR_HINT,
  textField,
} from '../form';

const ID_PREFIX = 'inst';
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
const MAX_LOGO_BYTES = 200_000;
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

/** Värdena i inställningsformuläret innan de blir CompanySettings. */
export interface SettingsInput {
  name: string;
  orgNumber: string;
  vatNumber: string;
  street: string;
  postalCode: string;
  city: string;
  email: string;
  phone: string;
  bankgiro: string;
  plusgiro: string;
  fSkatt: boolean;
  vatExempt: boolean;
  vatExemptText: string;
  paymentTermsDays: string;
  lateInterestPercent: string;
}

/** Tolkar ett heltal av siffror, t.ex. "30". Annat blir null. */
function parseWholeNumber(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}

/** Tolkar procent med komma eller punkt, t.ex. "8,5". Annat blir null. */
function parsePercent(value: string): number | null {
  return /^\d+([.,]\d+)?$/.test(value) ? Number(value.replace(',', '.')) : null;
}

/** Validerar inställningarna. Returnerar fel per fältnamn (tomt objekt om allt är rätt). */
export function validateSettings(input: SettingsInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.name) errors.name = 'Ange företagets namn.';
  if (!input.orgNumber) errors.orgNumber = 'Ange organisationsnummer.';
  if (!input.street) errors.street = 'Ange gatuadress.';
  if (!input.postalCode) errors.postalCode = 'Ange postnummer.';
  else if (!isValidPostalCode(input.postalCode)) errors.postalCode = 'Postnumret ska vara 5 siffror, t.ex. 123 45.';
  if (!input.city) errors.city = 'Ange ort.';
  if (input.email && !isValidEmail(input.email)) errors.email = 'Ange en giltig e-postadress.';
  const days = parseWholeNumber(input.paymentTermsDays);
  if (days === null || days > 365) errors.paymentTermsDays = 'Ange ett antal dagar mellan 0 och 365.';
  if (input.lateInterestPercent && parsePercent(input.lateInterestPercent) === null) {
    errors.lateInterestPercent = 'Ange räntan som ett tal, t.ex. 8 eller 8,5.';
  }
  return errors;
}

function readSettingsInput(form: HTMLFormElement): SettingsInput {
  return {
    name: readText(form, 'name'),
    orgNumber: readText(form, 'orgNumber'),
    vatNumber: readText(form, 'vatNumber'),
    street: readText(form, 'street'),
    postalCode: readText(form, 'postalCode'),
    city: readText(form, 'city'),
    email: readText(form, 'email'),
    phone: readText(form, 'phone'),
    bankgiro: readText(form, 'bankgiro'),
    plusgiro: readText(form, 'plusgiro'),
    fSkatt: readChecked(form, 'fSkatt'),
    vatExempt: readChecked(form, 'vatExempt'),
    vatExemptText: readText(form, 'vatExemptText'),
    paymentTermsDays: readText(form, 'paymentTermsDays'),
    lateInterestPercent: readText(form, 'lateInterestPercent'),
  };
}

/** Förutsätter att indata är validerad. Land saknas i formuläret och behålls från tidigare. */
function toSettings(input: SettingsInput, previous: CompanySettings | undefined, logoDataUrl: string | undefined): CompanySettings {
  return {
    name: input.name,
    orgNumber: input.orgNumber,
    vatNumber: optional(input.vatNumber),
    address: {
      street: input.street,
      postalCode: formatPostalCode(input.postalCode),
      city: input.city,
      country: previous?.address.country,
    },
    email: optional(input.email),
    phone: optional(input.phone),
    bankgiro: optional(input.bankgiro),
    plusgiro: optional(input.plusgiro),
    fSkatt: input.fSkatt,
    ...(input.vatExempt ? { vatExempt: true, vatExemptText: optional(input.vatExemptText) } : {}),
    ...(logoDataUrl !== undefined ? { logoDataUrl } : {}),
    paymentTermsDays: parseWholeNumber(input.paymentTermsDays) ?? DEFAULT_PAYMENT_TERMS_DAYS,
    lateInterestPercent: parsePercent(input.lateInterestPercent) ?? undefined,
  };
}

function formatPercent(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value).replace('.', ',');
}

export function settingsView(root: HTMLElement, store: Store, notice?: string): void {
  const s = store.getSettings();
  let logo = s?.logoDataUrl;
  const field = (spec: Parameters<typeof textField>[1]) => textField(ID_PREFIX, spec);
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  if (notice) status.append(h('p', { class: 'notice notice-ok' }, notice));

  const logoPreview = h('div', { class: 'logo-preview' });
  const logoMessage = h('p', { class: 'hint', 'aria-live': 'polite' });
  const drawLogo = () => {
    if (logo) {
      const img = document.createElement('img');
      img.src = logo;
      img.alt = 'Din logotyp';
      logoPreview.replaceChildren(img);
    } else {
      logoPreview.replaceChildren(h('span', { class: 'hint' }, 'Ingen logotyp vald.'));
    }
  };
  const logoInput = h('input', { type: 'file', id: 'inst-logo', accept: 'image/png,image/jpeg,image/svg+xml' });
  logoInput.addEventListener('change', () => {
    const file = logoInput.files?.[0];
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      logoMessage.textContent = 'Logotypen måste vara en PNG-, JPG- eller SVG-fil.';
    } else if (file.size > MAX_LOGO_BYTES) {
      logoMessage.textContent = 'Logotypen är för stor. Den får vara högst 200 kB.';
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        logo = String(reader.result);
        drawLogo();
        logoMessage.textContent = 'Spara inställningarna för att behålla logotypen.';
      };
      reader.onerror = () => {
        logoMessage.textContent = 'Filen kunde inte läsas.';
      };
      reader.readAsDataURL(file);
    }
    logoInput.value = '';
  });
  const removeLogo = h(
    'button',
    {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => {
        logo = undefined;
        drawLogo();
        logoMessage.textContent = 'Spara inställningarna för att ta bort logotypen.';
      },
    },
    'Ta bort logotyp',
  );
  const logoFieldset = () =>
    h(
      'fieldset',
      {},
      h('legend', {}, 'Logotyp'),
      h('div', { class: 'field' }, h('label', { for: 'inst-logo' }, 'Ladda upp logotyp (PNG, JPG eller SVG, högst 200 kB)'), logoInput),
      logoPreview,
      h('div', { class: 'form-actions' }, removeLogo),
      logoMessage,
    );
  drawLogo();

  const form = h(
    'form',
    { novalidate: true, class: 'form' },
    h(
      'fieldset',
      {},
      h('legend', {}, 'Företag'),
      field({ name: 'name', label: 'Företagsnamn', value: s?.name, required: true, autocomplete: 'organization' }),
      field({ name: 'orgNumber', label: 'Org.nr', value: s?.orgNumber, required: true, hint: 'T.ex. 556000-0000' }),
      field({ name: 'vatNumber', label: 'Momsregistreringsnummer', value: s?.vatNumber, hint: 'T.ex. SE556000000001' }),
      checkboxField(ID_PREFIX, 'fSkatt', 'Godkänd för F-skatt', s?.fSkatt ?? false),
      checkboxField(ID_PREFIX, 'vatExempt', 'Mitt företag är momsbefriat (omsättning under 120 000 kr/år)', s?.vatExempt ?? false),
      field({
        name: 'vatExemptText',
        label: 'Text på momsbefriade fakturor',
        value: s?.vatExemptText ?? DEFAULT_VAT_EXEMPT_TEXT,
        hint: 'Skrivs ut i stället för momsraderna. Kontrollera formuleringen med Skatteverket.',
      }),
    ),
    logoFieldset(),
    h(
      'fieldset',
      {},
      h('legend', {}, 'Adress och kontakt'),
      field({ name: 'street', label: 'Gatuadress', value: s?.address.street, required: true, autocomplete: 'street-address' }),
      field({
        name: 'postalCode',
        label: 'Postnummer',
        value: s?.address.postalCode,
        required: true,
        inputmode: 'numeric',
        autocomplete: 'postal-code',
      }),
      field({ name: 'city', label: 'Ort', value: s?.address.city, required: true, autocomplete: 'address-level2' }),
      field({ name: 'email', label: 'E-post', type: 'email', value: s?.email, autocomplete: 'email' }),
      field({ name: 'phone', label: 'Telefon', type: 'tel', value: s?.phone, autocomplete: 'tel' }),
    ),
    h(
      'fieldset',
      {},
      h('legend', {}, 'Betalning'),
      field({ name: 'bankgiro', label: 'Bankgiro', value: s?.bankgiro, inputmode: 'numeric', hint: 'T.ex. 123-4567' }),
      field({ name: 'plusgiro', label: 'Plusgiro', value: s?.plusgiro, inputmode: 'numeric' }),
      field({
        name: 'paymentTermsDays',
        label: 'Betalningsvillkor (dagar)',
        value: String(s?.paymentTermsDays ?? DEFAULT_PAYMENT_TERMS_DAYS),
        required: true,
        inputmode: 'numeric',
      }),
      field({
        name: 'lateInterestPercent',
        label: 'Dröjsmålsränta (%)',
        value: formatPercent(s?.lateInterestPercent),
        inputmode: 'decimal',
      }),
    ),
    h('p', { class: 'hint' }, 'Fält markerade med * är obligatoriska.'),
    h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn-primary' }, 'Spara inställningar')),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = readSettingsInput(form);
    if (showErrors(form, validateSettings(input))) {
      status.replaceChildren();
      return;
    }
    try {
      store.saveSettings(toSettings(input, store.getSettings(), logo));
    } catch {
      status.replaceChildren(
        h('p', { class: 'notice notice-error' }, `Kunde inte spara inställningarna. ${STORAGE_ERROR_HINT}`),
      );
      return;
    }
    status.replaceChildren(h('p', { class: 'notice notice-ok' }, '✓ Inställningarna är sparade.'));
  });

  root.replaceChildren(
    h('h1', {}, 'Inställningar'),
    h('p', {}, 'Uppgifterna skrivs ut på dina fakturor.'),
    h('section', { class: 'card' }, form),
    status,
    backupSection(store, () => settingsView(root, store, '✓ Säkerhetskopian är inläst. All data har ersatts.')),
    installSection(),
  );
}

/** Sektionen "Installera appen": knapp när webbläsaren tillåter det, och en instruktion för iPhone. */
function installSection(): HTMLElement {
  const section = h('section', { class: 'card', 'aria-labelledby': 'install-title' });
  const draw = () => {
    const children: (Node | string)[] = [h('h2', { id: 'install-title' }, 'Installera appen')];
    if (isStandalone()) {
      children.push(h('p', {}, 'Appen är installerad på den här enheten.'));
    } else if (canInstall()) {
      children.push(
        h('p', {}, 'Installera Fakturafix som en app. Den fungerar då även utan nätverk.'),
        h('button', { type: 'button', class: 'btn-primary', onclick: () => void promptInstall() }, 'Installera appen'),
      );
    } else if (isIosBrowser()) {
      children.push(h('p', {}, 'På iPhone: tryck på Dela och välj sedan "Lägg till på hemskärmen".'));
    } else {
      children.push(h('p', { class: 'hint' }, 'Din webbläsare erbjuder just nu ingen installation. Prova Chrome eller Edge på dator eller Android, eller Safari på iPhone.'));
    }
    section.replaceChildren(...children);
  };
  draw();
  const stop = onInstallStateChange(() => {
    if (section.isConnected) draw();
    else stop();
  });
  return section;
}
