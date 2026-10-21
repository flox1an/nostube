# Roadmap: die persönliche Nostube-Video-Homepage

**Datum:** 2026-10-16  
**Status:** Roadmap vorgeschlagen; Kurationsteil aus Phase 1 und der erste Teil von Phase 2 (Weiterschauen, Kapitel, Transkript, Videoende, Fehlerwiederholung) umgesetzt und auf der Testinstanz abgenommen. Weitere Phasen bleiben geplant; keine Terminzusage.
**Schwerpunkt:** Öffentliches Creator-Frontend in `apps/site`, mit durchgängiger Studio-Bedienung, notwendigen Server-Erweiterungen und Anschluss an die globale Nostube-App.

## Umsetzungsstand

Der erste Kurationsteil ist umgesetzt: Intro, auswählbares Einstiegs-Video mit Einordnung, geordnete ausgewählte Arbeiten, bis zu fünf benannte HTTPS-Links und eine Hauptaktion. Bearbeitung und Vorschau liegen im Studio unter Erscheinungsbild. Der Server speichert die Daten dauerhaft und wendet reine Darstellungsänderungen ohne Neustart an. Unbekannte und ausgeblendete Videos erscheinen nicht öffentlich; Vorschaubilder und Einordnung eines gewarnten Einstiegs-Videos bleiben hinter der Altersfreigabe.

Lokal geprüft wurden die öffentliche Desktop-/Mobile-Oberfläche, echte Videowiedergabe, Anmeldung und Bearbeitung im Studio, Wechsel des Einstiegs-Videos, Umordnen, Speichern und öffentliches Neuladen. Ein isolierter Serverlauf prüfte zusätzlich signierte Katalog-/Medienveröffentlichung, Ablehnung eines unsicheren Aktionslinks und Erhalt der Konfiguration über einen echten Prozess-Neustart. Die öffentliche Beispielinstanz `aivideos.slidestr.net` wurde nicht verändert. Sammlungen, Analytics und globale Homepage-Zuordnung sind noch nicht umgesetzt.

**Wiederkommen statt Abo:** Es gibt bewusst kein Abo-Modell; der Besuch der Site ist die Abo-Aktion. Die Startseite zeigt „Neu seit deinem letzten Besuch“ (höchstens vier Videos, nach Veröffentlichungsdatum), nur wenn es seit dem letzten Besuch in diesem Browser etwas Neues gibt; beim ersten Besuch nie. Gespeichert wird nur der Zeitpunkt des letzten Besuchs (`localStorage`, nie übertragen); der Vergleichswert bleibt pro Browser-Sitzung fest, damit Neuladen die Anzeige nicht löscht. Ein zweiter Tab zählt als neuer Besuch. Der Datenschutz-Standardtext nennt den Zeitpunkt; bestehende Instanzen müssen ihren gespeicherten Text selbst ergänzen. Zusätzlich steht unauffällig ein RSS-Link im Footer (`/feed.xml`); eine als nsite ausgelieferte Site enthält keinen Feed, dort zeigt der Link ins Leere.

**Phase 2, erster Teil (Testinstanz, nicht produktiv):** Die Creator-Site merkt sich auf dem jeweiligen Gerät die Abspielposition unfertiger Videos (`localStorage`, höchstens 50 Einträge und 90 Tage, nie übertragen) und zeigt sie auf der Startseite als „Weiterschauen“ mit einer Löschmöglichkeit. Eine Zeit im Link (`?t=`, auch 0) hat immer Vorrang vor der gespeicherten Position. Die Videoseite zeigt Kapitel aus der Beschreibung als Liste und vorhandene Untertitel als lesbares, durchsuchbares Transkript (erst beim Öffnen geladen, nichts wird erzeugt); Klick springt sofort und markiert die Stelle. Nach dem Video erscheint „Als Nächstes“ mit der Folge aus den ausgewählten Arbeiten des Creators (sonst das neueste andere Video) und „Noch einmal ansehen“; kein automatisches Abspielen. Scheitern alle Medienquellen, gibt es einen verständlichen Hinweis mit „Erneut versuchen“ an derselben Stelle.

Live geprüft auf `videos.apps3.slidestr.net` (Desktop, 390 und 320 Pixel): Fortsetzen nach Neuladen, Vorrang der Link-Zeit, Löschen, echtes Transkript eines Katalogvideos (65 Zeilen, Suche, Sprung), Videoende mit Empfehlung, blockierte Medien mit Wiederherstellung. Beim Test fiel auf, dass die Markierung erst nach dem abgeschlossenen Seek wechselte (bis 1,4 s Verzögerung); sie wechselt jetzt beim Klick.

