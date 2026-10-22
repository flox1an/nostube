# apps/studio: Spec (Entwurf)

Stand: 14. Oktober 2026. Der erste Schnitt ist umgesetzt: Gerüst unter `/studio/`, Login im Studio (Passwort oder Nostr-Key über den Login-Dialog der Site; der serverseitige Login bleibt als Rückfall), die Bereiche Aussehen, Instanz und Konto sowie `GET/PUT /api/admin/config`. Das Studio ist die **einzige** Admin-Oberfläche; das alte serverseitige Dashboard ist entfernt (`/admin` leitet auf `/studio/` um, nur Einrichtung und Login bleiben serverseitig). Die Moderation per Mute-Liste ist umgesetzt, ebenso der Signer (Managed und das im Browser angemeldete Nostr-Konto: Erweiterung, nsec, Bunker, Nostr Connect; Onboarding mit beiden Optionen), Upload sowie Bearbeiten, Ersetzen und Löschen von Videos. Noch offen: Transcoding im Browser.

## Ziel

Das Studio ist die Verwaltungsoberfläche für den Owner einer Nostube-Server-Instanz, vergleichbar mit dem WordPress-Backend. Es ist eine **eigene Web-App** (`apps/studio`), getrennt von der Site (`apps/site`), und wird vom selben Server auf derselben Origin ausgeliefert (Site unter `/`, Studio unter `/studio/`). Die Site bleibt eine schlanke Leseansicht für Besucher.

Gründe für die Trennung: kleineres Besucher-Bundle (Upload, Transcoding und Verwaltung gehören nicht hinein), klare Sicherheitsgrenze (Admin-Code ist nicht im Besucher-Bundle), unabhängiges Wachstum. Siehe auch ADR 0004.

## Nicht-Ziele

- Keine Besucher-Funktionen (Likes, Kommentare, Zaps): sie gehören in die Site, mit Nostr-Login bei Bedarf nachgeladen.
- Keine Entdeckung fremder Videos.
- Keine Moderation im Kontext der Site: der Owner hat dort keine eigenen Aktionen. Moderation passiert ausschließlich im Studio.

## Identität und Signer

Das Studio kennt nur ein Interface `Signer` ("signiere dieses Event") und weiß nicht, wo der Key liegt. Es gibt zwei Betriebsarten, die gleichrangig sind:

- **Managed:** Der Server erzeugt den Key bei der Einrichtung, speichert ihn verschlüsselt (Admin-Secrets, nicht im `config.toml`) und signiert selbst. Der Creator arbeitet nur mit Passwort, Nostr bleibt unsichtbar. Die Server-Pubkey steht in `creators`. Das ist der Default im Onboarding.
- **Eigener Key:** Der Owner signiert mit dem Nostr-Konto, mit dem er sich im Browser anmeldet (NIP-07, nsec/NIP-49, Bunker NIP-46 oder Nostr Connect). Der Server sieht den Key nie. Das Onboarding bietet diese Option im ersten Schritt gleichrangig an, nicht versteckt in den Einstellungen.

Der Passwort-Login (Server-ADR 0002) bleibt in beiden Fällen der Zugang zum Studio; daneben meldet „Mit Nostr anmelden“ mit einem verknüpften Key an, über jeden Weg des Login-Dialogs. Der Login allein signiert nichts; Signieren läuft über den Signer.

Anforderungen an Managed:

- Der Owner kann den `nsec` jederzeit exportieren (mit Passwort-Bestätigung). Managed ist keine Sackgasse.
- Wer den Server kompromittiert, bekommt im Managed-Modus die Identität. Das gehört offen in die Doku.

**Nicht im ersten Schnitt:** der Wechsel von Managed auf einen eigenen Key (und umgekehrt). Der Export des `nsec` ist der vorläufige Weg, die Identität mitzunehmen.

**Umsetzung (Server-ADR 0007):** Der Server hält den Managed-Key als NIP-49-`ncryptsec` in `secrets.toml`; dessen Passwort sind 256 Zufallsbits in `<data>/signer.key` (nur für den Server-Benutzer lesbar). Die Endpunkte unter `/api/admin/signer` brauchen die Admin-Sitzung, Schreibzugriffe nur als JSON:

