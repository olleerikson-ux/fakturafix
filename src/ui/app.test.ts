import { afterEach, describe, expect, it } from 'vitest';
import { startApp } from './app';
import { createMemoryStore } from './test-utils';

describe('startApp', () => {
  afterEach(() => {
    location.hash = '';
  });

  it('ritar navigering och startvyn', () => {
    const root = document.createElement('div');
    startApp(root, createMemoryStore());
    expect(root.querySelector('nav')?.textContent).toContain('Kunder');
    expect(root.querySelector('main h1')?.textContent).toBe('Översikt');
  });

  it('visar kundvyn på #/kunder', () => {
    location.hash = '#/kunder';
    const root = document.createElement('div');
    startApp(root, createMemoryStore());
    expect(root.querySelector('main h1')?.textContent).toBe('Kunder');
  });

  it('visar inställningsvyn på #/installningar', () => {
    location.hash = '#/installningar';
    const root = document.createElement('div');
    startApp(root, createMemoryStore());
    expect(root.querySelector('main h1')?.textContent).toBe('Inställningar');
  });

  it('visar fakturaformuläret på #/fakturor/<id>', () => {
    location.hash = '#/fakturor/finns-inte';
    const root = document.createElement('div');
    startApp(root, createMemoryStore());
    expect(root.querySelector('main')?.textContent).toContain('Fakturan finns inte');
  });
});