**Noch offen in Phase 2:** Eine pro Video frei wählbare Empfehlung gibt es nicht; die Reihenfolge der ausgewählten Arbeiten übernimmt diese Rolle, echte Serien folgen mit Phase 3. Kein Katalogvideo der Testinstanz hat Kapitel; deren Darstellung ist durch Tests, nicht live belegt. Touch-Bedienung auf echten Geräten, Hochkantvideos und Vollbild wurden nicht gesondert geprüft, ebenso kein Screenreader-Durchlauf. Der Datenschutz-Standardtext nennt jetzt die gespeicherte Position; bestehende Instanzen behalten ihren gespeicherten Text und müssen ihn selbst aktualisieren (auch `videos.apps3` und `aivideos`).

## Produktentscheidung

Die Creator-Site wird eine kuratierte Heimat für die Arbeit eines Creators, nicht eine kleinere globale Videoplattform. Die eigene Domain präsentiert das Werk und bindet das Publikum; Nostr ermöglicht Identität, offene Verteilung und Nutzung in anderen Apps. Zuschauer müssen Nostr nicht verstehen, um Videos anzusehen.

Das Ziel ist eine Erfahrung, die fünf Aufgaben zuverlässig erfüllt:

1. Neue Besucher verstehen, bei wem sie sind und womit sie anfangen sollen.
2. Zuschauer können schnell, angenehm und ohne Anmeldung schauen.
3. Wiederkehrende Besucher finden ältere Arbeiten, setzen Videos fort und erfahren von Neuem.
4. Creator veröffentlichen einmal, kuratieren ihre Präsentation und erkennen den tatsächlichen Veröffentlichungsstatus.
5. Inhalte bleiben außerhalb der eigenen Website auffindbar und nutzbar, ohne dort als unabhängige Dubletten neu veröffentlicht zu werden.

## Geprüfte Ausgangslage

Die folgenden Befunde beschreiben den Ausgangszustand vor dem ersten Kurationsteil; der aktuelle Lieferumfang steht im Abschnitt „Umsetzungsstand“.

### Öffentliche Beispielsite

Geprüft wurde <https://aivideos.slidestr.net/> im Desktop-Browser und bei mobiler Viewportbreite. Eine Videoseite wurde über eine Videokarte geöffnet; die Wiedergabe lief, das Videoelement meldete `readyState: 4` und eine fortschreitende Wiedergabezeit. Der Teilen-Dialog bot Link, Zeitstempel, externe Teilziele und Embed an.

`/robots.txt`, `/sitemap.xml` und `/feed.xml` antworteten mit HTTP 200. Der geprüfte Feed enthielt 17 Einträge. Die ungeführte HTML-Antwort der geprüften Videoseite enthielt einen videospezifischen Titel, Canonical, Open-Graph-Titel und strukturierte JSON-LD-Daten.

