# ESS – testovanie projektu Oh My Pi

## Čo je predmetom odovzdávky

Nových **9 testovacích funkcií** v `packages/utils/test/peek-file-errors.test.ts` rozširuje testy pomocných funkcií na čítanie začiatku a konca súborov. Táto časť nesúvisí s riešením SSH issue #12125. Produkčný kód sa nemenil a testy neboli odoslané do existujúceho PR.

Výber vychádza z pôvodného merania: bežné čítanie už malo testy, ale chýbali niektoré hranice a overenie uvoľnenia otvoreného súboru po chybe. Testy používajú skutočné dočasné súbory. Vhodné chyby vyvolávajú pomocou dočasných stubov.

## Výsledky

Základ: `main@4c6f8bb53df5bff45d3bf148ea45c79c22c60825`, Bun 1.4.4, Windows x64, samostatná vetva `ess/testing-coverage`. Pri oboch meraniach bol rovnaký produkčný kód, verzia Bun a postup spúšťania. Pribudol iba testovací súbor.

| Rozsah a metrika | Pred | Po |
| --- | ---: | ---: |
| `peek-file.ts`: pokryté riadky | 67 / 72 | 71 / 72 |
| `peek-file.ts`: pokrytie riadkov | 93,06 % | 98,61 % |
| `peek-file.ts`: pokryté funkcie | 7 / 7 (100 %) | 7 / 7 (100 %) |
| 124 načítaných súborov `packages/utils/src`: pokryté riadky | 18 290 / 23 177 | 18 293 / 23 177 |
| Rovnaký širší rozsah: pokrytie riadkov | 78,91 % | 78,93 % |
| Rovnaký širší rozsah: pokryté funkcie | 1 741 / 2 307 (75,47 %) | 1 741 / 2 307 (75,47 %) |

V cielenej sade pribudli **4 pokryté riadky a 5,56 percentuálneho bodu**. Funkcie už boli volané aj pred zmenou, preto ich percento nestúplo. Širšia sada už pokrývala zväčšenie spoločného buffera, preto v nej pribudli iba 3 pokryté riadky. Porovnanie súborov a počtu meraných riadkov kontroluje `build-report.py`; medzi širšími behmi sa zmenilo pokrytie iba v `peek-file.ts`.

Ide o pokrytie súborov načítaných pri testovaní balíka utils, **nie celého monorepozitára OMP**. Rust časť ani nenačítané TypeScript súbory nie sú zahrnuté. Z celého LCOV širšej sady sa do tabuľky sčítali len záznamy pod `packages/utils/src/`, aby sa nezmiešali s importovanými závislosťami a dočasnými testovacími súbormi. Bun tu poskytuje pokrytie riadkov a funkcií; pokrytie vetiev neuvádzam.

Zostáva nepokrytý riadok 22: vnútorný návrat pre nekladný limit v `withSyncPoolBuffer`. Jediný volajúci `peekFileSync` taký limit vybaví skôr, takže sa k vnútornému návratu cez verejné funkcie nedá dostať. Kód sa kvôli dosiahnutiu 100 % nemenil. Vysoké pokrytie samo osebe nedokazuje bezchybnosť programu.

## Čo overujú nové testy

1. **Väčší začiatok súboru:** synchronné čítanie 4 096 bajtov vráti presné dáta aj nad počiatočnou veľkosťou buffera 1 024 bajtov.
2. **Nulový synchronný limit:** pri neexistujúcej ceste vráti callback prázdne dáta a jeho výsledok sa zachová bez otvorenia súboru.
3. **Záporný asynchronný limit:** rovnaký verejný kontrakt pre samostatnú asynchronnú implementáciu.
4. **Prázdny súbor:** čítanie konca vráti prázdne dáta a otvorený súbor sa zatvorí.
5. **Chyba synchronného čítania:** chyba sa dostane k volajúcemu a deskriptor je zatvorený.
6. **Chyba asynchronného čítania:** zachová sa pôvodný objekt chyby a handle je zatvorený.
7. **Chyba spracovania začiatku:** callback dostane skutočné dáta, vyhodí chybu a súbor sa napriek tomu zatvorí.
8. **Chyba získania informácií o súbore:** zlyhanie `stat` pri čítaní konca sa prenesie k volajúcemu a súbor sa zatvorí.
9. **Chyba spracovania oboch koncov:** callback dostane správny začiatok aj koniec, vyhodí chybu a spoločný handle sa zatvorí.

