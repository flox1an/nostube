# apps/studio: Spec (Entwurf)

Stand: 10. Oktober 2026. Der erste Schnitt ist umgesetzt: Gerüst unter `/studio/`, Passwort-Login über den serverseitigen Login, die Bereiche Aussehen, Instanz und Konto sowie `GET/PUT /api/admin/config`. Das Studio ist die **einzige** Admin-Oberfläche; das alte serverseitige Dashboard ist entfernt (`/admin` leitet auf `/studio/` um, nur Einrichtung und Login bleiben serverseitig). Die Moderation per Mute-Liste ist umgesetzt, ebenso der Signer (Managed und NIP-07, Onboarding mit beiden Optionen). Noch offen: Bunker (NIP-46), Videos und Upload.

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
- **Eigener Key:** Der Owner signiert über NIP-07 oder einen Bunker (NIP-46). Der Server sieht den Key nie. Das Onboarding bietet diese Option im ersten Schritt gleichrangig an, nicht versteckt in den Einstellungen.

Der Passwort-Login (Server-ADR 0002) bleibt in beiden Fällen der Zugang zum Studio. Er signiert nichts; Signieren läuft über den Signer.

Anforderungen an Managed:

- Der Owner kann den `nsec` jederzeit exportieren (mit Passwort-Bestätigung). Managed ist keine Sackgasse.
- Wer den Server kompromittiert, bekommt im Managed-Modus die Identität. Das gehört offen in die Doku.

**Nicht im ersten Schnitt:** der Wechsel von Managed auf einen eigenen Key (und umgekehrt). Der Export des `nsec` ist der vorläufige Weg, die Identität mitzunehmen.

**Umsetzung (Server-ADR 0007):** Der Server hält den Managed-Key als NIP-49-`ncryptsec` in `secrets.toml`; dessen Passwort sind 256 Zufallsbits in `<data>/signer.key` (nur für den Server-Benutzer lesbar). Die Endpunkte unter `/api/admin/signer` brauchen die Admin-Sitzung, Schreibzugriffe nur als JSON:

- `GET` liefert `{ mode, pubkey }`: `managed` mit der Pubkey, `own` (die Instanz hat Creators, der Server hält keinen ihrer Keys; Pubkey `null`) oder `none`.
- `POST` erzeugt den Key, einmalig (sonst 409).
- `POST /sign` signiert `{ kind, created_at, tags, content }` und gibt das signierte Event zurück. Andere Felder, leere Tags und zu große Events (wie am Relay: 128 KiB, höchstens 30 Minuten in der Zukunft) lehnt er ab.
- `POST /export` gibt den `nsec` nur gegen das Admin-Passwort heraus; Fehlversuche zählen zur Login-Drossel (ADR 0002).

Das Studio wählt den Signer nach der Antwort des Servers: den Managed-Key, sonst die NIP-07-Erweiterung. Bei einer neuen Instanz bietet das Banner auf den Inhaltsseiten beide Optionen nebeneinander an; danach trägt dasselbe Speichern wie bei einem NIP-07-Key die Pubkey in `creators` und `allowed_writers` ein (mit Neustart). Die Kontoseite zeigt Betriebsart und Pubkey (npub), im Managed-Modus auch den Export. `nostube-server admin reset` behält den Key. Noch offen: Bunker (NIP-46).

### Zeitgesteuertes Publishing

Der Server braucht den Key nicht, um Events zeitgesteuert zu senden: Das Studio signiert vorab (mit dem Zeitstempel des Veröffentlichungstermins) und übergibt das Event dem Server, der es bis zum Termin zurückhält und dann an die Relays sendet. Das funktioniert mit beiden Betriebsarten. Der Server kann so nur veröffentlichen, was der Owner schon signiert hat. Was der Server selbst erfinden müsste (etwa automatische Reaktionen), braucht einen Bunker mit eingeschränkten Rechten und liegt außerhalb des ersten Schnitts.

## Funktionen (grobe Reihenfolge)