- `GET` liefert `{ mode, pubkey }`: `managed` mit der Pubkey, `own` (die Instanz hat Creators, der Server hält keinen ihrer Keys; Pubkey `null`) oder `none`.
- `POST` erzeugt den Key, einmalig; gibt es ihn schon, antwortet er mit diesem (ein wiederholtes Onboarding), nie mit einem neuen.
- `POST /sign` signiert `{ kind, created_at, tags, content }` und gibt das signierte Event zurück. Andere Felder, leere Tags und zu große Events (wie am Relay: 128 KiB, höchstens 30 Minuten in der Zukunft) lehnt er ab.
- `POST /export` gibt den `nsec` nur gegen das Admin-Passwort heraus; Fehlversuche zählen zur Login-Drossel (ADR 0002).

Das Studio wählt den Signer nach der Antwort des Servers: den Managed-Key, sonst das in diesem Browser angemeldete Nostr-Konto (Erweiterung, nsec/`ncryptsec`, Bunker oder Nostr Connect; derselbe Login-Dialog und dieselbe Kontospeicherung wie auf der Site, Server-ADR 0002, Nachtrag). Ohne angemeldetes Konto zeigt das Studio im eigenen Modus einen Hinweis mit „Mit Nostr anmelden“. Bei einer neuen Instanz bietet das Banner auf den Inhaltsseiten beide Optionen nebeneinander an; danach trägt dasselbe Speichern die Pubkey in `creators` und `allowed_writers` ein (mit Neustart). Die Kontoseite zeigt Betriebsart und Pubkey (npub), im Managed-Modus auch den Export. `nostube-server admin reset` behält den Key.

### Zeitgesteuertes Publishing

Der Server braucht den Key nicht, um Events zeitgesteuert zu senden: Das Studio signiert vorab (mit dem Zeitstempel des Veröffentlichungstermins) und übergibt das Event dem Server, der es bis zum Termin zurückhält und dann an die Relays sendet. Das funktioniert mit beiden Betriebsarten. Der Server kann so nur veröffentlichen, was der Owner schon signiert hat. Was der Server selbst erfinden müsste (etwa automatische Reaktionen), braucht einen Bunker mit eingeschränkten Rechten und liegt außerhalb des ersten Schnitts.

**Umsetzung (umgesetzt, Upload-Seite und Seite „Videos“):** Im Upload gibt es das optionale Feld „Veröffentlichen am“ (lokale Zeit). Ist ein Termin in der Zukunft gesetzt, signiert das Studio das vollständige Videoevent sofort (`created_at` = jetzt, Tag `published_at` = Termin; ein `created_at` in der Zukunft würde vom Managed-Signer und von Relays abgelehnt, 30 Minuten) und schickt es per `POST /api/admin/schedule` an den Server statt an die Relays. Der Server hält es in der Tabelle `scheduled` von `relay.sqlite`; bis zur Freigabe steht es in keiner Relay-Tabelle, ist also weder auf der Site noch im Embed noch für fremde Nostr-Clients sichtbar.

- **Annahme (Vertrauensgrenze):** gültige Signatur, Pubkey in `creators` und `allowed_writers`, Kind 34235 oder 34236, `d`-Tag, jede referenzierte Blob liegt im Blossom-Speicher der Instanz, Termin in der Zukunft. Alles andere lehnt der Server mit 400 und Begründung ab.
- **Freigabe:** ein Worker prüft etwa jede Minute auf fällige Events und gleich beim Start (überfällige Events nach einem Ausfall gehen beim nächsten Start raus). Das Event geht durch den normalen Weg des Relays; damit wirkt die Outbox (Server-ADR 0009) wie bei jedem anderen Event, auch für Spiegel-Relays. Die Zeile bleibt als Verlauf mit Zustand `released` (oder `failed` samt Grund, etwa wenn das Event zwischenzeitlich gelöscht wurde). Minutengenau, keine sekundengenaue Garantie.
- **Bearbeiten vor der Freigabe:** das Studio signiert neu und ersetzt das gehaltene Event (gleicher `d`-Tag, Termin änderbar); Blobs der ersetzten Version räumt der Server auf, soweit nichts anderes sie braucht. Nach der Freigabe gilt der normale Bearbeitungsweg.
- **Abbrechen vor der Freigabe:** wie Löschen: der Server verwirft das Event (`POST /api/admin/schedule/cancel`) und entfernt die Blobs aus Blossom (und von den Spiegeln). Blobs gehaltener Videos räumt keine Aufräumaufgabe weg.
- **Liste:** die Seite „Videos“ zeigt gehaltene und freigegebene Videos mit Zustand (`GET /api/admin/schedule`).
- **Nicht Teil davon:** keine Premieren oder Countdown-Seiten (zusammen mit Live-Streaming prüfen); Terminplanung gilt nur für den verbundenen Studio-Key (Studio-Zugang für mehrere Creators ist ein eigenes Thema).