Die öffentliche [Konfiguration](https://aivideos.slidestr.net/api/config) meldete `reach: public`, einen öffentlich erreichbaren Ursprung, deaktivierte Suche und keine konfigurierten Relay-/Blossom-Mirrors. Das beweist weder externe Indexierung noch globale Abspielbarkeit oder Ausfallsicherheit.

Die About-Seite beschreibt eine kuratierte Sammlung fremder AI-Videos. Diese Instanz ist daher ein Beispiel für Kuration, nicht allein die Referenz für eine persönliche Künstler-Homepage. Betreiber, veröffentlichender Account und tatsächliche Urheber sind getrennt zu behandeln.

### Bestehende Implementierung

| Bereich | Vorhanden | Grundlage |
| --- | --- | --- |
| Creator-Site | Branding, Header, eigene Video- und Tag-Seiten, optionale Suche, Inhaltsseiten | [SiteHome](../../apps/site/src/SiteHome.tsx), [GridPage](../../apps/site/src/GridPage.tsx), [SitePage](../../apps/site/src/SitePage.tsx) |
| Videoseite | Player, Beschreibung, Tags, weitere Videos, Teilen, Kommentare, Likes und Zaps | [VideoView](../../apps/site/src/VideoView.tsx) |
| Player | Untertitel, Kapitel, Varianten-/Qualitätswahl, Geschwindigkeit, Vollbild und Picture-in-Picture | [VideoPlayer](../../packages/widgets/src/player/VideoPlayer.tsx), [ControlBar](../../packages/widgets/src/player/ControlBar.tsx), [SettingsMenu](../../packages/widgets/src/player/SettingsMenu.tsx) |
| Studio | Branding, Upload, Thumbnail, Untertitel, Bearbeitung und Terminierung | [AppearancePage](../../apps/studio/src/AppearancePage.tsx), [UploadPage](../../apps/studio/src/UploadPage.tsx), [VideoEditor](../../apps/studio/src/VideoEditor.tsx) |
| Veröffentlichung | Wiederaufnahme erfolgreicher Pipeline-Schritte im laufenden Upload-Zustand; stabile adressierbare Videoidentität | [run-upload](../../apps/studio/src/upload/run-upload.ts), [video-publish](../../packages/core/src/video-publish.ts) |
| Suchmaschinen und Feeds | Servergenerierte Metadaten, VideoObject, Sitemap, RSS und Atom | [seo.rs](../../apps/server/src/seo.rs) |
| Moderation und Betrieb | Lokale Moderation, Meldungen, Mirror-Status und erneute Auslieferungsversuche | [ModerationPage](../../apps/studio/src/ModerationPage.tsx), [MirrorCard](../../apps/studio/src/MirrorCard.tsx), [outbox.rs](../../apps/server/src/outbox.rs) |
| Globale Nostube-App | Creator-Profile, Folgen, Playlists und angepinnte Videos | [AuthorPage](../../apps/web/src/pages/AuthorPage.tsx), [ProfileCard](../../apps/web/src/components/profile/ProfileCard.tsx), [useAuthorPinnedVideos](../../apps/web/src/hooks/useAuthorPinnedVideos.ts) |

Codebefunde sind keine Behauptung, dass sämtliche Funktionen auf der öffentlichen Instanz end-to-end geprüft wurden. Insbesondere wurden keine Studio-Anmeldung, Veröffentlichung, Zahlung, Lastprüfung oder serverseitige Störung durchgeführt. Es wurden keine Performance-Werte erhoben.

### Wesentliche Produktlücken

- Die Homepage besteht im geprüften Aufbau aus Branding und einem chronologischen Videoraster statt aus einem bewusst gestalteten Einstieg.
- Eine Site-eigene redaktionelle Kuration mit Featured-Video, ausgewählten Arbeiten und Sammlungen fehlt im geprüften Seitenaufbau.
- Ein klarer Abonnieren-/Folgen-Einstieg fehlt dort; Unterstützung und Anmeldung sind bereits sichtbar.
- Die Videoseite empfiehlt weitere neue Videos, aber noch keine bewusst gewählte Fortsetzung oder Serienfolge.
- Die Studio-Übersicht zeigt Betriebsdaten, keine Zuschaueranalyse.
- Dauerhafte Upload-Entwürfe über einen Browser-Neustart sind nicht dasselbe wie die vorhandene Wiederholung von Pipeline-Schritten im laufenden React-Zustand.
- Eine Website-Zuordnung und der Rückweg von globaler Entdeckung zur Creator-Heimat sind nicht allein durch öffentliche Reichweite gelöst. Das abgeleitete verwaltete Profil enthält derzeit kein `website`-Feld; die geprüfte globale ProfileCard rendert keinen gesonderten Homepage-Link.

## Zielerlebnis und Designprinzipien

### Homepage

Die Homepage stellt vor, empfiehlt einen Einstieg und bietet Vertiefung. Ein kuratierter Einstieg bekommt mehr Gewicht als ein großer dekorativer Banner. Die wichtigsten Videos sind nicht zwangsläufig die neuesten.

Geeignete Bausteine sind: Creator-Intro, Featured-Video, ausgewählte Arbeiten, neueste Videos, Sammlungen/Serien und eine Kontakt-/Folgen-Aktion. Nicht jede Site benötigt jeden Baustein. Leere Bereiche verschwinden.

### Videoseite

Der Player steht zuerst. Titel und notwendiger Kontext folgen, danach eine sinnvolle nächste Empfehlung. Folgen, Unterstützung und Diskussion bleiben erreichbar, konkurrieren aber nicht gleichrangig mit dem Video. Die bestehende kompakte Navigation statt eines großen Banners auf Videoseiten bleibt erhalten.

### Visuelle Regeln

- Mobile zuerst: Branding darf den ersten Bildschirm nicht vollständig verbrauchen.
- Lesbare Typografie und starke Video-Thumbnails; eine Monospace-Schrift bleibt eine Stilentscheidung.
- Pro Bereich eine Hauptaktion; seltene Funktionen ins passende Menü.
- Kein automatisch laufendes Hero-Hintergrundvideo als Standard.
- Keine Pflichtanmeldung zum Anschauen und keine frühen Installations-/Benachrichtigungsdialoge.
- Lange Titel, fehlende Bilder, ein einziges Video, Hochkantmaterial, helle/dunkle Darstellung und Übersetzungen gehören zu den normalen Zuständen.
- Sichtbare Fokuszustände, verständliche Beschriftungen, ausreichende Touch-Ziele und reduzierte Bewegung sind Grundanforderungen.

## Roadmap in Ausführungsreihenfolge

Die Phasen bilden Abhängigkeiten ab, keine geschätzten Kalenderzeiträume. Jede funktionale Phase umfasst die notwendige Creator-Bedienung und den echten öffentlichen Nutzungspfad. Performance, Sicherheit und Barrierefreiheit gelten ab der ersten Phase.

### Phase 0 — Qualitätsmaßstab und Pilotkataloge

**Ziel:** Nicht nur für das aktuelle AI-Video-Raster gestalten.

**Arbeit:**

- Reale Pilotkataloge aus Musik, Film/Portfolio und episodischem Wissen heranziehen.
- Homepage → erstes Video, Direktlink → nächster Schritt, Wiederkehr → altes Video und Upload → externe Wiedergabe dokumentieren.
- Ausgangswerte für Laden, Wiedergabestart und Fehlerverhalten unter benannten Bedingungen erfassen.
- Kleine Nutzertests mit neuen Zuschauern und Creatorn durchführen; Nostr-Kenntnisse nicht voraussetzen.
- Referenzzustände für leere/kleine/große Kataloge, fehlende Medien, langsame Verbindung und lange Inhalte definieren.

**Abnahme:** Ein neuer Besucher startet ohne Erklärung ein passendes Video. Ein Creator versteht nach dem Veröffentlichen, was lokal erfolgreich ist und was extern noch nicht bestätigt wurde. Ergebnisse und Messbedingungen werden festgehalten.

### Phase 1 — Kuratierte Creator-Homepage

**Ziel:** Persönlichkeit und ein überzeugender erster Einstieg.

**Frontend:**

- Featured-Video oder Showreel mit Standbild, kurzer redaktioneller Einordnung und klarer Ansehen-Aktion.
- Kurzbiografie, wichtige Creator-Links und eine konfigurierbare Hauptaktion, etwa Kontakt, Veröffentlichung oder Buchung.
- Geordnete ausgewählte Arbeiten und davon getrennte neueste Videos.
- Zurückhaltender Folgen-/Abonnieren-Einstieg; vorhandenen RSS-Feed früh nutzbar machen.
- Gute automatische Darstellung bei fehlenden optionalen Inhalten.

**Studio:** Featured-Video und ausgewählte Arbeiten wählen/ordnen; Text, Links und Hauptaktion bearbeiten; Vorschau mit echten Inhalten für Desktop und Mobile.

**Technische Anker:** `SiteHome`, `GridPage`, `AppearancePage` und der bestehende Site-Konfigurationsvertrag. Vertragserweiterungen müssen Server, Studio und Site gemeinsam abdecken. Ausgeblendete oder gelöschte Videos dürfen nicht durch die neue Kuration wieder sichtbar werden.

**Abnahme:** Eine Site mit einem Video wirkt vollständig. Eine Site mit vielen Videos hat einen erkennbaren Einstieg. Alle redaktionellen Entscheidungen lassen sich ohne Codeänderung im Studio treffen. Keine Anmeldung zum Anschauen.

### Phase 2 — Herausragendes Anschauen

**Ziel:** Das Zusammenspiel von Player, Videoseite und Navigation verfeinern, nicht einen zweiten Player bauen.

**Arbeit:**

- Touch-Bedienung, Hochkantmaterial, Vollbild und lange Videos auf realen Zielgeräten prüfen.
- Verständliche Lade-, Fehler- und Wiederherstellungszustände ohne unnötigen Positionsverlust.
- Lokales Weiterschauen mit stabiler Videoreferenz und Möglichkeit zum Entfernen; kein implizites geräteübergreifendes Tracking.
- Vorhandene Kapitel außerhalb der Timeline zugänglich machen.
- Aus vorhandenen Untertiteln ein lesbares Transkript mit Zeitstempel-Navigation anbieten. Ohne Untertitel keine automatische Transkription versprechen.
- Nach Videoende eine vom Creator gewählte Empfehlung anbieten; später Serienkontext priorisieren.
- Mobile Teilen-/Embed-Nutzung und direkte Zeitstempel-Links prüfen.
- Automatisches Abspielen einer nächsten Folge nur als erkennbare, abschaltbare Wahl.

**Technische Anker:** `VideoView`, gemeinsamer `VideoPlayer`, bestehende Kapitel-, Untertitel- und Share-Bausteine.

**Abnahme:** Starten, Springen, Untertitel, Teilen und Fortsetzen funktionieren ohne Orientierungsverlust. Ein fehlender Medienpfad führt zu einer verständlichen Reaktion. Tastaturpfade und Fokus nach Dialogen werden geprüft. Fortsetzen überschreibt nicht ungefragt eine ausdrücklich geteilte Startzeit.

### Phase 3 — Sammlungen, Serien und Archiv

**Ziel:** Ältere Inhalte bleiben auffindbar; episodische Inhalte haben eine Reihenfolge.

**Frontend:**

- Teilbare Sammlungsseiten mit Cover, Titel, Einordnung und geordneter Videoliste.
- Serienkontext mit vorheriger/nächster Folge und Einstieg von vorn.
- Suche, neu/alt-Sortierung und passende Filter auf Basis tatsächlich vorhandener Merkmale.
- Filterzustand und Sammlungskontext in der URL; Browser-Zurück erhält Orientierung.
- Verständliche Behandlung entfernter, ausgeblendeter oder nicht erreichbarer Einträge.

**Studio:** Sammlungen anlegen, Videos zuordnen und ordnen; Serien kennzeichnen; Sammlungen für die Homepage auswählen.

**Wiederverwendung:** Vorhandene Playlist-/Pin-Modelle der globalen App zuerst prüfen. Gemeinsam benötigte React-freie Logik nach Core, gemeinsame UI nach Widgets; keine Site-Imports aus appgebundenem Web-Code. Die konkrete Modellentscheidung wird vor Umsetzung festgehalten, nicht hier durch ein neues paralleles Schema vorweggenommen.

**Skalierungsgrenze:** Die aktuelle lokale Suche lädt den gesamten Katalog seitenweise in den Browser. Das bleibt eine kleine-Katalog-Lösung. Für große Archive ist ein begrenzter serverseitiger Suchweg Voraussetzung für das entsprechende Produktversprechen.

**Abnahme:** Ein älteres Video ist gezielt auffindbar. Eine Serie wird in Creator-Reihenfolge durchlaufen. Geteilte Sammlung und direkter Videolink funktionieren unabhängig voneinander, ohne ein Video erneut zu veröffentlichen.

### Phase 4 — Verlässlicher Creator-Arbeitsplatz

**Ziel:** Eine Veröffentlichung ist ein geführter Vorgang statt eine Sammlung einzelner Werkzeuge.

**Arbeit:**

- Zusammenhängender Ablauf: Datei → Metadaten/Thumbnail/Untertitel/Credits → Sammlung/Platzierung → Vorschau → Veröffentlichung → Status.
- Dauerhafte Entwürfe und automatische Sicherung von Metadaten. Erforderliche erneute Auswahl lokaler Dateien offen erklären.
- Zustände trennen: Entwurf, Verarbeitung, geplant, lokal veröffentlicht, an konfigurierte Ziele ausgeliefert, teilweise fehlgeschlagen.
- Vorschau von Videokarte, öffentlicher Seite und geteiltem Link mit tatsächlichen Inhalten.
- Hinweise auf fehlende Untertitel oder Credits als Hinweise behandeln, nicht grundlos als Veröffentlichungssperre.
- Massenbearbeitung für häufige Aufgaben wie Tags und Sammlungszuordnung.
- Bestehende Upload-Wiederaufnahme und Terminierung erhalten und in die neue Oberfläche integrieren.

**Sicherheitsgrenzen:** Ausblenden ist weder Löschen noch Zugriffsschutz. Ein geplantes Event schützt bereits hochgeladene Mediendateien nicht automatisch. Vertrauliche Vorabansichten benötigen einen gesonderten Zugriffsschutz und sind nicht durch schwer erratbare URLs erfüllt.

**Abnahme:** Neuladen verliert keinen als gespeichert angezeigten Entwurf. Ein erneuter Versuch erzeugt kein zweites Video und wiederholt keine bereits erfolgreichen Uploads unnötig. Geplante Videos erscheinen nicht vorzeitig in öffentlichen Katalogen, Feeds oder Metadaten. Dateivertraulichkeit wird gesondert geprüft und nicht nur aus der Event-Terminierung abgeleitet.

### Phase 5 — Publikum und offener Verteilungskreislauf

**Ziel:** Ein einzelner Besuch kann zu einer dauerhaften Beziehung werden; globale Entdeckung führt nachvollziehbar zur Creator-Heimat.

**Folgen:** Ein verständlicher Einstieg „Neue Videos nicht verpassen“ bietet Nostr-Folgen, Öffnen in einer passenden App, RSS und optional den bestehenden externen Newsletter. Keine eigene Newsletter-Infrastruktur, solange eine Verlinkung oder Integration den Bedarf erfüllt. Installation ist kein Ersatz für ein Abonnement.

**Globale Verbindung:**

- Verifizierbare Zuordnung zwischen Creator und persönlicher Video-Homepage.
- Sichtbarer Homepage-Link auf globalen Creator-Profilen und optional ein Verweis auf der globalen Videoseite.
- Homepage in verwalteten Profildaten berücksichtigen. Änderungen einer bereits bestehenden eigenen Nostr-Identität bewusst signieren lassen, nicht automatisch überschreiben.
- Von der persönlichen Site aus Öffnen in anderen Nostr-Apps ermöglichen.
- Nutzer nicht automatisch von ihrer gewählten App weg umleiten.
- Veröffentlichung auf der eigenen Site, Annahme durch fremde Relays und tatsächliche Auffindbarkeit getrennt bestätigen.

**Community:** Bestehende Moderation verständlich integrieren; Creator-Antworten hervorheben; Kommentare pro Video abschaltbar machen; angepinnte Kommentare bei belegtem Bedarf. Externe Interaktionen nur mit kontrolliertem Import und klarer Quellen-/Vollständigkeitsanzeige zusammenführen.

**Abhängigkeit:** [Server-ADR 0014](../../apps/server/docs/adr/0014-interaction-import.md) beschreibt einen gesonderten optionalen Interaktionsimport. Er ist keine bereits nachgewiesene Eigenschaft der heutigen Beispielsite. Eine lokale Moderationsaktion löscht keine fremden Kopien.

**Abnahme:** Ein eigener Test-Release wird außerhalb der Site gefunden und abgespielt. Die globale Oberfläche bietet einen nachvollziehbaren Rückweg zur bestätigten Creator-Homepage. Videos behalten ihre Identität. Folgen überschreibt keine bereits vorhandenen Abonnements anderer Clients. Ohne Nostr-Konto bleibt ein brauchbarer Weg zum Wiederkommen.

### Phase 6 — Messbare Qualität und Wachstum

**Ziel:** Mehr Videos und mehr Publikum verschlechtern die Erfahrung nicht grundlegend.

**Frontend und Medien:**

- Passende Thumbnail-Größen, begrenzte Anfragen und paginierte Archive.
- Schwere Funktionen und Player bei Bedarf laden; keine vollständigen Videos für ein Raster vorladen.
- Adaptive Wiedergabe nur zusammen mit tatsächlich erzeugten und verfügbaren Medienvarianten zusagen.
- Byte-Range-Auslieferung, Cache/CDN und Bandbreitenbedarf mit dem gewählten Hosting abstimmen.
- Ausfall des Ursprungs und tatsächliche Auffindbarkeit von Medienkopien praktisch prüfen; ein erfolgreicher Kopierjob allein reicht nicht.
- Großkatalog-Suche und Moderationspaginierung ausbauen, bevor die bestehenden Grenzen den Betrieb einschränken. Die aktuelle Moderationsansicht begrenzt ihre Abfragen auf 100 Videos, 500 Kommentare und 200 Meldungen je Query.

**Optionale Creator-Analyse:** Videostarts, relevante Betrachtungspunkte, Wiedergabefehler und Übergänge zu weiteren Videos/Sammlungen. Messlücken und kleine Stichproben offenlegen. Keine Fingerprints, keine heimliche geräteübergreifende Identität, keine Gleichsetzung von Downloads mit Zuschauern. Likes und Zaps sind kein vollständiges Publikumsmaß.

Die heutige Beispielsite erklärt, keine Analytics zu verwenden. Eine optionale neue Messung muss mit Datenschutztexten, Aufbewahrung, Aktivierung und Abschaltung zusammen umgesetzt werden. Wiederkehrende Besucher lassen sich ohne beständige Identifikatoren nicht beliebig genau messen; diese Grenze bleibt sichtbar.

**Vorgeschlagene Ziele, keine heutigen Messergebnisse:**

| Kennzahl | Ziel |
| --- | ---: |
| LCP, reale mobile Nutzung, 75. Perzentil | ≤ 2,5 s |
| INP, 75. Perzentil | ≤ 200 ms |
| CLS, 75. Perzentil | ≤ 0,1 |
| Wiedergabestart nach Nutzeraktion im vereinbarten Referenznetz, 75. Perzentil | ≤ 2 s |

**Abnahme:** Messbedingungen und Stichproben sind dokumentiert. Ein großer Referenzkatalog verlangt nicht das Laden aller Einträge für den ersten Bildschirm. Ursprungsausfall und Relay-Probleme werden absichtlich ausgelöst. Der Creator erkennt Probleme ohne Log-Analyse.

### Phase 7 — Vertikale Stärken nach Pilotbedarf

**Ziel:** Den gemeinsamen Kern dort vertiefen, wo reale Creator einen Vorteil haben.

- **Musik:** Release-Seiten, Lyrics/Credits, Album-/Live-Sammlungen, Streaming-/Kauflinks, Konzert-/Merch-Verweise und gute Loop-/Audio-Bedienung.
- **Film/Portfolio:** Projektseiten mit Trailer, Hauptfilm, Making-of und Credits; Showreel, Kontakt/Buchung und ausdrücklich freigegebene Presse-/Downloadmaterialien.
- **Wissen:** Lernreihenfolge, Kapitel, Transkriptsuche, Begleitmaterial und optionaler lokaler Fortschritt ohne vollständiges Lernmanagementsystem.
- **Kuration:** Sichtbare Originalquelle, tatsächliche Urheber, eigene Einordnung und nachvollziehbare Empfänger von Unterstützung.

**Abnahme:** Jede Erweiterung löst einen beobachteten Pilotbedarf und lässt sich mit den gemeinsamen Seiten-/Sammlungsbausteinen bedienen. Keine parallelen Spezialprodukte ohne nachgewiesene Notwendigkeit.

## Meilensteine und Freigabepunkte

| Meilenstein | Ergebnis | Voraussetzung für den nächsten Ausbau |
| --- | --- | --- |
| M0: belastbare Ausgangslage | Pilotwege, Qualitätsbaseline, reale Inhalte | Probleme und Prioritäten mit Nutzern geprüft |
| M1: überzeugende Homepage | Phase 1 und grundlegendes Videoerlebnis aus Phase 2 | Creator kuratiert selbst; neuer Besucher findet den Einstieg |
| M2: nutzbare Videobibliothek | Phase 2 vollständig und Phase 3 | Archiv, Serien und Fortsetzen funktionieren auch bei Direktlinks |
| M3: verlässliches Publizieren | Phase 4 | Gesicherte Entwürfe, eindeutige Status, geprüfte Terminierungsgrenzen |
| M4: offene Creator-Heimat | Phase 5 | Externe Wiedergabe, Follow und Rückweg zur eigenen Homepage nachgewiesen |
| M5: tragfähiges Wachstum | Phase 6 | Messziele, große Kataloge und Ausfallpfade geprüft |
| M6: gezielte Spezialisierung | Ausgewählte Teile aus Phase 7 | Reale Nutzung rechtfertigt jede Erweiterung |

Begrenzte Teile dürfen vorgezogen werden, etwa RSS-Einstieg in Phase 1 oder eine akut benötigte Studio-Datensicherung. Keine Homepage-Funktion gilt als fertig, solange sie nur über manuelle Konfigurationsdateien bedienbar ist.

## Erster umsetzbarer Lieferumfang

Der erste größere Lieferumfang heißt „kuratierte Creator-Homepage mit überzeugender Videoseite“:

1. Mobile Homepage-Hierarchie mit echten Pilotinhalten.
2. Featured-Video einschließlich Studio-Auswahl und Behandlung entfernter Videos.
3. Kurzbiografie, Creator-Links und eine klare Hauptaktion.
4. Geordnete ausgewählte Arbeiten, getrennt von neuen Uploads.
5. Bewusste nächste Empfehlung auf der Videoseite.
6. Lokales Weiterschauen mit expliziter Zeitstempel-Priorität.
7. Einfacher Folgen-/RSS-Einstieg.
8. Erste Sammlung von Studio-Bearbeitung bis zur teilbaren öffentlichen Seite.
9. Vollständige Lade-, Fehler-, Mobile- und Tastaturpfade für diesen Umfang.
10. Validierung mit neuen Zuschauern und echten Creatorn vor weiteren Layoutoptionen.

Diese Pakete sind in kleine End-to-End-Änderungen zu schneiden. Die Reihenfolge ersetzt keine Prüfung des dann aktuellen Repository-Zustands.

## Technische Leitplanken und Risiken

- **Eine Videoidentität:** Bearbeitung, Sammlung, Kommentare, Fortsetzen und Links müssen mit adressierbaren Videos und ersetzten Eventversionen konsistent umgehen.
- **Gemeinsame Bausteine:** React-freie Logik in Core, geteilte React-UI in Widgets, Site-Navigation in `apps/site`. Keine zweite Player- oder Nostr-Client-Implementierung.
- **Begrenzte Kuration:** Zunächst feste gute Inhaltsbereiche statt freiem Page-Builder. Homepage-Kuration darf sich von globalen Pins unterscheiden.
- **Verteilte Zustände:** Lokal veröffentlicht, extern angenommen, Medienkopie bestätigt und global entdeckt sind unterschiedliche Zustände.
- **Keine falsche Privatheit:** `reach: private` ist kein Passwortschutz. Bereits veröffentlichte Kopien können verbleiben; bestehende Mirror-Ziele können auch bei privater Reichweite weiter beliefert werden.
- **Identitätskontrolle:** Eine beliebige Profil-URL ist keine hinreichend geprüfte Domain-Zuordnung. Bestehende Creator-Profile nicht still überschreiben.
- **Medienkosten:** Nostr verteilt Ereignisse, nicht automatisch Bandbreite oder Transcoding-Leistung. Varianten, Hosting und Fallback-Auflösung müssen tatsächlich vorhanden sein.
- **Rechte und Vertrauen:** Kurator, Urheber und Zahlungsempfänger transparent unterscheiden; technische Veröffentlichung ersetzt keine Veröffentlichungsrechte.
- **Datenschutz:** Analytics, externe Follow-Ziele und Interaktionsimporte verändern Datenflüsse. Texte und Einwilligungs-/Aktivierungsentscheidungen mitliefern, nicht später nachtragen.

## Verifikation während der späteren Umsetzung

Dies sind geplante Prüfungen, keine in dieser Planungsarbeit ausgeführten Tests:

- Geänderte öffentliche Oberfläche im Browser auf Desktop und realen mobilen Zielgeräten ausführen; auch Direktlink und Neuladen prüfen.
- Server-HTML von Video- und Sammlungsseiten ohne JavaScript auf passende Metadaten prüfen; Sitemap/Feeds auf ausgeschlossene und geplante Inhalte prüfen.
- Studio-Änderungen speichern, öffentliche Seite neu laden und tatsächlichen Inhalt statt nur lokaler Vorschau bestätigen.
- Upload mit unterbrochener Verbindung, Signer-Fehler, Neuladen und erneutem Versuch prüfen; dabei Dubletten, Positions-/Metadatenverlust und falsche Erfolgsmeldungen ausschließen.
- Veröffentlichte Videoidentität nach Metadatenbearbeitung, Medienersatz und Aufnahme in mehrere Sammlungen nachverfolgen.
- Externe Wiedergabe auf einem frischen Client ohne lokale Caches prüfen. Mirror-Fallback mit nicht verfügbarem Ursprung prüfen.
- Accessibility über vollständige Tastaturwege und mindestens einen Screenreader-Durchlauf der Kernwege prüfen.
- Je Änderung die passenden vorhandenen Regressionstests und Workspace-Prüfungen ergänzend ausführen; Tests ersetzen nicht die Prüfung der echten Oberfläche. Prüfassets nicht verändern, um Fehler zu verdecken.

## Bewusst nicht im ersten Lieferumfang

Kein eigener Newsletter-Dienst, keine Paywall, kein Livestreaming, kein Empfehlungsalgorithmus, kein Theme-Marktplatz und kein umfassendes Analytics-System. Diese Fähigkeiten benötigen einen eigenen belegten Bedarf und vollständige Betriebs-/Sicherheitskonzepte.

Die Leitfrage bleibt: Präsentiert diese Änderung die Arbeit des Creators besser, macht sie Anschauen einfacher oder ermöglicht sie eine stärkere Beziehung zum Publikum? Wenn nicht, ist sie für diese Roadmap nachrangig.
