import { afterEach, describe, expect, it, vi } from 'vitest';
import { canInstall, isIosBrowser, listenForInstallPrompt, promptInstall, registerServiceWorker, showUpdateBanner } from './pwa';
import { createMemoryStore } from './test-utils';
import { settingsView } from './views/settings';

describe('pwa', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('känner igen iPhone och iPad', () => {
    expect(isIosBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosBrowser('Mozilla/5.0 (X11; Linux x86_64) Chrome/120')).toBe(false);
  });

  it('registrerar inte service workern i test och utan stöd', () => {
    expect(() => registerServiceWorker()).not.toThrow();
  });

  it('uppdateringsbannern ber den nya versionen ta över och laddar om', () => {
    const listeners: Record<string, () => void> = {};
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { addEventListener: (type: string, fn: () => void) => (listeners[type] = fn) },
    });
    const worker = { postMessage: vi.fn() } as unknown as ServiceWorker;
    const reload = vi.fn();
    const banner = showUpdateBanner(worker, reload);
    expect(banner.textContent).toContain('Ny version finns');
    banner.querySelector('button')?.click();
    expect(worker.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
    listeners.controllerchange?.();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('visar Installera appen i Inställningar när webbläsaren erbjuder det', async () => {
    listenForInstallPrompt();
    const root = document.createElement('div');
    document.body.append(root);
    settingsView(root, createMemoryStore());
    const installButton = () => [...root.querySelectorAll('button')].find((b) => b.textContent === 'Installera appen');
    expect(installButton()).toBeUndefined();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(canInstall()).toBe(true);
    const button = installButton();
    expect(button).toBeDefined();
    button?.click();
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await promptInstall();
    expect(canInstall()).toBe(false);
  });
});