**Akzeptierte Risiken (dokumentiert, nicht behoben):**

1. Die Server-Datenbank enthält signierte Events. Wer sie kompromittiert, kann genau diese Videos früher veröffentlichen, mehr nicht (im Managed-Modus bekäme er ohnehin den Key, siehe oben).
2. Die Blobs sind vor der Freigabe öffentlich abrufbar: Blossom adressiert nach Hash, die URL ist der Hash. Ohne das Event ist sie nicht auffindbar. Eine Vorab-Platzierung der Blobs (Spiegel, CDN) ist ein brauchbarer Baustein für später.

## Funktionen (grobe Reihenfolge)

1. **Anmeldung und Übersicht**: Login des Admins, Einrichtung des Signers (siehe Identität und Signer), Startseite mit Zustand der Instanz (Speicher, Relays, letzte Uploads).
2. **Videos** (Upload umgesetzt: MP4/WebM, die der Browser abspielt, unverändert; andere Container und Codecs (MOV, MKV, AVI, HEVC ohne Wiedergabe) wandelt der Browser vorher im Worker in MP4 (H.264/AAC, kurze Seite höchstens 1080 px) um, als eigener Schritt „Convert to MP4“ mit Fortschritt und Abbrechen; kein HLS. In Teilen per `PATCH /upload`, Veröffentlichung nur an die Relays der Instanz): Tags, Dateiauswahl, Inhaltswarnung, Thumbnail-Auswahl/-Import und Untertitel-Upload verwenden dieselben Widgets wie `apps/web`. VTT/SRT-Dateien bekommen eine auswählbare Sprache; SRT wird vor dem Upload in WebVTT umgewandelt. Metadaten, Thumbnail und Untertitel bleiben bis „Upload and publish“ lokal; Wiederholungen nutzen abgeschlossene Uploads weiter. Geteilte UI liegt in `@nostube/widgets`, Untertitel-Helfer, Event-Tags und das Browser-Transcoding (`@nostube/core/video-transcode`, `@nostube/core/browser-transcode-worker`, Mediabunny lokal gebündelt) in `@nostube/core`; Signer und Upload-Ablauf bleiben app-seitig.
   - **Verwalten nach dem Upload** (umgesetzt, je Video der Seite „Videos“, nur für Videos des verbundenen Keys): **Metadaten bearbeiten** (Titel, Beschreibung, Tags, Inhaltswarnung, Thumbnail, Untertitel) veröffentlicht eine neue Version des addressable Events mit demselben Kind und `d`-Tag, ohne das Video neu hochzuladen; unbekannte Tags und `published_at` bleiben erhalten (`@nostube/core/video-lifecycle`). **Datei ersetzen** lädt die neue Datei hoch und tauscht `imeta` (URL, Hash, Größe, Abmessungen); Kind und `d` bleiben, auch wenn sich die Ausrichtung ändert, damit Links stabil bleiben. **Löschen** fragt nach und veröffentlicht ein NIP-09-Event mit `e` (letzte Version), `a` (Koordinate) und `k`. Das Studio löscht selbst keine Blobs: der Server räumt nach einer angenommenen neuen Version oder Löschung die nicht mehr referenzierten eigenen Blobs auf und gibt Event und Löschung über die Outbox an die Spiegel-Ziele weiter. Der Embed-Player fragt immer die Relays (kein lokaler Event-Cache mehr) und spielt kein Video, das sein Autor gelöscht hat.
   - Grenzen der Umwandlung: Das MP4 entsteht im Arbeitsspeicher des Tabs (mediabunny `BufferTarget`, höchstens 4 GiB). Ab einer geschätzten Ausgabe über 4 GiB lehnt das Studio die Datei vorher ab („tooLong“), ab etwa 2 GB geschätztem Speicherbedarf (gemessen rund 4,5× die Ausgabe) warnt es neben der Datei. Kann der Browser die Tonspur nicht umwandeln, bricht die Umwandlung mit einer Meldung ab, statt ein Video ohne Ton zu veröffentlichen.
   - Noch offen: HLS-Ausgabe und Auflösungswahl im Studio (ADR 0002); heute entsteht genau ein MP4. Ausgabe per Stream (z. B. nach OPFS) statt im Speicher würde Speichergrenze und Warnung überflüssig machen.
