# MDKnas — agent guide

## Release process
- Versionsnummer er build-datoen plus et løbende nummer for dagen, `ÅÅÅÅ.M.D-N` (f.eks. `2026.12.1-1`, næste samme dag `2026.12.1-2`) i `package.json`. (Semver tillader ikke foranstillede nuller, så `-1` og ikke `-001`.) GitHub-tagget er `vÅÅÅÅ.M.D.N` (punktum, ikke bindestreg): AppImage og exe fra 2026.11.19–2026.11.25 splitter tagget kun på `.`, så `v2026.11.26-1` bliver læst som `2026.11.0` og ser ældre ud. Store-pakken bliver `ÅÅÅÅ.M.D.0`, så to udgivelser samme dag deler Store-versionen.
- Ved udgivelse: opdatér `version` i `package.json`, `src-tauri/Cargo.toml`
  og `src-tauri/tauri.conf.json`, tilføj et afsnit til `CHANGELOG.md`
  (sektioner `### Features` og `### Fixes`), commit + push til `master`.
  GitHub Actions (`release.yml`) bygger Linux (AppImage/deb) og Windows
  (exe + usigneret MSIX til Microsoft Store) og laver en GitHub-release.
- `CHANGELOG.md` indlejres i appen (`include_str!` i `src-tauri/src/main.rs`)
  og vises i Help → About — den skal altid være opdateret med hver udgivelse.

## Commands
- `npm run dev` — Tauri + Vite HMR (dev-tilstand)
- `npm test` — vitest unit-tests
- `npm run lint` — tsc --noEmit
- `npm run dist` — Tauri AppImage/deb (Linux)
- `npm run dist:win` — Tauri Windows exe i `src-tauri\target\release`
- Rust kræver `%USERPROFILE%\.cargo\bin` i PATH; lokale Rust-builds er
  blokeret på Hi3G-pc'en — byg i GitHub Actions i stedet.
- Electron-versionen er bevaret i git-tagget `electron-final`.

## Architecture
- Markdown-kilden er den eneste kilde til sandhed: hver edit producerer en
  ny `content`-string + `selection`, derefter `onChange`. Rediger aldrig DOM
  direkte for indhold.
- `src/lib/markdown.ts` — renderer markdown → HTML med source-offset spans
  (`data-s`/`data-e` + gap spans) til caret-mapping.
- `src/lib/editorActions.ts` — pure tekst-transformationer (bold, lists,
  tables, `tableOperation` osv.).
- Unit-tests ligger i `tests/unit/`. Rust-backend i `src-tauri/`, bro til
  renderer i `src/tauriApi.ts` (`window.api`). Spell check er WebView2's/
  WebKitGTK's egen; sprog følger OS-indstillinger (ingen Spelling-menu).