1. **Anmeldung und Übersicht**: Login des Admins, Einrichtung des Signers (siehe Identität und Signer), Startseite mit Zustand der Instanz (Speicher, Relays, letzte Uploads).
2. **Videos** (Upload umgesetzt: MP4/WebM, ohne Transcodierung, in Teilen per `PATCH /upload`, Veröffentlichung nur an die Relays der Instanz): Tags, Dateiauswahl, Inhaltswarnung, Thumbnail-Auswahl/-Import und Untertitel-Upload verwenden dieselben Widgets wie `apps/web`. VTT/SRT-Dateien bekommen eine auswählbare Sprache; SRT wird vor dem Upload in WebVTT umgewandelt. Metadaten, Thumbnail und Untertitel bleiben bis „Upload and publish“ lokal; Wiederholungen nutzen abgeschlossene Uploads weiter. Noch offen: Transcoding im Browser (ADR 0002), Metadaten bearbeiten, Videos löschen. Geteilte UI liegt in `@nostube/widgets`, Untertitel-Helfer und Event-Tags in `@nostube/core`; Signer und Upload-Ablauf bleiben app-seitig.
3. **Moderation** (umgesetzt, Seite „Moderation“ unter Inhalte):
   - Kommentare der eigenen Videos durchsehen: das Studio lädt die (bis zu 100 neuesten) Videos des verbundenen Keys aus den `videoSources` und deren Kommentare (Kind 1111 per `E`/`A`, Kind 1 per `e`/`a`, je bis zu 500) aus den `interactionRelays`, mit Autor (Name, Avatar) und Video. Antworten, die nur den Elternkommentar referenzieren, fehlen dort; Paging gibt es noch nicht.
   - Autoren und einzelne Kommentare stummschalten und wieder freigeben, sowohl am Kommentar als auch in der Liste der Einträge. Das Studio pflegt die **Mute-Liste des verbundenen Keys** (NIP-51, Kind 10000: `p`-Tags für Autoren, `e`-Tags für einzelne Events) und veröffentlicht sie über den Signer (`useSigner`) an die `interactionRelays`. Kind 10000 ist ersetzbar: jede Änderung baut auf der zuletzt gelesenen Liste auf (erst nach EOSE, sonst ist keine Änderung möglich), lässt alle anderen Tags und den verschlüsselten `content` unverändert, ändert nur den einen öffentlichen Eintrag und datiert das Event nach dem bisherigen (`@nostube/core/mute-list`). Die Seite nennt den Key (npub) und dass Stummschalten nur auf der Site ausblendet.
   - Die Site liest die Listen **aller** Creators (Pubkeys aus `/api/config`) aus den `interactionRelays` und blendet die **Vereinigung** aller Einträge aus: stummgeschaltete Kommentare samt ihrer Antworten, und Kommentare stummgeschalteter Autoren überall im Thread. Sie zählen nicht in der Kommentarzahl; bis die Listen geladen sind (EOSE), zeigt die Site keine Kommentare. Die Site braucht dafür nur einen Filter, keine Moderationslogik.
   - Der Relay der Instanz nimmt Kind 10000 von den `allowed_writers` an und liefert es jedem Leser aus (Lesen ist offen); der Key braucht also wie beim Upload Creator- und Writer-Rechte.
4. **Einstellungen** (erledigt): Titel, Creators, Relays, Suche, Speicher-Limits sowie das Aussehen der Site (Untertitel, Akzentfarbe, Schrift) und welche Videos ausgeblendet sind (`site` im Config-Vertrag, Server-ADR 0005; alle Videos der Creators sind sichtbar, außer den ausgeblendeten). Das ist die heutige Config-Bearbeitung unter `/admin`; das Studio wird dafür die Oberfläche.
   - **Logo, Favicon, Banner** (umgesetzt, Seite „Aussehen“): Hochladen, Ersetzen und Entfernen je Bild mit Vorschau und angezeigten Grenzen (PNG, JPEG, WebP, SVG, beim Favicon auch ICO; Logo und Favicon bis 512 KB, Banner bis 2 MB). Das Studio prüft Typ und Größe vor dem Hochladen; der Server prüft die Bytes selbst (`PUT`/`DELETE /api/admin/branding/<slot>`, Server-ADR 0005, Nachtrag Branding). Die Bilder gelten sofort, ohne Speichern und ohne Neustart. Die Site zeigt das Logo im Kopf und in der Brotkrumennavigation statt des Profilbilds (das bleibt Ersatz), das Banner über dem Kopf der Startseite und setzt das Favicon beim Laden. Der Embed-Player bleibt ohne Branding: er zeigt nur das Video.
   - **Profile von Besuchern** (umgesetzt, Seite „Instanz“): Liste der Relays, auf denen die Site Name und Bild angemeldeter Besucher zusätzlich zu den Instanz-Relays sucht (`profile_relays`, im Config-Vertrag optional als `profileRelays`, Server-ADR 0008). Standard sind die öffentlichen Relays `purplepag.es` und `index.hzrd149.com`; „Nur lokal“ leert die Liste mit einem Klick, dann fragt die Site kein öffentliches Relay, auch nicht die eigenen Relays des Besuchers. „Öffentliche Standards“ stellt die Liste wieder her.
   - **Spiegeln auf andere Server** (umgesetzt, Seite „Instanz“): Ziel-Relays und Ziel-Blossom-Server für die eigenen Events und Videos der Instanz (`[mirror]`, Server-ADR 0009). Beide Listen leer heißt: nichts verlässt die Instanz. Unter den Zielen zeigt das Studio je Ziel die erledigten, wartenden und fehlgeschlagenen Aufträge, die letzten Fehler und einen Retry für aufgegebene Aufträge. Blobs spiegelt der Server nur mit dem Managed Key.