3. **Moderation** (umgesetzt, Seite „Moderation“ unter Inhalte):
   - Kommentare der eigenen Videos durchsehen: das Studio lädt die (bis zu 100 neuesten) Videos des verbundenen Keys aus den `videoSources` und deren Kommentare (Kind 1111 per `E`/`A`, Kind 1 per `e`/`a`, je bis zu 500) aus den `interactionRelays`, mit Autor (Name, Avatar) und Video. Antworten, die nur den Elternkommentar referenzieren, fehlen dort; Paging gibt es noch nicht.
   - Autoren und einzelne Kommentare stummschalten und wieder freigeben, sowohl am Kommentar als auch in der Liste der Einträge. Das Studio pflegt die **Mute-Liste des verbundenen Keys** (NIP-51, Kind 10000: `p`-Tags für Autoren, `e`-Tags für einzelne Events) und veröffentlicht sie über den Signer (`useSigner`) an die `interactionRelays`. Kind 10000 ist ersetzbar: jede Änderung baut auf der zuletzt gelesenen Liste auf (erst nach EOSE, sonst ist keine Änderung möglich), lässt alle anderen Tags und den verschlüsselten `content` unverändert, ändert nur den einen öffentlichen Eintrag und datiert das Event nach dem bisherigen (`@nostube/core/mute-list`). Die Seite nennt den Key (npub) und dass Stummschalten nur auf der Site ausblendet.
   - Die Site liest die Listen **aller** Creators (Pubkeys aus `/api/config`) aus den `interactionRelays` und blendet die **Vereinigung** aller Einträge aus: stummgeschaltete Kommentare samt ihrer Antworten, und Kommentare stummgeschalteter Autoren überall im Thread. Sie zählen nicht in der Kommentarzahl; bis die Listen geladen sind (EOSE), zeigt die Site keine Kommentare. Die Site braucht dafür nur einen Filter, keine Moderationslogik.
   - Der Relay der Instanz nimmt Kind 10000 von den `allowed_writers` an und liefert es jedem Leser aus (Lesen ist offen); der Key braucht also wie beim Upload Creator- und Writer-Rechte.
