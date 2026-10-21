# Konzept: Nostube-Komponenten für fremde Video-Websites

Stand: 16.10.2026. Konzept, keine Umsetzung. Befunde stammen aus dem Repository-Stand dieses Tages; mit `[Annahme]` markierte Aussagen sind nicht im Code geprüft.

## Ziel

Wer eine eigene Website oder App baut, soll Nostube-Videos einbinden können: ein einzelnes Video, den Kanal eines Creators oder eine vollständige Videoseite. Dafür gibt es heute nur das Iframe-Embed. Die Pakete `@nostube/core` und `@nostube/widgets` sollen schrittweise so geöffnet werden, dass Dritte sie ohne Kenntnis der Nostube-Interna nutzen können.

**Leitgedanke:** Die Creator-Site (`apps/site`) und das Studio (`apps/studio`) sind bereits der erste Anwendungsfall. Sie wurden aus der Web-App herausgelöst und nutzen die gemeinsamen Pakete wie ein externer Entwickler. Was die Site heute selbst baut, zeigt, was einer fremden Website fehlen würde.

## Ausgangslage

| Baustein | Stand | Hürde für Dritte |
| --- | --- | --- |
| Iframe-Embed (`embed.html?v=…`) | fertig; der Teilen-Dialog erzeugt den Code ([ShareButton](../../packages/widgets/src/components/ShareButton.tsx)); die Embed-Seite ist eine eigene React-App ([EmbedApp](../../apps/web/src/embed-react/EmbedApp.tsx)) | keine; Parameter sind nicht dokumentiert |
| `@nostube/core` | `private: true`, Version `0.0.0`, TypeScript-Quelltext ohne Build | kein npm-Paket, kein JavaScript-Build, keine Typdateien; `exports: "./*"` macht jede Datei zur öffentlichen API |
| `@nostube/widgets` | `private: true`, 16 Exportpfade einschließlich `./*` | siehe unten |

Was eine fremde App heute für den Player aus `widgets` bräuchte:

- React 19, react-router 7 und react-i18next 17 als Peer-Abhängigkeiten.
- Tailwind v4 mit `@source` auf den Quelltext von `widgets` und das Theme `theme.css`.
- i18next mit `registerWidgetTranslations`.
- Vier Provider (`EventStoreProvider`, `NostubeHostProvider`, `TooltipProvider`, `TimelineProvider`), zusammengesetzt aus einem `NostubeClient` und einer `InstanceConfig`, also der Konfiguration eines Nostube-Servers ([InstanceProviders](../../packages/widgets/src/instance-providers.tsx)).
- `VideoPlayer` erwartet `urls`, `mime` und `textTracks`, nicht ein Video-Event ([VideoPlayer](../../packages/widgets/src/player/VideoPlayer.tsx)). Die Übersetzung vom Event in Player-Props schreibt jeder Aufrufer selbst.

Die Pakete sind damit heute eine App-interne Bibliothek. Wer sie nutzt, übernimmt fast den gesamten Aufbau der Site.

## Prinzipien

1. **Die Site ist der Referenznutzer.** Jeder öffentliche Baustein muss in der Site laufen. Die Site-Tests sichern das Verhalten beim Verschieben.
2. **Regel des zweiten Nutzers.** Ein Baustein wandert nach `widgets` oder `core`, wenn er nicht site-spezifisch ist und mindestens zwei Nutzer hat: Site und Web-App, Site und Embed, oder Site und eine dokumentierte externe Nutzung. Was nur die Web-App hat, wandert erst, wenn die Site es braucht.
3. **React-freie Logik nach `core`, React-UI nach `widgets`.** Diese Trennung gilt bereits ([AGENTS.md](../../AGENTS.md)).
4. **Kleine kuratierte API statt Dateiexporte.** Öffentlich ist nur, was dokumentiert ist; alles andere bleibt intern und darf sich ändern.
5. **Billigste Stufe zuerst.** Wer nur ein Video zeigen will, braucht kein React-Paket.

## Stufenmodell

| Stufe | Zielgruppe | Angebot | Aufwand |
| --- | --- | --- | --- |
| 0. Iframe | alle, auch Baukasten- und WordPress-Seiten | Parameter des Embeds und den oEmbed-Endpunkt dokumentieren | Dokumentation |
| 1. Web Component | jede Website, jedes Framework | `<script>` plus `<nostube-video video="naddr1…">` und `<nostube-channel npub="…">`; Shadow DOM, Theming über CSS-Variablen; die erste Version darf das Iframe-Embed kapseln | mittel |
| 2. `@nostube/core` headless | Entwickler, beliebiges Framework | Videos eines Creators mit Paging laden, Events parsen, Medien-URL-Fallback, Kapitel, Transkript, Share-Links | mittel: Build, kuratierte Exporte |
| 3. React-Komponenten | React-Entwickler | `<NostubeProvider relays=…>`, `<VideoEventPlayer>`, `<VideoCard>`, `<VideoGrid>`, Hooks wie `useVideo` und `useCreatorVideos` | hoch: Entkopplung nötig |
| 4. Vorlage | wer eine fertige Site will | `apps/site` als Starter oder direkt der selbst gehostete Server | vorhanden |

