#!/usr/bin/env node
/**
 * Skickar en uppgift till Gemini och skriver svaret till stdout.
 *
 * Användning:
 *   npm run gemini -- "Granska den här koden" --file src/core/index.ts
 *   echo "Förklara Luhn-algoritmen" | npm run gemini
 *
 * Kör alltid via `npm run gemini` (den sätter --use-env-proxy så att Node går
 * via molnmiljöns nätverksproxy, annars injiceras ingen nyckel).
 *
 * Flaggor:
 *   --file <sökväg>   Bifoga en fil (kan upprepas)
 *   --model <namn>    Modell (standard: gemini-2.5-flash)
 *   --system <text>   Systeminstruktion
 *
 * Nyckeln: i Claude-molnmiljön injiceras nyckeln automatiskt av nätverksproxyn.
 * Lokalt sätter du GEMINI_API_KEY. Lägg ALDRIG nyckeln i repot.
 *
 * Skicka aldrig riktiga kund- eller fakturauppgifter till Gemini (gratisnivån
 * kan användas för att träna Googles modeller). Bara kod och påhittade testdata.
 */
import { readFileSync } from 'node:fs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function parseArgs(argv) {
  const opts = { files: [], model: 'gemini-2.5-flash', system: undefined, prompt: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file') opts.files.push(argv[++i]);
    else if (arg === '--model') opts.model = argv[++i];
    else if (arg === '--system') opts.system = argv[++i];
    else opts.prompt.push(arg);
  }
  return opts;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const opts = parseArgs(process.argv.slice(2));
let prompt = opts.prompt.join(' ').trim();
const stdin = (await readStdin()).trim();
if (stdin) prompt = prompt ? `${prompt}\n\n${stdin}` : stdin;
for (const file of opts.files) {
  prompt += `\n\n--- ${file} ---\n${readFileSync(file, 'utf8')}`;
}
if (!prompt) {
  console.error('Ingen uppgift angiven. Se kommentaren i tools/gemini.mjs.');
  process.exit(2);
}

const messages = [];
if (opts.system) messages.push({ role: 'system', content: opts.system });
messages.push({ role: 'user', content: prompt });

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // I molnmiljön ersätter proxyn detta värde med den sparade nyckeln.
    Authorization: `Bearer ${process.env.GEMINI_API_KEY ?? 'proxy-injected'}`,
  },
  body: JSON.stringify({ model: opts.model, messages }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`Gemini svarade ${res.status}: ${body}`);
  process.exit(1);
}
const data = JSON.parse(body);
console.log(data.choices?.[0]?.message?.content ?? '');