4. **Einstellungen** (erledigt): Titel, Creators, Relays, Suche, Speicher-Limits sowie das Aussehen der Site (Untertitel, Akzentfarbe, Schrift) und welche Videos ausgeblendet sind (`site` im Config-Vertrag, Server-ADR 0005; alle Videos der Creators sind sichtbar, außer den ausgeblendeten). Das ist die heutige Config-Bearbeitung unter `/admin`; das Studio wird dafür die Oberfläche.
   - **Logo, Favicon, Banner** (umgesetzt, Seite „Aussehen“): Hochladen, Ersetzen und Entfernen je Bild mit Vorschau und angezeigten Grenzen (PNG, JPEG, WebP, SVG, beim Favicon auch ICO; Logo und Favicon bis 512 KB, Banner bis 2 MB). Das Studio prüft Typ und Größe vor dem Hochladen; der Server prüft die Bytes selbst (`PUT`/`DELETE /api/admin/branding/<slot>`, Server-ADR 0005, Nachtrag Branding). Die Bilder gelten sofort, ohne Speichern und ohne Neustart. Die Site zeigt das Logo im Kopf und in der Brotkrumennavigation statt des Profilbilds (das bleibt Ersatz), das Banner über dem Kopf der Startseite und setzt das Favicon beim Laden. Der Embed-Player bleibt ohne Branding: er zeigt nur das Video.
   - **Reichweite** (umgesetzt, Seite „Instanz“ und Onboarding-Schritt „Veröffentlichen“): zwei Kacheln **Privat / Öffentlich** (`reach = "private" | "public"`, Server-ADR 0012). Privat: die Instanz veröffentlicht nichts (nur die eingetragenen Spiegelziele bekommen Kopien); der Server liefert in `/api/config` als Videoquelle und Interaktions-Relay nur das eigene Relay. Die Profilsuche angemeldeter Besucher (Server-ADR 0008) läuft in beiden Fällen gleich, auch bei öffentlichen Relays. Öffentlich: Profil (Kind 0) und Relay-Liste (Kind 10002) des Managed Keys gehen über die Outbox an die Profil-Relays. Der Wechsel zu Öffentlich fragt nach (nicht vollständig zurücknehmbar, Spiegel-Relays stehen in der veröffentlichten Relay-Liste); ohne öffentlich erreichbare Adresse (lokale CA, `.local`, IP, `canBePublic` im Admin-Zustand) ist Öffentlich gesperrt.
   - **Erweitert** (umgesetzt, eigene Seite unter Server): Schreibberechtigte, Videoquellen, Interaktions-Relays, Profil-Relays (`profile_relays`, Standard `purplepag.es`, `nos.lol` und `relay.damus.io`), Spiegelziele mit Spiegelstatus. Bei Privat sind Videoquellen und Interaktions-Relays ausgegraut und wirken nicht, behalten aber ihre Werte; Profil-Relays (Profilsuche angemeldeter Besucher, bei Öffentlich zusätzlich Ziel für Kind 0/10002) und die Spiegellisten wirken in beiden Fällen.
   - **Spiegeln auf andere Server** (umgesetzt, Seite „Erweitert“): Ziel-Relays und Ziel-Blossom-Server für die eigenen Events und Videos der Instanz (`[mirror]`, Server-ADR 0009). Beide Listen leer heißt: nichts verlässt die Instanz. Unter den Zielen zeigt das Studio je Ziel die erledigten, wartenden und fehlgeschlagenen Aufträge, die letzten Fehler und einen Retry für aufgegebene Aufträge. Blobs spiegelt der Server nur mit dem Managed Key.

### Bedienung (12. Oktober 2026)

- Das Onboarding wählt eine allein verfügbare Identität vor; danach zeigt die Videoseite eine Checkliste für Upload, Logo, Seiten, Lightning-Adresse und Website.
- Die Sprache steht im Header. Die Speicherleiste erscheint nur bei Änderungen; nur Änderungen an Schreibrechten, Speicherlimits oder Spiegelzielen warnen vor einem Neustart. Das Warten auf den Neustart begrenzt einzelne Health-Anfragen auf höchstens fünf Sekunden und auf die verbleibende Wartezeit.
- Die Lightning-Adresse unter „Aussehen“ wird beim Managed Key als `lud16` im Kanalprofil veröffentlicht. Creator und Schreibberechtigte erscheinen als Profil-Chips; Relay- und Spiegel-Einstellungen liegen auf der Seite „Erweitert“.
- Nach dem Upload zeigt eine Erfolgskarte Vorschau, Ansehen, Link kopieren, Bearbeiten und „Upload another“. Letzteres leert das Formular einschließlich Titel. Spiegel-Relays werden im Erfolgstext berücksichtigt; das Kopieren auf fremde Server blockiert weitere Uploads nicht.
- Videozeilen zeigen Dauer, Ausblendestatus und einen Website-Link. Ab sechs geladenen Videos gibt es eine Titelsuche. Auf kleinen Screens stehen die Aktionen unter der Vorschau und dem zweizeiligen Titel; im Bearbeiten-Dialog bleiben die Speicheraktionen sichtbar.
- Auf der Site sind Videokarten echte Links. Videoseiten zeigen den Site-Header und weitere Videos; Gäste sehen die Like-Zahl und erhalten erst beim Interagieren den passenden Anmeldehinweis. Tags und Beschreibungshashtags führen zu `/t/<tag>`; dort zählen die expliziten `t`-Tags des Events, nicht Hashtags, die nur im Beschreibungstext stehen.