Stufe 1 deckt den häufigsten Wunsch („Videos auf meiner Homepage“) am direktesten ab.

## Komponentenkatalog

### A. Doppelt gebaut: Site und Web-App lösen dasselbe getrennt

| Thema | Site | Web-App | Ziel |
| --- | --- | --- | --- |
| Event → Player | [VideoView](../../apps/site/src/VideoView.tsx) | [VideoPage](../../apps/web/src/pages/VideoPage.tsx), [EmbedApp](../../apps/web/src/embed-react/EmbedApp.tsx) | `VideoEventPlayer` in `widgets` |
| Zaps | `SiteZap.tsx` (494 Zeilen), `zap.ts` (272), `payment-targets.ts` | `ZapButton`, `ZapDialog`, `useZap` | gemeinsame Zap-Komponente |
| Likes und Reaktionen | `SiteLikes.tsx` (186) | `VideoReactionButtons`, `useReactions` | gemeinsame Reaktionsleiste |
| Melden | `SiteReport.tsx` (185) | `ReportDialog`, `useReports` | gemeinsamer Meldedialog |
| Kommentare | `Comments.tsx` (434); aus `widgets` nur `CommentInput` und `CommentSkeleton` | `components/comments/VideoComments`, `CommentItem` | gemeinsame Kommentarliste |

Der `VideoEventPlayer` hat den größten Hebel: drei Aufrufer, klar abgegrenzt, und genau die Komponente, die Dritte zuerst suchen. Zap, Likes, Melden und Kommentare bilden zusammen die Interaktionsleiste unter dem Video. Wie stark sich die Varianten von Site und Web-App im Verhalten unterscheiden, ist nicht verglichen `[Annahme: deutliche Unterschiede, etwa bei Moderation über die Mute-Liste des Creators]`.

### B. Nur in der Site, aber allgemein

| Baustein | Datei | Ziel |
| --- | --- | --- |
| Kapitelliste und Transkript | [VideoPanels](../../apps/site/src/VideoPanels.tsx) (217 Zeilen) | `widgets` |
| Weiterschauen | `use-watch-progress.ts`; die Logik liegt schon in `core/watch-progress` | Hook in `widgets` |
| „Neu seit deinem letzten Besuch“ | `last-visit.ts` | `core` |
| Zeitstempel-Links (`?t=`) | `use-seek-events.ts` | Hook in `widgets` |
| Altersfreigabe | `use-age-gate.ts`, `AgeConfirm.tsx` | `widgets` |
| Nächstes Video | `next-up.ts` | `core` |
| Video per ID oder Referenz laden | `use-video-by-id.ts`, `use-videos-by-ref.ts` | Hooks in `widgets` |
| Creator-Profil | `use-creator-profile.ts` | mit `useProfile` aus `widgets` abgleichen |
| Pfad eines Videos | `video-path.ts` | `core`, oder als `getHref`-Konvention dokumentieren |

Die Module sind klein und klar abgegrenzt. `useCreatorVideos` wurde bereits auf diesem Weg nach `widgets` verschoben.

### C. Bleibt in der Site

`SiteHome`, `HomePage` (Kuration), `SitePage` (Impressum, Datenschutz), `site-links`, `boot`, `Breadcrumb` und `SiteDonate`. Das sind Layout und Produktentscheidungen. Für Dritte sind sie Beispielcode, nicht Bibliothek.

### D. Nur in der Web-App, später

- **Playlists** (`components/playlists`, `usePlaylist*`): Vorlage für Sammlungen und Serien aus Phase 3 der [Roadmap](2026-10-16-creator-video-homepage-roadmap.md), die ausdrücklich verlangt, das bestehende Playlist-Modell zuerst zu prüfen. Wird mit Phase 3 gemeinsamer Baustein.
- **Verlauf** (`useVideoHistory`), **Shorts-Feed**, **Kommentar-Hervorhebung** (`useCommentHighlight`; passt zu „Creator-Antworten hervorheben“ in Phase 5).
- **Suche:** Die Logik liegt in `core/video-search`; eine Such-Oberfläche fehlt in `widgets`.

Nicht vorgesehen: Upload und Studio. `core` enthält zwar `video-publish` und `blossom-auth`, aber eine Video-Website braucht sie zunächst nicht.

## Voraussetzungen vor einer Veröffentlichung

