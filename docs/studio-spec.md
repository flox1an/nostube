# apps/studio: Spec (Entwurf)

Stand: 9. Oktober 2026. Der erste Schnitt ist umgesetzt: Gerüst unter `/studio/`, Passwort-Login über den serverseitigen Login, die Bereiche Aussehen, Instanz und Konto sowie `GET/PUT /api/admin/config`. Das Studio ist die **einzige** Admin-Oberfläche; das alte serverseitige Dashboard ist entfernt (`/admin` leitet auf `/studio/` um, nur Einrichtung und Login bleiben serverseitig). Noch offen: Signer, Moderation, Videos und Upload.

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

### Zeitgesteuertes Publishing

Der Server braucht den Key nicht, um Events zeitgesteuert zu senden: Das Studio signiert vorab (mit dem Zeitstempel des Veröffentlichungstermins) und übergibt das Event dem Server, der es bis zum Termin zurückhält und dann an die Relays sendet. Das funktioniert mit beiden Betriebsarten. Der Server kann so nur veröffentlichen, was der Owner schon signiert hat. Was der Server selbst erfinden müsste (etwa automatische Reaktionen), braucht einen Bunker mit eingeschränkten Rechten und liegt außerhalb des ersten Schnitts.

## Funktionen (grobe Reihenfolge)

1. **Anmeldung und Übersicht**: Login des Admins, Einrichtung des Signers (siehe Identität und Signer), Startseite mit Zustand der Instanz (Speicher, Relays, letzte Uploads).
2. **Videos**: Hochladen (Wizard wie in `apps/web`, inklusive Transcoding im Browser, ADR 0002), Metadaten bearbeiten, Videos löschen oder ausblenden. Wiederverwendung der Upload-Bausteine aus `apps/web` über `packages/*`.
3. **Moderation**:
   - Kommentare der eigenen Videos durchsehen (aus den `interactionRelays`).
   - Autoren und einzelne Events stummschalten. Das Studio pflegt die **Mute-Liste des Owners** (NIP-51, Kind 10000: `p`-Tags für Autoren, `e`-Tags für einzelne Events) und veröffentlicht sie über den Signer.
   - Die Site liest die Liste des Owners (Pubkey aus `/api/config`) und blendet die Einträge aus. Die Site braucht dafür nur einen Filter, keine Moderationslogik.
4. **Einstellungen** (erledigt): Titel, Creators, Relays, Suche, Speicher-Limits sowie das Aussehen der Site (Untertitel, Akzentfarbe, Schrift) und welche Videos ausgeblendet sind (`site` im Config-Vertrag, Server-ADR 0005; alle Videos der Creators sind sichtbar, außer den ausgeblendeten). Das ist die heutige Config-Bearbeitung unter `/admin`; das Studio wird dafür die Oberfläche.

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
3. **Mehrere Creators:** Die Config kennt `creators` als Liste. Wessen Mute-Liste gilt, wenn es mehrere gibt (nur der erste, alle zusammen)?
4. **Upload-Code:** Wie viel vom Wizard und vom Transcoding wandert nach `packages/widgets`, und wie viel bleibt in `apps/web`? Das hängt von der Größe des Bausteins ab und sollte beim ersten Upload-Slice entschieden werden.
5. **Berechtigungen bei Uploads:** Schreibrechte laufen heute über `allowed_writers` in der Config. Das Studio muss konsistent damit sein (der eingeloggte Owner muss dort stehen).

## Reihenfolge (Vorschlag für den ersten Schnitt)

1. Gerüst: `apps/studio`, Einbettung unter `/studio/`, CI-Check, Passwort-Login, Bereiche Aussehen, Instanz, Konto (**erledigt**). Noch offen in diesem Schritt: `Signer`-Interface mit Managed und NIP-07, Onboarding mit beiden Optionen.
2. Mute-Liste: Anzeige und Bearbeitung, Site liest sie.
3. Einstellungen (Config).
4. Videos und Upload.