## Grenzen der Moderation per Mute-Liste

- **Nur nachträglich:** Es gibt keine Freigabe-Warteschlange vorab. Falls später gewünscht, braucht es einen serverseitigen Filter am eigenen Relay.
- **Nur im Client wirksam:** Die Events bleiben auf den Relays und sind für andere Apps sichtbar. Wer sie loswerden muss, lehnt sie am eigenen Relay ab (`allowed_writers`) oder löscht sie dort.
- **Öffentlich lesbar:** Eine Mute-Liste, die die Site anwenden soll, ist ein normales, öffentliches Event. Die private (verschlüsselte) Variante kann die Site ohne Owner-Key nicht lesen.

## Architektur

- Eigene Vite-App `apps/studio` (React, Tailwind) im npm-Workspace. Geteilter Code kommt aus `@nostube/core` und `@nostube/widgets`, nicht aus `apps/web` (kein `@/`-Import).
- Der Server bettet sie neben der Site ein: `scripts/build-server-web.sh` baut beide (`apps/server/web/dist/` für die Site, `.../studio/` für das Studio), und die RustEmbed-Auslieferung liefert `/studio/*` mit eigenem SPA-Fallback. Das Studio braucht dafür einen Vite-`base` von `/studio/`.
- Die Config bezieht das Studio wie die Site von `/api/config`; Admin-Endpunkte liegen unter `/api/admin/` und sind nur mit Sitzung erreichbar.

## Offene Fragen

1. **Vorsignierte Events halten:** Entschieden (2026-10-12, Issue #120): Der Server hält vorsignierte Events dauerhaft in SQLite und released sie über die Outbox (Periodischer Scan plus Catch-up beim Start). Der Termin steht im `published_at`-Tag, `created_at` bleibt „jetzt“ (der Managed-Signer und Relays lehnen Zukunfts-Timestamps ab). Editieren vor dem Termin ersetzt das gespeicherte Event per Re-Presign (gleicher `d`-Tag), Abbrechen läuft wie Löschen. Risiko-Akzeptanz dokumentiert: Die DB hält signierte Events (schlimmster Fall: frühzeitiges Release genau dieser Videos), und Blobs sind vor dem Termin öffentlich abrufbar (content-addressed, ohne Event nicht auffindbar).
2. **Studio und `/admin`:** Entschieden: Das Studio ersetzt das Dashboard. Einrichtung (`/admin/setup`) und der Login (`/admin/login`) bleiben serverseitig, weil sie ohne Studio-Bundle funktionieren müssen; das Studio hat daneben einen eigenen Login (Passwort oder Nostr über den Login-Dialog), der dieselben Endpunkte nutzt. Offen: ein Notfall-Zugang, falls das Studio-Bundle fehlt (heute `nostube-server admin reset` und `config rollback` auf der Kommandozeile).
3. **Mehrere Creators:** Entschieden: Die Site wendet die Mute-Listen aller Creators zusammen an (Vereinigung). Das Studio bearbeitet die Liste des verbundenen Keys.
4. **Upload-Code:** Teilweise entschieden: Das React-freie Transcoding (Bedarfstest, MP4/HLS-Konvertierung, Worker und Worker-Client) liegt in `@nostube/core`. Offen: wie viel vom Wizard nach `packages/widgets` wandert und wie viel in `apps/web` bleibt.
5. **Berechtigungen bei Uploads:** Schreibrechte laufen heute über `allowed_writers` in der Config. Das Studio muss konsistent damit sein (der eingeloggte Owner muss dort stehen).

## Reihenfolge (Vorschlag für den ersten Schnitt)

1. Gerüst: `apps/studio`, Einbettung unter `/studio/`, CI-Check, Passwort-Login, Bereiche Aussehen, Instanz, Konto (**erledigt**), dazu das `Signer`-Interface mit Managed und dem Nostr-Konto des Browsers (Erweiterung, nsec, Bunker, Nostr Connect) und das Onboarding mit beiden Optionen (**erledigt**).
2. Mute-Liste: Anzeige und Bearbeitung, Site liest sie (**erledigt**).
3. Einstellungen (Config).
4. Videos und Upload.