Test double: `vi.spyOn(...).mockRejectedValueOnce(...)` alebo `mockImplementationOnce(...)` slúži ako **stub** konkrétnej operácie. `fs.promises.open` v príslušnom teste vráti vopred otvorený skutočný handle. Zatvorenie sa potom overí skutočným `stat`/`fstatSync`, ktorý musí zlyhať s `EBADF`; nestačí len počítať volania `close`. Každý test má vlastný priečinok a `afterEach` obnoví všetky stuby. Nepoužíva sa globálny `mock.module`.

## Overenie a obmedzenia širšej sady

| Beh | Úspešné | Zlyhané | Preskočené |
| --- | ---: | ---: | ---: |
| Pôvodná cielená sada | 13 | 0 | 0 |
| Rozšírená cielená sada | 22 | 0 | 0 |
| Širšia sada utils pred | 902 | 2 | 38 |
| Širšia sada utils po | 911 | 2 | 38 |

`bun run check` v `packages/utils` prešiel: lint, formátovanie a TypeScript kontrola; bez varovaní. V nových testoch nebol žiadny preskočený prípad a nepribudlo zlyhanie širšej sady.

Dve rovnaké zlyhania už existovali pred pridaním testov:

- `browsers.test.ts`: test očakáva skutočný symlink z archívu; `readlink` na Windows v tomto prostredí vracia `EINVAL`.
- `dirs.test.ts`: porovnávajú sa dva zápisy toho istého dočasného priečinka (`Dávid Tkáč` a krátky názov `DVIDTK~1`).

38 pôvodných preskočení pochádza z podmienok existujúcich testov pre iné platformy a voliteľné sieťové testy. Počty a názvy sú zachované v úplných logoch. Širšiu sadu preto neoznačujem ako celú úspešnú. Tieto nesúvisiace prípady sa v tejto odovzdávke neupravovali.

## Ako meranie zopakovať

Potrebný je checkout uvedeného commitu, nainštalované závislosti cez `bun install --frozen-lockfile` a natívny modul zodpovedajúci verzii 18.13.3 pre širšie testy. Tu sa použil oficiálny Windows x64 baseline modul; pri ňom treba nastaviť `$env:PI_NATIVE_VARIANT='baseline'`. Na Windows spúšťajte skutočný `bun.exe` alebo ho dajte prvý do PATH; `.cmd` spúšťač spôsoboval chyby pôvodných testov vytvárajúcich podprocesy.

Pred pridaním nového testovacieho súboru spustite z koreňa repozitára:

```powershell
bun test --coverage --coverage-reporter=text --coverage-reporter=lcov --coverage-dir=../ess-testing-coverage/before-focused packages/utils/test/peek-file.test.ts
bun test --coverage --coverage-reporter=text --coverage-reporter=lcov --coverage-dir=../ess-testing-coverage/before-package packages/utils/test
```

Potom skopírujte priložený `packages/utils/test/peek-file-errors.test.ts` na rovnakú cestu v repozitári a spustite:

```powershell
bun test --coverage --coverage-reporter=text --coverage-reporter=lcov --coverage-dir=../ess-testing-coverage/after-focused packages/utils/test/peek-file.test.ts packages/utils/test/peek-file-errors.test.ts
bun test --coverage --coverage-reporter=text --coverage-reporter=lcov --coverage-dir=../ess-testing-coverage/after-package packages/utils/test
```

Prvé porovnanie vždy hodnotí ten istý produkčný súbor `peek-file.ts`, aj keď nové testy navyše importujú pomocnú triedu `TempDir`; hodnoty „All files“ cielených behov preto nie sú priamo porovnateľné. Druhé porovnanie sčítava totožných 124 zdrojových súborov utils.

Overenie štýlu a typov spustíte cez `bun run --cwd packages/utils check`. `python build-report.py` v priečinku odovzdávky prepočíta metriky z uložených LCOV a vytvorí obrázok (vyžaduje Pillow a font Segoe UI na Windows). Obrázok je grafický prehľad skutočných meraní, nie screenshot terminálu; úplný pôvodný výstup je v priložených `.txt` súboroch.

## Zdroje

- [Dokumentácia Bun: meranie pokrytia a LCOV](https://bun.sh/docs/test/code-coverage).
- [Bullseye: význam jednotlivých metrík a obmedzenia pokrytia](https://www.bullseye.com/coverage.html).
