/** Installerbar app och offline: registrering av service worker, uppdateringsbanner och installationsknapp. */
import { h } from './dom';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: BeforeInstallPromptEvent | undefined;
const installListeners = new Set<() => void>();

/** Börjar lyssna på beforeinstallprompt. Anropas tidigt, eftersom händelsen kan komma före Inställningar. */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    for (const listener of installListeners) listener();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = undefined;
    for (const listener of installListeners) listener();
  });
}

export function onInstallStateChange(listener: () => void): () => void {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}

export function canInstall(): boolean {
  return installPrompt !== undefined;
}

export async function promptInstall(): Promise<void> {
  const prompt = installPrompt;
  if (!prompt) return;
  await prompt.prompt();
  await prompt.userChoice;
  installPrompt = undefined;
  for (const listener of installListeners) listener();
}

/** Sant på iPhone och iPad i Safari, där installationen sker via Dela-menyn. */
export function isIosBrowser(userAgent: string = navigator.userAgent): boolean {
  return /iPhone|iPad|iPod/.test(userAgent);
}

export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** Diskret banner när en ny version väntar. Knappen byter version och laddar om. */
export function showUpdateBanner(worker: ServiceWorker, reload: () => void = () => window.location.reload()): HTMLElement {
  const banner = h(
    'div',
    { class: 'update-banner', role: 'status' },
    h('span', {}, 'Ny version finns – '),
    h(
      'button',
      {
        type: 'button',
        class: 'btn-secondary',
        onclick: () => {
          navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
          worker.postMessage('SKIP_WAITING');
        },
      },
      'ladda om',
    ),
  );
  document.body.append(banner);
  return banner;
}

/** Registrerar service workern. Bara i produktion och bara om webbläsaren stödjer det. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: `${base}app/` })
    .then((registration) => {
      const notify = (worker: ServiceWorker | null) => {
        if (worker && navigator.serviceWorker.controller) showUpdateBanner(worker);
      };
      notify(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed') notify(installing);
        });
      });
    })
    .catch(() => {
      // Appen fungerar som vanligt utan offlinestöd om registreringen misslyckas.
    });
}
