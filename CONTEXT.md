# Code Context

## Files Retrieved
1. `src/components/settings/GeneralSettingsSection.tsx` (lines 24-350) - zentrale UI für General Settings inkl. neuem YouTube-Content-Toggle, NSFW-Filter, Qualität.
2. `src/pages/settings/GeneralSettingsPage.tsx` (lines 1-5) - Page ist nur ein Wrapper um `GeneralSettingsSection`.
3. `src/pages/settings/SettingsLayout.tsx` (lines 13-95) - Settings-Navigation/Tabs, mobile horizontale Scroll-Leiste, Container-Breite/Spacing.
4. `src/contexts/AppContext.ts` (lines 49-76) - `AppConfig`-Schema mit `showYouTubeContent`, `nsfwFilter`, `preferredQuality`, `hoverPreview`.
5. `src/components/AppProvider.tsx` (lines 19-40, 49-54) - Persistenz via localStorage + Migration Defaults (YouTube true).
6. `src/App.tsx` (lines 35-43, 110-126) - globale Defaults + NSFW Trust-Gate Erzwingung (`hide` bei low/no score).
7. `src/nostr/useInfiniteTimeline.ts` (lines 236-258) - Datenfluss: `config.showYouTubeContent` wird an `processEvents` durchgereicht.
8. `src/utils/video-event.ts` (lines 351-374) - tatsächliche Filterlogik: `includeYouTube || !isYouTubeVideo(video)`.
9. `src/components/ui/switch.tsx` (lines 10-21) - Switch-Größe (`h-6 w-11`) relevant für Touch-Target.
10. `src/components/ui/radio-group.tsx` (lines 20-31) - Radio-Item-Größe (`h-4 w-4`) sehr klein.
11. `src/components/ui/button-variants.ts` (lines 15-20) - `size="sm"` ist `h-9` (36px), relevant für mobile Tabs.
12. `src/i18n/locales/en.json` (lines 523-540) - i18n-Status: Content-Filter/YouTube vorhanden, aber keine Keys für Preferred-Quality-Texte.
13. `src/components/VideoCard.tsx` (lines 72-73) - `hoverPreview` derzeit hart deaktiviert (`false`) trotz Config/i18n-Feldern.
14. `src/hooks/useAppContext.ts` (full file) - faktischer “UseSettings”-Zugriff: kein separates `useSettings`, sondern `useAppContext`.

## Key Code
- **Kein dediziertes `useSettings`-Hook**: Settings laufen über `useAppContext()` (`src/hooks/useAppContext.ts`).
- **State-Modell**: `AppConfig.showYouTubeContent?: boolean` (`src/contexts/AppContext.ts:64-65`).
- **Default/Migration**:
  - App-Default: `showYouTubeContent: true` (`src/App.tsx:35-43`).
  - Migration alter LocalStorage-Werte: setzt `true`, wenn undefiniert (`src/components/AppProvider.tsx:32-40`).
- **UI-Toggle**: YouTube-Switch in Content-Filters (`src/components/settings/GeneralSettingsSection.tsx:173-189`).
- **Wirksamer Filter**:
  - Übergabe in Timeline-Verarbeitung (`src/nostr/useInfiniteTimeline.ts:238-247`).
  - Filterung selbst (`src/utils/video-event.ts:362-371`).
- **NSFW-Sonderfall**:
  - UI-Lock mit Hinweis (`src/components/settings/GeneralSettingsSection.tsx:191-236`).
  - Zusätzlich harte globale Erzwingung im App-Layer (`src/App.tsx:110-126`).

## Architecture
- **Layer 1 (Config/Persistenz):** `AppProvider` hält `config` in LocalStorage, `updateConfig` als zentrale Mutation.
- **Layer 2 (Settings-UI):** `GeneralSettingsSection` liest/schreibt `config` über `useAppContext`.
- **Layer 3 (Domain/Feed-Processing):** Hooks wie `useInfiniteTimeline` nutzen Config-Werte und reichen sie an `processEvents`.
- **Layer 4 (Filterentscheid):** `processEvents` entscheidet final, ob YouTube-Videos in Ergebnislisten landen.