| Thema | Änderung |
| --- | --- |
| Build und Versionierung | ESM-Build mit `.d.ts`, `private` entfernen, SemVer, Changelog |
| Öffentliche API | `./*` in beiden Paketen durch eine kuratierte Liste ersetzen |
| Server-Kopplung | Provider nimmt `relays`, `blossomServers` und `creator` direkt statt einer `InstanceConfig` |
| Styling | kompilierte CSS-Datei mitliefern, Theming über CSS-Variablen; Tailwind beim Nutzer ist nicht Pflicht |
| Übersetzungen | i18next optional; Englisch als Standard, Texte per Registrierung oder Prop |
| Router | react-router aus dem Player- und Kartenpfad entfernen; Links über `getHref` und `onSelect`, wie es `VideoGrid` schon macht ([GridPage](../../apps/site/src/GridPage.tsx)) |
| Bundle-Größe | viele Radix-Pakete, dashjs, hls.js; Streaming-Engines nur bei Bedarf laden |
| Server-Rendering | kein Zugriff auf `window` beim Import, damit Next.js und Astro funktionieren `[Annahme: heute nicht gegeben, nicht geprüft]` |
| Applesauce | entweder hinter der API verbergen oder ausdrücklich als Fundament dokumentieren |
| Lizenz | für beide Pakete festlegen |

## Dokumentation

- **Schnellstart in fünf Minuten**, je einer für Iframe, Web Component und React.
- **Rezepte:** ein Video einbetten, Kanalseite, eigenes Theme, Next.js und Astro, eigene Relays, Videos vom eigenen Nostube-Server.
- **Konzepte**, so kurz wie möglich: Video-Events (Kinds 21, 22, 34235, 34236), `naddr` und `nevent`, Relays, Blossom.
- **API-Referenz**, generiert aus TSDoc.
- **Playground** mit echten Videos.
- **Fehlerbehebung:** CORS, nicht erreichbare Relays, nicht abspielbare Codecs, HLS.

Die Site dient in jeder Rubrik als vollständiges Beispiel.

## Unterstützung für KI-Assistenten

- **`llms.txt`** auf der Dokumentationsseite mit Schnellstarts und API in Textform.
- **Ein Skill** (`SKILL.md`, etwa „nostube-video-embed“): wann Iframe, Web Component, `core` oder React; Minimalbeispiele je Stufe; typische Fehler; keine Video-IDs erfinden.
- **Ein lauffähiges Beispielprojekt je Stufe**, das ein Assistent kopieren kann.
- Kein eigener MCP-Server, solange es nur ums Einbetten geht. Er wird erst sinnvoll, wenn Videos per Assistent veröffentlicht werden sollen.

## Reihenfolge

1. **Dokumentation für Stufe 0:** Iframe-Parameter und oEmbed, dazu `llms.txt` und Skill. Fast kostenlos.
2. **`VideoEventPlayer` in `widgets`:** Vorher die drei Aufrufer vergleichen und die gemeinsamen Props festlegen; Site, Web-App und Embed danach darauf umstellen.
3. **Bausteine aus Katalog B verschieben:** Kapitel, Transkript, Seek-Links, Weiterschauen, Altersfreigabe. Die Site-Tests bleiben die Absicherung.
4. **Web Component (Stufe 1)** auf Basis des Embeds.
5. **`@nostube/core` veröffentlichen:** Build, kuratierte Exporte, Lizenz.
6. **Interaktionsleiste zusammenführen** (Katalog A ohne Player). Größter Umbau, entfernt die meiste Dopplung.
7. **React-Paket (Stufe 3)** erst bei konkreter Nachfrage.
8. **Playlists** mit Phase 3 der Roadmap.

Schritte 2, 3 und 6 lohnen sich auch ohne externe Nutzer, weil sie Dopplung zwischen Site und Web-App entfernen.

## Offene Entscheidungen

1. **Zielgruppe:** Betreiber von Baukasten- oder WordPress-Seiten (Schwerpunkt Stufe 0 und 1) oder Entwickler mit eigener React-App (Stufe 2 und 3)?
2. **Datenquelle:** Binden Dritte Videos über einen Nostube-Server ein (eigener oder nostu.be) oder direkt über beliebige Relays? Davon hängt ab, ob `InstanceConfig` Teil der öffentlichen API wird.
3. **Lizenz** für `core` und `widgets`.
4. **Applesauce:** sichtbar machen oder verbergen.

## Risiken

- **Öffentliche API friert Interna ein.** Ohne kuratierte Exporte wird jede Umbenennung zum Breaking Change für Dritte.
- **Zwei Varianten nach halbem Umzug.** Wer verschiebt, stellt alle Aufrufer im selben Schritt um; keine Übergangskopien.
- **Pflegeaufwand.** Veröffentlichte Pakete brauchen Versionierung, Changelog und Rückmeldung auf Fehlerberichte. Das ist laufende Arbeit, keine einmalige.
- **Datenschutz:** Komponenten wie Weiterschauen oder „Neu seit letztem Besuch“ speichern lokal. Die Dokumentation muss sagen, was gespeichert wird, damit Betreiber ihre Datenschutztexte anpassen können.
