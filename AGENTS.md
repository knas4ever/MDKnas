# MDKnas — agent guide

## Release process
- Versionsnummer er build-datoen i formatet `ÅÅÅÅ.M.D` (f.eks. `2026.9.22`) i `package.json`
- Ved udgivelse: opdatér `version`, tilføj et afsnit til `CHANGELOG.md`
  (sektioner `### Features` og `### Fixes`), kør `npm run dist`, commit + push

## Commands
- `npm run dev` — Vite HMR + Electron (dev-tilstand)
- `npm test` — vitest unit-tests
- `npm run lint` — tsc --noEmit
- `npm run e2e` — build + Playwright (driver Electron via `_electron`)
- `npm run dist` — build + AppImage/deb (electron-builder)

## Architecture
- Markdown-kilden er den eneste kilde til sandhed: hver edit producerer en
  ny `content`-string + `selection`, derefter `onChange`. Rediger aldrig DOM
  direkte for indhold.
- `src/lib/markdown.ts` — renderer markdown → HTML med source-offset spans
  (`data-s`/`data-e` + gap spans) til caret-mapping.
- `src/lib/editorActions.ts` — pure tekst-transformationer (bold, lists,
  tables, `tableOperation` osv.).
- E2e-tests ligger i `e2e/`, unit-tests i `tests/unit/`.
- Nogle e2e-tests er kendt flaky (bekræft med `git stash`-baseline, før
  antages en regression).