## Ist-Zustand (UI/Toggle + Mobile)
- General Settings sind vertikal segmentiert (`divide-y`, Abschnittsblöcke), funktional klar.
- Neuer YouTube-Filter ist als einzelnes Card-Row-Toggle in „Content Filters“ platziert.
- NSFW ist im selben Abschnitt, aber anderes Interaktionsmuster (Radio statt Switch).
- Mobile Navigation für Settings nutzt horizontales Scroll-Tabband (`SettingsLayout`), aber Buttons sind `size="sm"` (36px Höhe).
- Toggle/Selection Targets:
  - Switch: 24px hoch (`h-6`), Label klickbar, aber ganze Zeile nicht als ein großer Touch-Target verdrahtet.
  - Radio-Controls: 16px (`h-4 w-4`), visuell/physisch klein; Label hilft, aber Trefferfläche bleibt inkonsistent.

## Inkonsistenzen
1. **UseSettings-Begriff vs. Realität:** kein `useSettings`, sondern `useAppContext` als globales Config-Hook.
2. **Interaktionsmuster gemischt im gleichen Kontext:** YouTube via Switch-Card, NSFW via Radio-Liste ohne gleiches „Setting Row“-Pattern.
3. **Mobile Touch-Targets grenzwertig:** Tabs (36px), Switch (24px), Radios (16px) unter häufigen 44px-Empfehlungen.
4. **Teilweise unvollständige i18n für General Settings:** Preferred-Quality-Strings fehlen in Locale-Dateien (UI nutzt `defaultValue` Fallbacks).
5. **Config-/UI-Drift:** `hoverPreview` existiert in Config + i18n, aber Feature ist in `VideoCard` hart deaktiviert.

## 2-3 konkrete Redesign-Optionen (mit Trade-offs)
1. **Option A: Einheitliche „Setting Row“-Komponente für alle booleans + Auswahlkarten**
   - Idee: Jede Einstellung als große tappbare Zeile (Label+Description links, Control rechts), inkl. YouTube und ggf. NSFW als segmented card.
   - Vorteil: konsistente UX, bessere mobile Bedienung, weniger visuelle Brüche.
   - Nachteil: etwas Refactor-Aufwand (GeneralSection + evtl. Shared-Component).

2. **Option B: Mobile-first Dichte reduzieren + Touch-Targets anheben**
   - Idee: `sm`-Tabs auf mindestens 44px Höhe, Radio/Switch-Zeilen mit `min-h-11/12`, ganze Zeile klickbar.
   - Vorteil: schnelle UX-Verbesserung ohne großes Informations-Redesign.
   - Nachteil: löst nicht alle semantischen Inkonsistenzen (Switch vs Radio-Struktur bleibt).

3. **Option C: Content-Filters als eigenständiger Unterblock mit klarer Hierarchie**
   - Idee: eigener Sub-Abschnitt „Sichtbarkeit & Sicherheit“: YouTube (switch), NSFW (radio), später Hover Preview dort integrierbar.
   - Vorteil: bessere Gruppierung, skaliert für weitere Filter.
   - Nachteil: mehr Navigations-/Layout-Entscheidungen (evtl. zusätzliche Seite/Accordion nötig).

## Kleine empfohlene Umsetzungsreihenfolge (ohne Codeänderungen)
1. **Zielbild festlegen:** Option A+B kombiniert als Standard (Konsistenz + Touch-Targets).
2. **UX-Definition:** verbindliche Mobile-Minima festlegen (44px target, row-click behavior, spacing).
3. **Struktur entscheiden:** Content-Filter in klaren Subblock ziehen (Option C light, innerhalb General Seite).
4. **Aufräumliste vor Implementierung:** i18n-Keys für Preferred Quality ergänzen; entscheiden, ob `hoverPreview` reaktiviert, entfernt oder als „coming soon“ markiert wird.
5. **Dann erst Umsetzung in kleinen Schritten:** (a) Tab/Row-Touchgrößen, (b) einheitliche Setting Rows, (c) NSFW/YouTube Harmonisierung.

## Start Here
`src/components/settings/GeneralSettingsSection.tsx` zuerst öffnen: dort liegen fast alle relevanten Entscheidungen zu Toggle-UI, Gruppierung und aktuellem YouTube-Filter-Verhalten.