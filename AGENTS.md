# AGENTS.md: läs detta först

Det här dokumentet gäller för **alla** AI-agenter som arbetar i Fakturafix (Claude-agenter, Codex och Gemini).
Läs hela filen innan du börjar på en issue.

## Om produkten

Fakturafix är en enkel faktureringsapp för svenska frilansare och enskilda firmor.
Version 1 är en webbapp som körs helt i webbläsaren. All data sparas lokalt (localStorage) och det finns ingen server.

MVP:
1. Kundregister
2. Skapa faktura: rader, moms 25/12/6/0 %, förfallodatum, OCR-nummer
3. PDF-export med svensk standardlayout (bankgiro, F-skatt, org.nr)
4. Översikt: obetalda, betalda och förfallna fakturor

## Organisation

| Roll | Vem | Äger mappar |
|---|---|---|
| Ägare och styrelse | Människan | Godkänner och slår ihop alla PR:er till `main` |
| VD | Claude (orkestrerande session) | `AGENTS.md`, `README.md`, `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `tools/`, kontraktet i `src/core/types.ts` och signaturerna i `src/core/index.ts` |
| Utvecklare 1 | Claude-agent | `src/core/**` (implementation) |
| Utvecklare 2 | Claude-agent | `src/ui/**` |
| QA | Claude-agent | `tests/**`, `.github/workflows/**`, granskning av PR:er |
| Codex (ChatGPT) | Via GitHub (`@codex`) | `src/print/**` och extern kodgranskning av PR:er |
| Gemini | Via `npm run gemini` | Rådgivare och granskare. Skriver inte direkt i repot |

## Regler

1. **En issue per agent åt gången.** Börja inte på något du inte har blivit tilldelad.
2. **Rör bara filer i dina egna mappar.** Behöver du ändra något utanför dem skriver du en kommentar i din issue och väntar på VD.
3. **Kontraktet är låst.** Typerna i `src/core/types.ts` och funktionssignaturerna i `src/core/index.ts` får bara ändras efter VD:s godkännande.
   Utvecklare 1 får ersätta stubbarnas *innehåll*, men inte deras signaturer.
4. **Ingen slår ihop sin egen kod.** Pusha aldrig till `main`, slå aldrig ihop PR:er och force-pusha aldrig till någon annans branch.
5. **Inga nya beroenden** (`npm install <paket>`) utan VD:s godkännande. Fråga i din issue.
6. **Inga hemligheter i repot.** Inga API-nycklar, tokens eller `.env`-filer.
7. **Inga riktiga personuppgifter.** Testdata ska vara påhittad, till exempel "Testkund AB, 556000-0000".

## Arbetsflöde

1. Läs din issue och den här filen.
2. Skapa en branch från `main` med namnet `<roll>/<issue-nr>-<kort-beskrivning>`, till exempel `dev1/2-moms-och-ocr` eller `qa/5-ci`.
   *Undantag just nu:* tills PR:en med grundstrukturen är ihopslagen utgår du från branchen `grund/projektstruktur` i stället för `main`.
3. Gör små, tydliga commits.
4. Kör alla kontroller innan du pushar. Alla måste gå igenom:
   ```bash
   npm run typecheck && npm test && npm run build
   ```
5. Pusha och öppna en PR mot `main`. Beskrivningen ska innehålla `Closes #<issue>`, vad du har gjort, hur det är testat och eventuella frågor.
6. QA granskar PR:en. Åtgärda synpunkterna på samma branch.
7. Ägaren slår ihop PR:en. Rapportera sedan till VD och vänta på nästa issue.

## Kodstil

- **TypeScript strict** med `noUncheckedIndexedAccess`. Använd inte `any`. Använd `unknown` och smalna av typen i stället.
- **Engelska identifierare** i koden (`calculateTotals`, `customer`). **Svenska** i användargränssnittet, kommentarer, commit-meddelanden, issues och PR:er.
- **Belopp i öre som heltal.** Räkna aldrig med flyttal i kronor. Formatera bara vid visning (`formatSek`).
  - **Avrundning:** till närmaste öre, där halva ören avrundas bort från noll (0,5 blir 1 och −0,5 blir −1). Detsamma gäller öresavrundningen till hela kronor.
  - **Format:** `formatSek(123450)` ger `"1 234,50 kr"` och negativa belopp skrivs `"-0,25 kr"`. Tusentalsavgränsaren är ett vanligt mellanslag.
- **Fel vid ogiltig indata:** kärnfunktioner som `addDays` och `createOcr` kastar fel vid ogiltig indata. Gränssnittet validerar indata innan det anropar dem.
- **Datum som `YYYY-MM-DD`-strängar.** Använd hjälpfunktionerna i `src/core`.
- **Inget ramverk.** Gränssnittet är vanlig TypeScript och DOM. Bygg element med `h()` från `src/ui/dom.ts`.
- **Kärnan är ren.** `src/core` får inte röra DOM:en, förutom att `createLocalStore` tar emot ett `Storage`-objekt.
- **Gränssnittet importerar bara från `src/core/index.ts`**, aldrig från enskilda filer i `src/core`.
- **Tester ligger bredvid koden** (`foo.ts` och `foo.test.ts`). Acceptanstester ligger i `tests/`.
- Små funktioner, beskrivande namn och inga utkommenterade kodblock.

## Mappstruktur

```
index.html            Startsida för Vite
src/
  main.ts             Startpunkt
  core/               Affärslogik: moms, OCR, datum, lagring (Utvecklare 1)
    types.ts          Datakontrakt (låst)
    index.ts          Kärnans publika API (signaturerna är låsta)
  ui/                 Gränssnitt (Utvecklare 2)
    app.ts            Navigering och routing
    dom.ts            h()-hjälparen
    views/            En fil per vy
    styles.css
tests/                Acceptanstester (QA)
tools/gemini.mjs      Skickar uppgifter till Gemini (VD)
.github/workflows/    CI (QA)
```

## Svenska fakturaregler (sammanfattning)

- **Momssatser:** 25 % (standard), 12 % (livsmedel, hotell), 6 % (böcker, persontransport, kultur) och 0 % (momsfritt eller export).
- **En faktura ska innehålla:** fakturadatum, ett unikt löpnummer, säljarens momsregistreringsnummer (om det finns), köparens namn och adress, en beskrivning av varor och tjänster, belopp exklusive moms per momssats, momsbelopp per sats och totalbelopp. Den ska också innehålla säljarens org.nr och texten "Godkänd för F-skatt" när det gäller.
- **Löpnummer:** fakturanumren ska bilda en obruten serie och får aldrig återanvändas. En utfärdad faktura (status skild från `draft`) får aldrig raderas. Den rättas med en kreditfaktura.
- **Öresavrundning:** totalen avrundas till hela kronor och avrundningen visas som en egen rad.
- **OCR-nummer:** fakturanumret följt av en **längdsiffra** (totala längden inklusive båda kontrollsiffrorna, modulo 10) och en **Luhn-kontrollsiffra** (modulo 10) beräknad över allt det föregående. Exempel: fakturanummer `1001` ger `100164`.

## Codex

Codex är kopplat till GitHub via ägarens ChatGPT-konto. Det finns ingen API-nyckel.
- **Granskning:** VD skriver `@codex review` i en PR. Codex granskar som en andra granskare vid sidan av QA. QA:s godkännande krävs fortfarande.
- **Utveckling:** VD delar ut uppgifter till Codex med `@codex` och en hänvisning till en issue. Samma regler gäller som för alla andra: en issue åt gången, bara egna mappar, aldrig merge och PR mot `main`.
- **Branchnamn för Codex:** `codex/<issue-nr>-<kort-beskrivning>`.

## Gemini

Gemini nås via `npm run gemini -- "<uppgift>" --file <sökväg>`. Använd det för en andra åsikt, kodgranskning eller research.
Skicka **aldrig** riktiga kund- eller fakturauppgifter till Gemini, eftersom gratisnivån kan användas för att träna Googles modeller.
Granska alltid Geminis svar själv innan du använder det.
