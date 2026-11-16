# Acceptanstester

Här lägger QA tester som går mot kärnans publika API (`src/core/index.ts`).
Enhetstester ligger bredvid koden i `src/`.

- `acceptance/vat.test.ts`: radbelopp, moms per sats och öresavrundning
- `acceptance/ocr.test.ts`: OCR-nummer (längdsiffra + Luhn)
- `acceptance/dates.test.ts`: datum och fakturastatus
- `acceptance/money.test.ts`: `formatSek` och `parseSek`
- `acceptance/storage.test.ts`: lagring, fakturanummer och trasig JSON

Testerna bygger på specifikationen i `AGENTS.md` och issue #3, inte på någon implementation.
Förväntade värden är uträknade för hand. All testdata är påhittad.

Testerna typkontrolleras av `npm run typecheck`.