## Grenzen der Moderation per Mute-Liste

- **Nur nachträglich:** Es gibt keine Freigabe-Warteschlange vorab. Falls später gewünscht, braucht es einen serverseitigen Filter am eigenen Relay.
- **Nur im Client wirksam:** Die Events bleiben auf den Relays und sind für andere Apps sichtbar. Wer sie loswerden muss, lehnt sie am eigenen Relay ab (`allowed_writers`) oder löscht sie dort.
- **Öffentlich lesbar:** Eine Mute-Liste, die die Site anwenden soll, ist ein normales, öffentliches Event. Die private (verschlüsselte) Variante kann die Site ohne Owner-Key nicht lesen.

## Architektur

- Eigene Vite-App `apps/studio` (React, Tailwind) im npm-Workspace. Geteilter Code kommt aus `@nostube/core` und `@nostube/widgets`, nicht aus `apps/web` (kein `@/`-Import).
- Der Server bettet sie neben der Site ein: `scripts/build-server-web.sh` baut beide (`apps/server/web/dist/` für die Site, `.../studio/` für das Studio), und die RustEmbed-Auslieferung liefert `/studio/*` mit eigenem SPA-Fallback. Das Studio braucht dafür einen Vite-`base` von `/studio/`.
- Die Config bezieht das Studio wie die Site von `/api/config`; Admin-Endpunkte liegen unter `/api/admin/` und sind nur mit Sitzung erreichbar.

## Offene Fragen

1. **Vorsignierte Events halten:** Hält der Server vorsignierte Events dauerhaft (Datenbank, überlebt Neustarts) oder lädt sie das Studio nur bei Bedarf hoch? Und wie verhindert man Konflikte, wenn ein Video nach dem Vorsignieren noch bearbeitet wird (addressable Event mit gleichem `d`-Tag)?
2. **Studio und `/admin`:** Entschieden: Das Studio ersetzt das Dashboard. Einrichtung (`/admin/setup`) und Login (`/admin/login`) bleiben serverseitig, weil sie ohne Studio-Bundle funktionieren müssen. Offen: ein Notfall-Zugang, falls das Studio-Bundle fehlt (heute `nostube-server admin reset` und `config rollback` auf der Kommandozeile).
3. **Mehrere Creators:** Entschieden: Die Site wendet die Mute-Listen aller Creators zusammen an (Vereinigung). Das Studio bearbeitet die Liste des verbundenen Keys.
4. **Upload-Code:** Wie viel vom Wizard und vom Transcoding wandert nach `packages/widgets`, und wie viel bleibt in `apps/web`? Das hängt von der Größe des Bausteins ab und sollte beim ersten Upload-Slice entschieden werden.
5. **Berechtigungen bei Uploads:** Schreibrechte laufen heute über `allowed_writers` in der Config. Das Studio muss konsistent damit sein (der eingeloggte Owner muss dort stehen).

## Reihenfolge (Vorschlag für den ersten Schnitt)

1. Gerüst: `apps/studio`, Einbettung unter `/studio/`, CI-Check, Passwort-Login, Bereiche Aussehen, Instanz, Konto (**erledigt**), dazu das `Signer`-Interface mit Managed und NIP-07 und das Onboarding mit beiden Optionen (**erledigt**; Bunker noch offen).
2. Mute-Liste: Anzeige und Bearbeitung, Site liest sie (**erledigt**).
3. Einstellungen (Config).
4. Videos und Upload.
