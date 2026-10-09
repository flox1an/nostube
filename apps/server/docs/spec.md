# Nostube Server — Konzept für Creator- und kuratierte Videoseiten

Stand: 6. Oktober 2026. Zusammenführung der Architekturprüfung, PeerTube-Recherche und anschließenden Produktentscheidungen. Vereinbarte Ziele sind von technischen Vorschlägen und noch ungeprüften Integrationsannahmen getrennt. Keine Implementierung und keine Umsetzungsfreigabe.

**Name:** „Nostube Server“ ist der vorläufige Arbeitstitel. „Nostube Home“, „Nostube Local“ und „Nostube Team“ wurden ebenfalls erwogen; eine endgültige Namensentscheidung wird daraus nicht abgeleitet.

## Empfehlung

Ein kompaktes Rust-Hauptprogramm mit eingebetteter Nostube-Oberfläche betreibt die Nostube-App mit optionalem Homepage-Modus, eine private Admin-Oberfläche, Konfiguration sowie optional einschaltbare Blossom-Dateiauslieferung und ein eigenes Nostr-Relay. Alternativ lassen sich externe Relays und Blossom-Dienste verwenden. **Die Verarbeitung erfolgt im Browser des Creators mit der vorhandenen Browser-Transcoding-Pipeline.** Der erste Paketschnitt enthält weder Divico noch einen Server-Video-Worker, FFmpeg-Runtime oder Worker-Container. Separate Datenbankserver sind nicht erforderlich.

Ziel ist eine einzige verständliche Installation mit möglichst einem Hauptbinary beziehungsweise einem Hauptcontainer. Das Relay kann zunächst als Bibliothek mit internem Listener laufen; falls Einbettung einen unverhältnismäßigen Umbau verlangt, ist ein gebündelter Relay-Hilfsprozess vertretbar. Ein Relay neu zu schreiben wäre keine Abkürzung.

Die eigene Creator-Homepage ist der erste Anwendungsfall. Eine kuratierte Seite mit mehreren konfigurierten Creatorn gehört ebenfalls zum Ziel und wird im Konfigurationsmodell von Anfang an berücksichtigt. Gemeinsame Community-Verwaltungsrechte und Hosting-Multitenancy bleiben spätere Erweiterungen. Die große Nostube-Seite bleibt optionaler Aggregator und bewusst gewähltes Mirror-Ziel. Das vollständige lokale Profil funktioniert ohne sie. Die Entscheidung für Browserverarbeitung spart Serverkomponenten, macht aber Fähigkeiten und Lebenszyklus des Creatorgeräts zu einer ausdrücklichen Produktgrenze.

## Vereinbarte Produktentscheidungen

- Die bestehende Nostube-App behält Upload, Browser-Transcoding, Drafts, Vorschau, lokales Signing und Veröffentlichung. Diese Funktionen werden nicht in eine neue Admin-Inhaltsoberfläche verschoben oder doppelt implementiert.

- Die private Admin-Oberfläche verwaltet die Instanz: Startansicht und später individuelle Homepagegestaltung, angezeigte Creator, Videoquellen, Suchmodus, Relay-/Blossom-Module, deren Sicherheitsregeln, Speicher, Konfiguration und kontrollierte Neustarts. Ein zusätzliches Creator Studio ist im ersten Schnitt kein eigener Produktbaustein.

- Eigenes Logo und eigene Farben sind als spätere wichtige Anpassungsmöglichkeiten vorgemerkt; nicht Voraussetzung des ersten technischen Schnitts. Die bestehende Profilseite als konfigurierbare Startseite ist ein konkreter Gestaltungsvorschlag.

- Derselbe Frontendcode unterstützt normale Nostube-Nutzung und Homepage-Modus. Eine Creator-Liste mit einem Eintrag ergibt die persönliche Seite; mehrere Einträge ergeben eine kuratierte Auswahl. Die normale öffentliche Nostube-App bleibt nutzbar und behält ihre Funktionen.

- Webassets einschließlich Browserworker werden beim Build ins Rustbinary eingebettet. Veränderliche öffentliche Instanzkonfiguration wird separat als JSON vom selben Server ausgeliefert; keine Secrets gelangen in diesen Vertrag.

- Im Homepage-Modus geben die Instanzregeln die Grenzen vor. Öffentliche Presets und persönliche Einstellungen dürfen weder Videoquellen noch Creator-Auswahl erweitern. Ein Preset darf geeignete Defaults liefern; zusätzliche allgemeine Filterverwaltung ist zunächst nicht nötig.

- Videoabfragen verwenden ausschließlich konfigurierte Video-Relays und die ausgewählten Creator. Diese Einschränkung betrifft den dargestellten Videokatalog, nicht pauschal alle Nostr-Verbindungen.

- Profile, Kommentare und andere Nutzeraktionen behalten ihre passenden Nutzer-/Inbox-/Outbox-Relaywege. Das Instanz-/Defaultrelay wird bei passenden Interaktionen zusätzlich berücksichtigt. Dessen Ablehnung ist möglich; lokale Speicherung fremder Kommentare und neue eventartspezifische Relayregeln sind keine erzwungene Anforderung.

- Nur ausdrücklich freigegebene Schlüssel dürfen auf die eigenen Relay-/Blossom-Dienste schreiben. Die Dienste erzwingen ihre Regeln serverseitig. Keine zweite unabhängig gepflegte Autorisierungs-Allowlist im Frontend; dieses muss Ablehnungen verständlich anzeigen.

- Suche ist explizit aus-, lokal oder extern konfigurierbar. Ziel der lokalen Suche ist der vollständige Metadatenkatalog der ausgewählten Creator, nicht nur zuvor gescrollte Videos. Vorhandene MiniSearch-Logik wird gemeinsam genutzt: normaler App-Fallback, direkter Homepage-Suchweg.

- Der erste Paketschnitt hat keinen Divico-/FFmpeg-Serverworker. Das vollständig lokale Profil muss nach Online-Einrichtung ohne WAN auf einem zweiten Gerät frisch geladen werden und Browserverarbeitung, Upload und Veröffentlichung erlauben.

## 1. Produktgrenze, Betriebsprofile und verbindliche Abnahme

Die Nostube-App zeigt im Homepage-Modus Videos, Profile, Sammlungen und Player der ausgewählten Creator. Suche ist optional. Upload, Drafts, Verarbeitung, Vorschau, Veröffentlichung und Inhaltsbearbeitung bleiben im bestehenden Appweg. Der private Adminbereich betreibt und konfiguriert die Instanz; dessen Anmeldung ist von Nostr-Signing getrennt. Angezeigte Creator, zugelassene Schreiber und lokal gespeicherte Medien sind drei unabhängig zu behandelnde Mengen. Das Entfernen eines Creators aus der Anzeige löst keine automatische Dateilöschung aus.

| Betriebsprofil | Module und Zusage |

|---|---|

| Vollständig lokal | Eingebautes Relay und Blossom aktiv, lokales Dateibackend; verbindliche Offline-Abnahme |

| Hybrid | Beispielsweise lokales Blossom plus externes Relay; Ausfallverhalten der externen Dienste explizit |

| Extern | Eingebaute Module ausgeschaltet, externe URLs und Zugangskonfiguration; keine WAN-Unabhängigkeitsgarantie |

Konfiguration unterscheidet `relay.mode` und `blossom.mode` mit lokal/extern/aus sowie expliziten Endpoints, Datenpfaden und erlaubten Schlüsseln. „Aus“ ist nur zulässig, wenn die dadurch betroffenen Funktionen bewusst deaktiviert sind. Validierung verhindert widersprüchliche Profile. Lokale Module starten nur wenn gewählt; Modulwechsel migriert weder Events noch Dateien automatisch. Öffentliche Medien-URLs und Draftzuordnungen müssen bei einem Wechsel erhalten oder kontrolliert migriert werden.

**Hauptabnahme im vollständig lokalen Profil:** Nach erfolgreicher Online-Einrichtung WAN am Router beziehungsweise Host sperren, LAN erhalten, Host und Dienste neu starten. Auf einem zweiten Gerät einen frischen Browser ohne vorherigen App-Cache öffnen. Öffentliche Seite, Profile, Thumbnails, Untertitel, MP4 und HLS müssen lokal laden. In der Nostube-App lokal anmelden/signieren, eine lokale Datei auswählen, im Browser verarbeiten, ein Thumbnail erzeugen, die Ergebnisse lokal hochladen und ins eigene Relay veröffentlichen. Adminzugang, Konfiguration anwenden und Neustart müssen ebenfalls ohne WAN funktionieren. Ein weiteres frisches Browserprofil muss das neue Video anschließend finden und abspielen können.

Lokales DNS muss weiterhin verfügbar sein. Gegebenenfalls wurde Gerätevertrauen für eine private CA während der Einrichtung hergestellt; ein frischer Browser verlangt keinen ungepflegten Geräte-Truststore. Ein gecachter DNS-Eintrag, Service Worker, Trust-Score oder Login allein zählt nicht als Nachweis.

| Betriebsart | Einordnung |

|---|---|

| Nach Online-Einrichtung ohne WAN arbeiten | Verbindlicher Kernfall: Assets, Images, Daten, Schlüsselzugang, DNS und gültige Zertifikate lokal vorhanden |

| Ohne WAN neu starten | Bestandteil der Abnahme; deckt versteckte Bootstrap-Abhängigkeiten auf |

| Dauerhaft isolierter Betrieb | Separates späteres Profil: Offline-Installation, Updates, CA-/Zertifikatsversorgung und Zeitpflege |

| Öffentlicher Zugriff von außerhalb während WAN-Ausfall | Ohne alternativen Netzweg nicht möglich; externe Mirrors können verfügbar bleiben |

| Fremde Medien offline ansehen | Nur bei vorheriger ausdrücklicher lokaler Übernahme |

## 2. Zielarchitektur des vollständig lokalen Profils

\`\`\`mermaid

flowchart LR

  V["Zuschauer im LAN"] --&gt;|HTTPS| M

  DNS["Lokales DNS und Gerätevertrauen"] -.-&gt; V

  DNS -.-&gt; C

  subgraph Browser["Creator-Browser"]

    C\["Nostube-App: Upload und lokaler Signer"\]

    F\["Lokale Quelldatei"\] --&gt; T\["Gebündelter Browserworker&lt;br/&gt;Mediabunny / WebCodecs"\]

    F --&gt; H\["Thumbnail: Video / Canvas"\]

    C --&gt; T

    T --&gt; O\["MP4 / HLS im Browser"\]

  end

  subgraph Main["Rust-Hauptprogramm / ein Container"]

    M\["TLS und HTTP&lt;br/&gt;eingebettete Nostube-App / Admin UI"\]

    A\["Private Admin-API und Konfiguration"\]

    B\["Optionales Blossom-Modul aus Almond"\]

    R\["Optionales eigenes Nostr-Relay"\]

    M --&gt; A

    M --&gt; B

    M --&gt;|WSS| R

  end

  C --&gt;|HTTPS| M

  O --&gt;|lokaler Upload| B

  H --&gt;|lokaler Upload| B

  A --&gt; D[("Privater Zustand&lt;br/&gt;Konfiguration / optionale Upload-Assetzuordnung")]

  B --&gt; P[("Öffentliche Ausgabe-Blobs")]

  R --&gt; E[("Relay-SQLite")]

  C --&gt;|signiertes Videoevent| R

  A -. "optionale spätere Verbreitung" .-&gt; X["Externe Relays / ausgewählte Mirrors"]

\`\`\`

Extern gibt es stabile URLs, beispielsweise [`https://videos.example.org`](https://videos.example.org`), Blossom unter einer festgelegten Route beziehungsweise einem separaten Host und ein WSS-Relay. Ein eigener Relay-Host erleichtert Kompatibilität; ein Pfad verlangt WebSocket- und NIP-11-Verifikation. Im LAN lösen diese Namen auf die lokale Instanz auf. Docker-Servicenamen und `localhost` gehören nicht in Browser-URLs auf anderen Geräten.

| Ebene | Ziel |

|---|---|

| Installation / Distribution | Ein Paket, ein Setup, eine Admin-Oberfläche |

| Prozesse | Rust-Hauptprogramm; Verarbeitung als Worker im Creator-Browser, kein Serverworker |

| Persistenz | Lokale Dateien und gegebenenfalls optionale Verwaltungs-SQLite neben Relay-SQLite; keine externen DBserver |

SQLite benötigt keinen Server. Ein gemeinsames Schema für Relay und Verwaltungszustand würde unnötig koppeln. WAL-/Journaldateien und konsistente Backups gehören zum Betrieb; eine laufende DBdatei darf nicht beliebig kopiert werden. \[SQLite-Dateiformat\]([https://sqlite.org/onefile.html](https://sqlite.org/onefile.html)), \[Backup-API\]([https://sqlite.org/backup.html](https://sqlite.org/backup.html)).

## 3. Was wir wiederverwenden und was noch gebaut werden muss

| Bestehender Baustein | Wiederverwendung | Konkrete Anpassung |

|---|---|---|

| Nostube React/Vite | Player, Videomodelle, Profil, Sammlungen, Upload-/Signing-Hooks, lokale Suche | Homepage-Modus und öffentliche JSON-Konfiguration; bestehende Uploadfunktion behalten; Videoquellen und Suchbestände begrenzen |

| Nostube Hono-Server | Standalone-Verhalten, Runtime-Konfiguration, Metadaten-/Embed-Routen als Vorlage | Statische Vite-Ausgabe in Rust einbetten; benötigte serverseitige Routen gezielt portieren. TypeScript läuft nicht automatisch im Rustbinary |

| Almond | Blossom, SHA256, Streaming/Chunks, Range-Auslieferung, Nostr-Auth, Dateibackend | Bibliotheksschnitt, injizierte Konfiguration, Archivprofil und gegebenenfalls Upload-Assetzuordnung |

| `nostr-rs-relay` | Öffentliche Bibliothek und Startfunktion, SQLite, Nostr-Filter-/Eventsemantik | Lebenszyklus-/Signalhandling integrieren, Version pinnen, erlaubte Schreiber und Requestlimits setzen |

| Browser-Verarbeitung | Gebündelter Worker, Mediabunny/WebCodecs, MP4/HLS und Uploadmanager | Einziger Verarbeitungsweg im ersten Paket; konkrete Codecprüfung, lokale Assets und ehrliche Recovery-Grenzen |

| Thumbnails / Bildproxy | Video-/Canvas-Capture im Browser; Bildproxy hat bereits Bibliothek plus Binary | Browserthumbnail lokal hochladen und direkt ausliefern; zusätzliche Größen bei Bedarf im Browser erzeugen. Bildproxy keine Pflicht |

| `nostube-search` | Optional für große Kataloge | Zunächst eigener lokaler Katalog mit Volltext und Pagination; bestehende begrenzte Relay-Suche reicht nicht als Vollständigkeitsgarantie |

Quellen: \[Nostube-Dockerfile\](/path/to/nostube/Dockerfile), \[Hono-Standalone\](/path/to/nostube/server/standalone.ts:6), \[Relay-Startfunktion\](/path/to/nostr-rs-relay/src/server.rs:783), \[Almond-Router\](/path/to/almond/src/main.rs:210), \[Browserworker\](/path/to/nostube/src/lib/browser-transcode-worker.ts:130).

### Grenzen des Hauptbinarys

Almond ist aktuell ein Binary mit Modulen und öffentlicher Routerfunktion, aber ohne `src/[lib.rs](http://lib.rs)`; Stateaufbau und Programmstart sind intern. Das ist eine überschaubare Extraktion, keine bereits fertige Einbettung. Das Relay besitzt dagegen einen Bibliotheksschnitt, startet aber eine eigene Tokio-Laufzeit und eigenen Listener. Seine ältere Hyper-/Nostr-Version passt nicht unmittelbar in den modernen Axum-Router. Ein interner Listener, vom Hauptprogramm weitergeleitet, ist als erster Integrationsschnitt akzeptabel.

**Konkreter Relay-Einbettungsvorschlag:** `nostr-rs-relay::server::start_server(&Settings, std::sync::mpsc::Receiver<()>)` läuft auf einem eigenen `std::thread`; sein Standalone-main verwendet dieses Muster bereits. Das Paket erstellt Settings und Stopkanal, bindet den Relay-Listener ausschließlich auf Loopback und leitet WSS sowie NIP-11 über sein gemeinsames TLS-/HTTP-Gateway weiter. Der Relaylistener bleibt intern, ohne eigenen externen Port. Frameworkübergreifende Weiterleitung statt unmittelbares Zusammenführen alter Hyper- und neuer Axum-Router ist ein realistischer erster Schnitt. \[Standalone-Threadstart\](/path/to/nostr-rs-relay/src/main.rs:99).

Der Host besitzt Threadhandle und Stopsender. Startbereitschaft, Lese-/Schreibgesundheit, Fehlerübermittlung, geordneter Stop und `join` mit begrenztem Shutdownablauf müssen explizit geprüft werden. Stopkanal vorhanden bedeutet noch nicht garantierten sauberen Modulreload. Im Relay liegen globales Signalhandling, ein blockierendes `shutdown_rx.recv()` in einer async Aufgabe und ein `process::exit(1)` im Zahlungsinitialisierungspfad. Bibliotheksbetrieb darf keine fremde Prozessbeendigung oder konkurrierende Prozesssignalverantwortung haben: Fehler an den Host zurückgeben, Signale beim Composition Root lassen und Shutdownempfang ohne blockiertes async Arbeitsthread gestalten. Zahlungen und externe NIP-05-Prüfung bleiben im lokalen Creatorprofil aus. \[Lifecycle und Exit\](/path/to/nostr-rs-relay/src/server.rs:909). Das ist ein zu validierender Umbau im bestehenden Projekt, kein schon getesteter gemeinsamer Build; das Standalone-main bleibt erhalten.

Vor einer Zusage „alles kompiliert gemeinsam“ ist ein kleiner Buildnachweis nötig: Cargo-Abhängigkeiten, SQLite-`links`/Versionen, optionale Almond-Zahlungsabhängigkeiten sowie ein einheitlicher rustls-Kryptoprovider. Alte und neue Frameworks lassen sich nicht durch einen gemeinsamen Container automatisch zu einer Bibliothek machen. Ergibt der Nachweis einen großen Pflegeaufwand, darf vorübergehend ein gebündelter Relay-Hilfsprozess bleiben. Die Entscheidung richtet sich nach Betriebsaufwand und Wiederverwendung, nicht nach der Zahl der Prozesse.

Der bestehende \[Teststack\](/path/to/nostube/infra/test-stack/[README.md](http://README.md)) ist bewusst ein erster Integrations-/Smoke-Stack. Seine separaten Dienste sind wertvoll zum Prüfen bestehender Verträge. Seine localhost-Adressen, Envkonfiguration und sein generischer imgproxy sind kein fertiges LAN-Produktversprechen. Erst Verträge und Offlineweg dort absichern, dann zusammenführen. Auch der vorhandene \[Web-Compose\](/path/to/nostube/docker-compose.yml) und die \[Docker-Dokumentation\](/path/to/nostube/[DOCKER.md](http://DOCKER.md)) bleiben Ausgangsmaterial.

### Eigenständige Projekte und Releases bleiben erhalten

Jedes Projekt bleibt in seinem Repository mit eigenem Binary, Container, CLI, Dokumentation und Releasezyklus für eigenständigen Internetbetrieb. Das Creator-Paket ist ein zusätzlicher Consumer der gleichen Logik. Es kopiert keine angepassten Quellbäume und löst keine Projekte auf.

Das Muster ist `src/[lib.rs](http://lib.rs)` für Servicekern, typisierte Config, Router und Lifecycle; `src/[main.rs](http://main.rs)` als Standalone-Adapter für CLI/Env, Logging, Signale und Listener. Der Paket-Hauptserver ist eine weitere Composition Root: Er ordnet Module, Datenpfade, Sicherheit und Einstellungen der Instanz zu. Nicht jedes interne Modul muss öffentliche API werden; ein kleiner expliziter Schnitt ist wartbarer als alle Implementierungsdetails zu exportieren.

| Projekt / tatsächlicher Schnitt | Umbau im eigenen Repository | Verwendung durch das Paket |

|---|---|---|

| Almond: Module in [`main.rs`](http://main.rs), `create_app` öffentlich, Stateaufbau intern, kein [`lib.rs`](http://lib.rs) | Router/Stateaufbau und Configtyp in Bibliothek; Start-/Signal-/Allocatorverantwortung beim Binary lassen; Lebenszyklus der Hintergrundtasks explizit | Blossom-Service mit injizierter Config und eigenem Datenpfad |

| Bildproxy: [`lib.rs`](http://lib.rs) vorhanden, `create_router` und Transformmodule öffentlich | Bestehenden Schnitt stabilisieren; Umgebungslesen aus Kernpfaden herausziehen; Crypto-/Taskinitialisierung im Host koordinieren | Optional Router oder Transformfunktionen; Standalone-Proxy weiterhin separat veröffentlichen |

| Relay: Bibliothek mit `start_server`, eigene Runtime und Listener | Kontrollierte Start-/Stopgrenze; wenn vertretbar später vorhandene Runtime unterstützen; keine unmittelbare Axum-Router-Merge-Zusage | Anfangs interner Listener/Proxy; optional gebündelter Hilfsprozess bei hohem Integrationsaufwand |

| Nostube: Viteassets und Hono-Routen | Creator-Konfigvertrag und UI innerhalb des bestehenden Projekts; erforderliche Serverrouten gezielt adaptieren | Eingebettetes Webbuild mit passender Server-/UI-Vertragsversion |

Quellen: \[Almondmain\](/path/to/almond/src/[main.rs](http://main.rs)), \[Bildproxy-Bibliothek\](/path/to/nostube-imgproxy/src/[lib.rs](http://lib.rs)), \[Bildproxy-Router\](/path/to/nostube-imgproxy/src/server.rs:99), \[Relaystart\](/path/to/nostr-rs-relay/src/server.rs:783).

Paketkonfiguration hat Namespaces wie `instance`, `homepage`, `video_sources`, `search`, `blossom`, `relay`, optional `images`. Adapter bilden diese auf die jeweiligen Configtypen ab. Standalone-CLI/Env bleibt nutzbar; das Paket setzt keine globalen Envvariablen zur Laufzeit, um Bibliotheken zu steuern. Prozessweite Runtime, Signale, Allocator und TLSprovider haben einen klaren Besitzer. Gerade der Bildproxy dokumentiert explizit die rustls-Providerwahl: Module sollten nicht unabhängig widersprüchliche globale Defaults installieren.

Für Releases pinnt das Paket Crate-Versionen oder unveränderliche Gitrevisionen, Cargo.lock, UIbuild und gegebenenfalls Image-Digest des Hauptservers. Keine Abhängigkeit von beweglichen Branches oder `latest`. Die Projekte können unabhängig veröffentlichen; das Paket aktualisiert nach Build-/Vertrags-/Offlineprüfung. Eine Paketversion dokumentiert die freigegebenen Komponenten und Server-/UI-Vertragsversion. Das ist koordinierte Kompatibilität ohne erzwungenen gemeinsamen Releasezyklus.

## 4. Installation und Admin-Konfiguration

Der Installer liefert gepinnte Versionen, eingebettete Webassets einschließlich Browserworker und Datenpfad. Erststart erzeugt einen lokalen einmaligen Setupzugang. Im Browser richtet der Creator Titel, Creator-Liste, Video-Relayquellen, Ursprungshostnamen, lokalen Speicher, Zertifikatsstrategie und optional externe Veröffentlichung ein. Keine normale Produkteinstellung verlangt manuelles `.env`-/YAML-Editieren.

Der Host muss dennoch einen stabilen Datenpfad, Netzwerkzugang, gegebenenfalls DNS-/Domainrechte und Containerlaufzeit bereitstellen. Diese infrastrukturellen Voraussetzungen sind ehrlich vom Admin-Formular zu trennen. Der Einrichtungsassistent prüft sie und gibt konkrete Hinweise; er kann keine Rechte oder Routerkontrolle erfinden.

Adminbereiche: Identität/Design und Homepage, Creator-Auswahl und Videoquellen, Suchmodus, Speicherbelegung und Uploadlimits, Export/Backup, LAN/TLS, Modulaktivierung und lokale beziehungsweise externe Relay-/Blossom-Adressen, bewusst gewählte externe Relays/Mirrors, Updates. Der Assistent prüft das Creatorgerät auf Browser-/Codec-Fähigkeiten; Server-GPU und `/dev/dri` sind keine Voraussetzung.

Persistierte typisierte Konfiguration, Versionsnummer und atomarer Schreibvorgang bilden den gemeinsamen Vertrag. Servermodule bekommen Einstellungen injiziert. Die UI unterscheidet wirksame, gespeicherte und erst nach Neustart gültige Werte, validiert Änderungen und verlangt für Domain-/Speichermigration einen kontrollierten Ablauf. Zugangsdaten werden separat geschützt; normale Konfigexports enthalten keine Secrets.

Almond hat bereits einen Konfigurationseditor. Dieser erzeugt/importiert jedoch `.env` und besitzt noch keinen authentifizierten Live-Speicher-/Anwendungsweg. Felder und Validierung sind wiederverwendbar; das ist nicht schon die benötigte Adminverwaltung. \[Almond-Konfiguration\](/path/to/almond/src/[config.rs](http://config.rs)), \[bestehender Editor\](/path/to/almond/src/config-editor.html).

### Öffentliche JSON-Konfiguration und dynamische Oberfläche

Der Hauptserver liefert das eingebettete Webbuild sowie einen eigenen JSON-Endpunkt für öffentliche Einstellungen. Das Frontend lädt die Konfiguration vor Aufbau von Videoloaders und Suchdiensten. Admin-API und öffentlicher Konfigurationsvertrag sind getrennt: Passwort-/Schlüsselmaterial, Secrets und interne Hoststeuerung werden niemals an das öffentliche Frontend verteilt. Der Vertrag wird versioniert und unterscheidet fehlende Werte, deaktivierte Funktionen und bewusst leere Listen. Außerhalb des Instanzbetriebs bleiben normale Appdefaults bestehen.

Wenige zusammenhängende Optionen statt beliebiger Knopfschalter: App-/Homepage-Modus, Creator-Liste, zulässige Video-Relays, Suchmodus, Branding/Startansicht sowie passende Funktionsgruppen. Deaktivierte Suche bedeutet keine Suchoberfläche, keine aktive Suchroute und keine Suchrequests. Änderungen müssen alle relevanten Loader erreichen; bei Quellen-/Creatorwechsel werden laufende Abfragen beendet und der entsprechende Katalog/Index neu abgegrenzt.

Vorgeschlagene Priorität: unveränderliche Instanzgrenzen → zulässige Instanzdefaults beziehungsweise importierte Presetdefaults → erlaubte persönliche Präferenzen. Nicht alle Einstellungen sind gesperrt: etwa Wiedergabepräferenzen können persönlich bleiben. Öffentliche Presets können dagegen keine Videoquelle freischalten. Für Known Creator/Known Content entfällt zunächst die allgemeine Discovery-/Trustfilteroberfläche; Kennzeichnungen sensibler Inhalte bleiben unabhängig davon berücksichtigt.

Der bisherige Server erzeugt bereits Runtime-JavaScript und die Seite lädt dieses. Im aktuellen React-Code ist dessen Nutzung nicht verdrahtet. Vite selbst baut Assets/Worker; es ersetzt keine dynamische Instanzkonfiguration. Beim JSON-Endpunkt und Service Worker sicherstellen, dass APIantworten nicht als SPAfallback beantwortet oder dauerhaft als alte Konfigrevision gecacht werden. Web-/Serververtragsversion und wirksame Revision sichtbar prüfen. \[Runtimeausgabe\](/path/to/nostube/server/standalone.ts:5), \[Entwicklungsruntime\](/path/to/nostube/public/runtime-env.js), \[Vite-/PWA-Konfiguration\](/path/to/nostube/vite.config.ts).

### Startseite und spätere individuelle Gestaltung

Für eine einzelne Creatorinstanz ist die bestehende Profil-/Autorenseite ein sinnvoller auswählbarer Einstieg. Ein typisierter Startseitenmodus kann `creator-profile` mit ausgewähltem Creator oder `curated-feed` für mehrere Creator sein. Das ist ein Gestaltungsvorschlag, keine endgültige Festlegung. Keine beliebige unvalidierte Redirect-URL: das Ziel muss zur konfigurierten Creator-Auswahl passen. Navigation zu Upload, Sammlungen und Videos bleibt in der App möglich. \[Vorhandene Autorenseiten-Routen\](/path/to/nostube/src/AppRouter.tsx:212).

**Weitere erwogene Variante:** Die öffentliche Nutzung vollständig auf die konfigurierte Profilseite und ihre Videos/Sammlungen beschränken, statt nur die Startseite dorthin zu setzen. Dies ist noch keine beschlossene Anforderung. Zu klären ist, ob damit nur Navigation/Discovery oder auch direkte Routen gemeint sind und ob Video-Detailseiten, Player/Embeds und Mehrcreator-Kuration zugänglich bleiben. Der bestehende Upload-/Signingweg bleibt gemäß bisheriger Entscheidung erhalten; eine eingeschränkte öffentliche Oberfläche bedeutet weder entfernte Creator-Funktionen noch eine serverseitige Zugriffssperre allein durch versteckte Navigation.

Auch die vorhandene Profilseite muss im Instanzmodus die Videoquellenbegrenzung übernehmen; ein bloßer Redirect auf die normale Autorenseite beweist diese Grenze nicht. Bei mehreren Creatorn ist ein kuratierter Feed mit Creator-Auswahl als Startseite plausibel, ohne jetzt eine eigene neue UI erzwingen zu müssen.

Später: eigenes Logo, Favicon, Banner und Farben aus Admin-Konfiguration. Öffentlich ausgelieferte Brandingdaten referenzieren lokale Assets, und Farben werden als validierte Themevariablen angewandt. Die Branding-Assets liegen veränderlich im persistenten Datenpfad; sie verlangen nicht für jede Änderung ein neues Binary. Das unterscheidet sich von fest eingebetteten Standardassets. Freies JavaScript, beliebige Templates und ein Theme-/Pluginmarktplatz sind daraus nicht abgeleitet. PeerTube liefert hierfür Inspiration; eigener Brandingumfang darf zunächst zurückgestellt werden.

### Konfiguration anwenden und Neustarts vollständig im Web-Admin

Nach Erstinstallation sind alle normalen Betriebsaktionen über Web-Admin verfügbar, ausdrücklich Speichern/Anwenden von Einstellungen, Modulreload, Hauptserverneustart, browserseitiger Abbruch und Uploadabbruch, Backup/Restore im unterstützten Umfang und Statusdiagnose. Kein SSH, Terminal oder Maschinenlogin gehört zur normalen Bedienung. Technische Notfallrettung bei kaputtem OS, Hardwareausfall oder unerreichbarem Netzwerk bleibt eine andere Situation.

**Konfigurationsablauf:** Bearbeiten → typisierte Validierung einschließlich Modulregeln → Änderungsübersicht mit Reload-/Neustartbedarf → neue Konfigurationsrevision in temporäre Datei schreiben und dauerhaft sichern → atomar austauschen → kontrolliert anwenden → Bereitschaft prüfen → Revision als wirksam markieren. Die bisherige funktionierende Revision bleibt für Rückkehr erhalten. Atomarer Dateiaustausch verhindert Teilwrites, beweist jedoch weder die fachliche Gültigkeit noch erfolgreiches Anwenden.

Speichern, Reload und Neustart sind getrennte Aktionen mit sichtbarem Status; ein fehlgeschlagener Reload darf die zuletzt wirksame Config nicht unbemerkt ersetzen. Manche Änderungen sind live anwendbar, andere verlangen Neuaufbau eines Moduls oder des Hauptprogramms. Datenpfad-/Schemamigrationen sind zusätzlich eigene Operationen; alte Config allein macht sie nicht rückgängig. Secrets und Dateirechte werden beim Schreiben bewahrt, kein live überschriebenes `.env` als Steuerung.

**Neustart braucht einen externen Lebenszyklusbesitzer.** Der Webserver kann sich nach einem Exit nicht selbst wieder starten. Für zwei Container liefert der Installer eine geeignete Restart-Policy plus kontrollierten Start-/Recoverymodus im Image; beim Hauptbinary auf dem Host übernimmt systemd oder der passende Service-Manager. Ein sauberer Exit verlangt eine Policy, die auch diesen Fall wieder startet, nicht nur Abstürze. Ein Supervisor innerhalb der Hauptdistribution kann die letzte gute Konfiguration wählen und einen begrenzten Recoverydienst starten; dafür ist kein dritter Produktcontainer zwingend nötig.

Admin erstellt vor dem Restart eine dauerhafte Operations-ID, stoppt neue Serveruploads und beendet laufende Serveroperationen gemäß Drain-/Wiederaufnahmevertrag. Die Antwort wird vor dem Exit ausgeliefert. Die bereits geladene UI zeigt Unterbrechung, pollt nach Wiederkehr den Operationsstatus und bewahrt Auth-/CSRF-Sicherheit. Nach Neustart werden HTTP, Relay und Speicher gesondert geprüft. Ein Reload eines eingebetteten Moduls lässt die Admin-UI soweit möglich erreichbar; ein Neustart des Hauptprogramms verursacht eine angekündigte kurze Unterbrechung. Ein bereits geladener Browserworker kann dabei weiterrechnen, sofern der Browser aktiv bleibt und keine weiteren Assets nachladen muss; Uploads warten oder werden kontrolliert wiederholt. Das ist durch Tests zu belegen, keine pauschale Kontinuitätszusage. Bei Hostneustart ist die Unterbrechung länger und keine dauerhafte UI-Verfügbarkeit versprochen.

Wenn eine neue Konfig nicht startet, wählt der Supervisor nach begrenzten Versuchen die letzte gute Revision und startet einen minimalen authentifizierten Recoverymodus. Dieser erlaubt Diagnose, Rückkehr und Korrektur ohne normalen Public-/Uploadbetrieb. Änderungen an Hostnamen oder TLS benötigen Vorprüfung, die Anzeige der neuen Adresse und einen kontrollierten Übergang, gegebenenfalls temporär beide gültigen Zugänge. Eine alte Config kann ein inzwischen abgelaufenes Zertifikat nicht heilen; Zertifikats-Recovery muss separat funktionieren. Beschädigtes OS, unerreichbares Netz oder gestorbene Hardware sind nicht durch diesen Mechanismus lösbar.

**Kontrollgrenze:** Im ersten Paket gibt es keinen Serverworker zu steuern. Browserabbruch läuft über AbortController und gegebenenfalls `Worker.terminate()` im aktiven Tab. Der Server kann einen geschlossenen oder fremden Browserprozess nicht neu starten. Ein Admin-Status von einem anderen Gerät zeigt nur zuletzt gemeldeten Browserfortschritt, keine garantierte laufende Serveraufgabe. Für einen angebotenen Hostneustart braucht das Setup einen explizit begrenzten Service-Manager-Adapter, ohne allgemeinen Docker-Socket im Webserver oder beliebige Shellausführung.

Die Abnahme prüft normalen Adminrestart, Absturz, fehlerhafte neue Config und Rückkehr auf die letzte gute Revision sowie Browserverarbeitung während Serverrestart. Eine Restart-Policy allein ist keine Recoverystrategie und Docker-`unhealthy` allein startet einen Container nicht automatisch neu. Der konkrete Supervisor ist anhand des ersten Installationshosts festzulegen.

## 5. Speicher: API, Backend und Lebenszyklus

**Blossom ist die Dateischnittstelle, nicht die Festplatte und nicht die Archivpolitik.** Empfehlung: Almond mit lokalem Dateibackend auf einem persistenten Hostvolume. Öffentliche Ausgaben sind hashadressierte Blobs; private Originale werden nur bei bewusst gewählter serverseitiger Archivierung in einem getrennten geschützten Archivverzeichnis mit authentifiziertem Zugriff gespeichert. Die Browserverarbeitung verlangt keinen vorherigen Originalupload. Ein schwer erratbarer Hash ersetzt keine Zugriffsregel.

\`\`\`text

data/

  config/          Einstellungen und getrennt geschützte Secrets

  app-state/       nur bei Bedarf dauerhafte Upload-/Assetzuordnungen

  relay/           Relay-SQLite einschließlich WAL/Journal

  originals/       optionale private Archivoriginale

  blobs/           veröffentlichte MP4/HLS/Thumbnails/Untertitel

  staging/         unvollständige Uploads und geprüfte Übernahme

\`\`\`

Das ist ein vorgeschlagenes Layout; Almonds aktuelle Unterverzeichnisse können darunter erhalten bleiben. Ein eigener Datenträger ist sinnvoll. NAS als vom Host gemounteter Dateispeicher ist eine optionale Betriebsvariante nach Prüfung von Rechten, atomaren Operationen und Ausfallverhalten. SQLite bleibt bevorzugt auf lokaler Platte; ein beliebiges Netzdateisystem ist keine ungeprüfte Zusage.

Almond unterstützt tatsächlich ein natives S3-Backend, einschließlich Upload und Range-Zugriff. S3 ist deshalb eine vorhandene Option, kein erst zu erfindendes Feature. Externes S3 widerspricht dem lokalen Offline-Kernweg; ein eigener S3-Server fügt wiederum einen Dienst hinzu. Für die erste Creator-Installation ist Dateispeicher einfacher. Backup oder Mirror ist eine zusätzliche Kopie mit eigener Politik; die Auswahl eines S3-Backends beweist keine doppelte Haltbarkeit. \[S3-Implementierung\](/path/to/almond/src/services/native\_[storage.rs](http://storage.rs)), \[Dateibackend\](/path/to/almond/src/services/file\_[storage.rs](http://storage.rs)).

Archivdaten werden nicht automatisch bei Platzmangel verdrängt. Almond kann bei Kapazitätsgrenzen nach Cache auch alte Uploads entfernen; für dieses Produkt ist stattdessen neue Aufnahme zu begrenzen, mit freiem Speicher für Uploadstaging und verständlicher Fehlermeldung. `upload_max_age=0` deaktiviert nur altersbasierte Uploadlöschung, nicht jede andere Löschursache. Der standardmäßige Blob-Maximalwert von 500 MiB ist außerdem kein passender stiller Grenzwert für große Kameraoriginale. Optionale private Quelluploads erhalten eigene Limits. Browser-RAM ist davon getrennt zu prüfen. \[Limits/Retention\](/path/to/almond/src/config.rs:119), \[Kapazitätsbereinigung\](/path/to/almond/src/utils.rs:308).

Ein Assetmanifest verbindet gegebenenfalls archiviertes Original, Ausgabevarianten, HLS-Manifeste/Segmente/gegebenenfalls Schlüssel, Thumbnail, Untertitel und Nostr-Events. Ein gemeinsam referenzierter Blob darf nicht beim Löschen eines einzelnen Videos verschwinden. „Nicht mehr öffentlich“, Event-Löschanforderung und physische Dateilöschung sind unterschiedliche Operationen. Löschung auf fremden Relays/Mirrors kann die Instanz nicht garantieren.

## 6. Browserverarbeitung und lokale Veröffentlichung

1. Creator wählt eine lokale Datei im bestehenden Nostube-Uploadbereich. Die Quelle bleibt zunächst auf seinem Gerät; das Paket verlangt keinen Originalupload für die Verarbeitung.

2. Browser prüft Quellmetadaten und konkrete Decoder-/Encoderkonfiguration, bietet unterstützte MP4-/HLS-Varianten und zeigt erwartbare Gerätebelastung.

3. Der vorhandene lokale Browserworker verarbeitet die Datei mit Mediabunny und WebCodecs. Video/Canvas erzeugt das Thumbnail. Zusätzliche feste Bildgrößen können im Browser erzeugt und hochgeladen werden; ein serverseitiger Bildproxy ist keine Voraussetzung.

4. Fertige Ausgaben, HLS-Segmente und Manifeste sowie Thumbnail werden auf den eigenen Blossom-Ursprung hochgeladen. Der vorhandene Uploadmanager schreibt HLS-Referenzen auf die hochgeladenen URLs um. Vollständigkeit und lokale Referenzen müssen vor Publikation geprüft werden.

5. Optional archiviert der Creator das Original privat. Bestehendes `keepOriginal` fügt die Quelle dem Blossom-Upload hinzu; für private Archivierung ist deshalb ein anderer geschützter Zielpfad nötig. Nicht pauschal `keepOriginal` einschalten.

6. Creator prüft Vorschau und Metadaten und signiert lokal. Erfolg gilt nach positivem Relay-ACK und lesbarer Rückprüfung. Externe Verbreitung/Mirrors bleiben unabhängig und optional.

Der bestehende Thumbnail-Capture erzeugt WebP in Videoauflösung; zusätzliche kleinere Bildgrößen sind eine kleine neue Browseranpassung, keine schon belegte Resize-Pipeline. Der Creator-Modus muss außerdem die bestehenden Public-/Embed-Bildpfade von Proxy-Presets auf direkte lokale Bild-URLs umstellen. Nur ein Thumbnail hochzuladen entfernt bestehende imgproxy-Aufrufe nicht automatisch. \[Preset-URL-Erzeugung\](/path/to/nostube/src/lib/preset-thumbnail-url.ts:23).

**Konkrete Pipeline-Evidenz:** \[Workererzeugung\](/path/to/nostube/src/lib/browser-transcode-worker.ts:130) über `new URL(..., import.meta.url)`; \[Workerablauf\](/path/to/nostube/src/workers/browserTranscode.worker.ts); \[MP4-Konvertierung\](/path/to/nostube/src/lib/video-transcode.ts:348); \[HLS-Konvertierung\](/path/to/nostube/src/lib/video-transcode.ts:430); \[Upload und HLS-Referenzen\](/path/to/nostube/src/lib/browser-transcode-upload-manager.ts); \[Thumbnail-Capture\](/path/to/nostube/src/components/video-upload/ThumbnailSection.tsx:73).

### Offline-Bundling und Fähigkeitserkennung

Vite muss Workerdatei und sämtliche dynamischen Mediabunnychunks im eingebetteten Build ausliefern, ebenso Player, Fonts, Hashing-/WASMassets, falls deren Build solche Dateien erzeugt. Die geprüfte Konvertierung lädt Mediabunny als lokale Paketabhängigkeit; sie lädt keinen externen FFmpegdienst. Die nativen WebCodecs werden vom Browser/OS bereitgestellt: lokales JavaScript liefert nicht automatisch jeden Codec mit. Neu hinzukommende Codec-Erweiterungen dürfen keinen unbeabsichtigten CDN-/Netzdownload erfordern. Ein erster Start im frischen Browser bei gesperrtem WAN einschließlich dynamischer Imports ist der Nachweis; ein warmgelaufener Browsercache genügt nicht.

Der aktuelle Basistest prüft nur das Vorhandensein von VideoEncoder/VideoDecoder. `useVideoTranscode` fragt zusätzlich encodierbare HEVC/AVC-Codecs ab, fällt bei leerem Ergebnis oder Fehler aber auf `avc` zurück. Das darf keine Zusage sein: tatsächliche Quelle, Decoder, Audiopfad, Auflösung, Codec und Encoderkonfiguration müssen im Zielbrowser geprüft werden, auch im Worker. Die MP4-Konvertierung prüft `conversion.isValid` und versucht bei Bedarf eine andere Hardwarepräferenz; diese kann einen fehlenden Codec nicht ersetzen. \[Fähigkeitstest\](/path/to/nostube/src/lib/video-transcode.ts:335), \[Codecermittlung\](/path/to/nostube/src/hooks/useVideoTranscode.ts:59).

WebCodecs verlangt einen sicheren Kontext und ist nicht überall gleich verfügbar. \[VideoEncoder\]([https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder)). Nicht unterstützte Konfigurationen führen zu einer klaren Meldung und passenden Geräte-/Formatoptionen. Ein bereits kompatibles Video kann gegebenenfalls unverändert veröffentlicht werden; der vorhandene Bedarfstest unterstützt diese Unterscheidung. **Es gibt keinen automatischen Servertranscoder-Fallback.**

### RAM, CPU und Lebenszyklus

MP4 nutzt aktuell einen `BufferTarget`; HLS sammelt finalisierte Dateien in einer `Map`, bevor der Uploadmanager sie hochlädt. Eingabedateigröße ist deshalb kein verlässlicher Wert für Spitzen-RAM. Decodierte Frames, Encoderpuffer, mehrere Ausgabevarianten und Resultate tragen zusätzlich bei. Der Worker hält die UI besser bedienbar, verlagert aber keine CPU-/RAMlast auf den Server. MP4-Varianten werden im Worker nacheinander verarbeitet; HLS-Ausgaben können zusammen Speicher beanspruchen. Geräte-/Browsermatrix mit längeren realistischen Dateien und mehreren Varianten messen, sinnvolle Limits und zurückhaltende Defaults festlegen. Kein allgemeines Versprechen für beliebig große Kameraoriginale auf Smartphones.

Verarbeitung ist an Browserprozess und Tab gebunden. Hintergrundbetrieb, Geräteschlaf und mobiles Suspendieren können sie unterbrechen; Tab offen und Gerät verfügbar halten. Abbruch beendet den Worker und startet für weitere Aufgaben einen neuen. Ein Serverrestart ist dagegen keine Browser-Encoder-Wiederaufnahme. Fortschritt klar in „Browser verarbeitet“, „Upload“, „bereit“ und „veröffentlicht“ trennen.

### Tatsächliche Recovery-Grenzen

\[Browserjobstorage\](/path/to/nostube/src/lib/browser-transcode-job-storage.ts) speichert JSONstatus und Resultatverweise in localStorage. Aktive AbortController, Quelldatei, Encoderzustand und Buffer sind Laufzeitzustand. \[Draftbereinigung\](/path/to/nostube/src/lib/upload-draft-utils.ts) entfernt Laufzeitzustand aus den synchronisierten Drafts. **Ein gespeicherter Prozentwert ist kein Encodercheckpoint.**

Nach Tabverlust muss die UI unterbrochene Browseraufgaben erkennen. Quelle neu auswählen, Dateiidentität prüfen und betroffene Ausgabe neu verarbeiten; kein framegenaues Resume behaupten. Bereits vollständig hochgeladene, verifizierte Assets können weiterverwendet werden, sofern ihre Zuordnung dauerhaft vorhanden ist. Chunk-/Uploadprotokoll und wiederholbarer Upload sind separat zu prüfen; Metadatenspeicherung beweist kein automatisches Byte-Resume. Nicht hochgeladene Resultate ohne explizite Blobpersistenz sind verloren. IndexedDB/OPFS wäre zusätzliche Browserpersistenz mit Quota-/Evictiongrenzen, keine vorhandene garantierte Funktion und keine Pflicht im ersten Schnitt.

Server hält nur tatsächlich empfangene Dateien, Uploadsessions und gewünschte Upload-/Assetmetadaten. Browserinterne Zwischenstände sind keine persistenten Serverjobs. Gerätewechsel kann fertig hochgeladene Drafts zugänglich machen, aber keinen laufenden Encoder übernehmen.

### Spätere Erweiterung, außerhalb des ersten Pakets

Serververarbeitung mit Divico kann später ausdrücklich gewählt werden. Sein eigenständiges Projekt und seine Releases bleiben erhalten. Daraus entstehen jetzt weder Workeradapter, Container noch FFmpeg-/GPU-/Mint-/Discoveryabhängigkeiten und kein Implementierungsauftrag.

## 7. Authentifizierung, Signieren und öffentliche Grenzen

Admin-Authentifizierung und Nostr-Eventsignatur sind getrennt. Adminzugang schützt Instanzeinstellungen, private Archivdateien und Betriebsaktionen. Der vorhandene Nostr-Login in der App erlaubt lokales Signieren; ein Adminlogin ersetzt keinen Creator-Schlüssel. Ein offlinefähiger Adminzugang wird lokal eingerichtet, ohne externen Identity-Provider. Lokaler nsec-/NIP-49-Signer ist bereits vorhanden; optional eine lokale NIP-07-Erweiterung. Bunker und NIP-05 sind kein Pflichtweg.

Empfehlung: Schlüssel im Browser nur entsperrt im Speicher; bei gewünschter Persistenz verschlüsseltes NIP-49-Material beziehungsweise bewusst gewählte Erweiterung. Bestehendes `sessionStorage` für rohe nsec ist keine fertige Schlüsseltresorstrategie. Der Setupzugang wird nach Registrierung deaktiviert; Recovery/Export wird vor Offlinebetrieb geprüft. \[Login-Aktionen\](/path/to/nostube/src/hooks/useLoginActions.ts), \[Accountpersistenz\](/path/to/nostube/src/hooks/useAccountPersistence.ts).

Das eigene Relay akzeptiert nur Schreiber nach seiner ausdrücklich konfigurierten Allowlist; öffentliche Leser erhalten nur öffentliche Events. Angezeigte Creator bekommen dadurch keine Schreibrechte. Bei Nutzerkommentaren kann das Instanzrelay als zusätzliches Ziel eine Speicherung ablehnen; Erfolg auf Nutzerrelays und auf der Instanz getrennt berichten. Keine neue Pflicht zur Annahme beliebiger Besucherkommentare. Almond bekommt eine explizite Allowlist. Seine aktuelle Allowlist ist keine Autor-/Mandantentrennung: zugelassene Schlüssel können den Blobkatalog auflisten beziehungsweise löschen, ohne per-Blob-Besitzmodell. Das reicht als Baustein für einen Creator, nicht als Community-Rechtesystem. \[Relay-Allowlist\](/path/to/nostr-rs-relay/config.toml:166), \[Almond-Autorisierung\](/path/to/almond/src/services/authorization.rs:74), \[Blobliste\](/path/to/almond/src/handlers/list.rs:37).

## 8. LAN, TLS und bestehende CSP

Verschlüsselte Verbindungen und eine CSP existieren bereits. Die heutige CSP erlaubt für Verbindungen breite HTTP(S)/WS(S)-Ziele. Die Anpassung besteht in einer kontrollierten Instanzpolitik: lokale Ursprünge und ausdrücklich aktivierte externe Ziele, getrennte Anforderungen von Nostube-App und privatem Admin. Skripte, Fonts und Runtime-Konfiguration kommen aus dem Paket.

Die bestehende Meta-CSP und ein zusätzlicher Header wirken gemeinsam einschränkend; ein neuer Header erweitert die Meta-CSP nicht. Daher eine gemeinsame Generierung und einen vollständigen Fetch-/WebSocket-/Media-Trace prüfen. \[Aktuelle CSP\](/path/to/nostube/index.html:32).

**Zwei sinnvolle Zertifikatswege:**

- Eigene öffentliche Domain, lokales Split-DNS und Zertifikat über DNS-01. Lokale Server brauchen für DNS-01 keinen öffentlich zugänglichen Webport. Ersteinrichtung und Erneuerung brauchen aber Zugriff auf die passenden Dienste; Offlinebetrieb reicht nur so lange wie das vorhandene Zertifikat gültig ist. \[Let's Encrypt DNS-01\]([https://letsencrypt.org/docs/challenge-types/](https://letsencrypt.org/docs/challenge-types/)).

- Private CA und lokale Namen, etwa unter [`home.arpa`](http://home.arpa). Die CA muss auf jedem verwendeten Gerät vertraut werden; DNS muss eingerichtet werden. [`home.arpa`](http://home.arpa) bezeichnet einen reservierten Namensraum, keinen eingebauten DNS-Service. \[RFC 8375\]([https://www.rfc-editor.org/rfc/rfc8375.html](https://www.rfc-editor.org/rfc/rfc8375.html)), \[lokales CA-Vertrauen\]([https://caddyserver.com/docs/automatic-https](https://caddyserver.com/docs/automatic-https)).

Almond bringt bereits rustls und PEM-Zertifikatsunterstützung mit. Automatische CA-/ACME-Verwaltung mit Erneuerung und Adminstatus ist trotzdem zusätzlicher Produktumfang. Ein vorhandener Reverse Proxy darf für frühe Tests/Übergang helfen; ein Caddy-Container ist keine verpflichtende dritte Kernkomponente des Zielpakets. Selbstsignierte localhost-Entwicklungszertifikate sind keine Mehrgeräte-Lösung. \[Almond-TLS\](/path/to/almond/src/[tls.rs](http://tls.rs)).

Die Medien-URL-Policy behandelt private/Loopback-IP-Adressen bewusst restriktiv. Die konfigurierte lokale Instanz braucht eine enge Ausnahme für ihre tatsächlichen Ursprünge; beliebige URLs aus fremden Events bleiben untrusted. HLS-Segmente, Untertitel und Schlüssel müssen dieselbe Prüfung passieren. Serverseitige SSRF-Regeln nicht pauschal für das LAN abschalten. \[Medienpolicy\](/path/to/nostube/src/lib/media-url-policy.ts), \[Almond-Upstreamkandidaten\](/path/to/almond/src/services/upstream\_[candidates.rs](http://candidates.rs)).

## 9. Externe Laufzeitabhängigkeiten systematisch entfernen

`/runtime-env.js` ist vorhanden, aber der aktuelle React-Code konsumiert `__RUNTIME_ENV__` nicht. Der neue öffentliche JSON-Vertrag muss alle Video-Consumers erreichen, auch Metadatenserver und Embedplayer. Die Videoquellenbegrenzung darf nicht einfach auf alle Nostr-Funktionen übertragen werden: Profile und Interaktionen behalten ihre eigenen Relaywege. Für das Offlineprofil liegen alle für den Kernweg nötigen Daten lokal; optional externe Kommentare oder Profile sind keine versteckte Voraussetzung.

| Bereich | Lokale Creator-Politik |

|---|---|

| Videoabfragen | Ausschließlich konfigurierte Video-Relays und Creator; Eventhinweise/Presets/ persönliche Einstellungen erweitern diese Abfragen nicht |

| Profile und Nutzeraktionen | Eigene zweckbezogene Relaywege mit Nutzer-/Inbox-/Outboxrelays; Instanz-/Defaultrelay bei passenden Interaktionen zusätzlich berücksichtigen, Ablehnungen getrennt anzeigen |

| Offlineprofile und Presets | Erforderliche Profile/Seitengestaltung lokal; kein externes Preset als Startbedingung und kein Preset darf Videoquellen erweitern |

| Suche | Explizit aus/lokal/extern; lokal vollständiger abgegrenzter Metadatenkatalog; normale App behält lokale Fallbacklogik |

| Trust | Konfigurierte Creatoridentität lokal beurteilen; kein blockierender zentraler Score für den eigenen Katalog |

| Medien, Thumbnails, Avatare | Lokal gespeicherte Canvasthumbnails/übernommene Profilbilder direkt ausliefern; keine [imgproxy.nostu.be](http://imgproxy.nostu.be)-Pflicht |

| Metadaten/oEmbed/Embedplayer | Dieselbe lokale Konfiguration wie Hauptapp |

| Signieren | Lokaler Schlüsselpfad; kein Bunkerpflichtweg |

| Verarbeitung | Lokale Browserworker-/Mediabunnyassets; keine DVM-Discovery oder Serverworkerpfade im Creator-Kernweg |

| Assets/Telemetry | Gebündelte JS-/CSS-/Fonts-/Workerdateien; optionale Dienste deaktivierbar |

Quellen: \[Runtimeausgabe\](/path/to/nostube/server/standalone.ts:6), \[Appdefaults\](/path/to/nostube/src/App.tsx:41), \[Eventloader\](/path/to/nostube/src/nostr/core.ts:245), \[Serverrelay-Fallbacks\](/path/to/nostube/server/nostr.ts:6), \[Presetprovider\](/path/to/nostube/src/contexts/PresetContext.tsx), \[Suchclient\](/path/to/nostube/src/lib/search-client.ts), \[Trustfilter\](/path/to/nostube/src/hooks/useTrustFilter.tsx), \[Thumbnail-URLs\](/path/to/nostube/src/lib/preset-thumbnail-url.ts).

„Eine URL konfigurierbar machen“ genügt nicht, wenn ein leerer Wert wieder einen zentralen Default aktiviert. Der Offline-Trace muss diese unsichtbaren Rückwege nachweisen. Die derzeitige \[browserorientierte ADR\](/path/to/nostube/docs/adr/[0002-browser-based-transcoding.md](http://0002-browser-based-transcoding.md)) ist mit einem expliziten Creator-Serverprofil abzugleichen; keine stillschweigende Umkehr der Produktentscheidung.

### Lokale Mehrfeldsuche und vollständiger Videokatalog

NIP-50 definiert einen Suchfilter, aber keinen einheitlichen Algorithmus. Matching im Eventinhalt ist vorgesehen, weitere Felder optional; tokenisierte Mehrfeldsuche ist möglich, aber nicht verlässlich bei jedem Relay zugesagt. Deshalb braucht der Homepage-Kernweg keine NIP-50-Unterstützung. \[NIP-50\]([https://github.com/nostr-protocol/nips/blob/master/50.md](https://github.com/nostr-protocol/nips/blob/master/50.md)).

Die vorhandene \[MiniSearch-Konfiguration\](/path/to/nostube/src/hooks/useSearchVideos.ts:50) indiziert Titel, Beschreibung, Tags und Autorennamen mit Feldgewichtung, Präfix- und unscharfer Suche. Aktuell startet zunächst der externe Dienst, lokal wird erst nach dessen Fehler gesucht. Der lokale Pfad indiziert auch Events aus dem allgemeinen EventStore, fragt Relays ohne Creator-Allowlist ab, verwendet standardmäßig ein Limit von 1.000 Events und hat keine echte `loadMore`-Implementierung. Ein leerer `searchServiceUrl` fällt außerdem auf die zentrale URL zurück. Das ist eine vorhandene Grundlage, keine bereits vollständige Homepage-Suche.

Vorgeschlagener gemeinsamer Schnitt: Katalogloader → abgegrenzter Eventbestand → MiniSearch-Index → Ergebnisverarbeitung. In der normalen Nostube-App kann derselbe Kern Fallback sein; im Homepage-Modus startet er direkt, ohne externen Fehlerversuch. Modus `aus` startet keinen Suchdienst. Modus `extern` ist bewusst gewählt und öffnet den Suchumfang nur gemäß ausgewiesener Politik; die normale App verliert ihren heutigen Suchweg nicht.

Loader holt alle passenden Videometadaten von festgelegten Video-Relays und ausgewählten Creatorn über normale strukturierte Filter. Cursor-/Zeitpagination, EOSE, Relaylimits und Randfälle gleicher Zeitstempel brauchen einen belegten Vollständigkeitsvertrag. „Alle Videos“ bedeutet alle von diesen Quellen verfügbaren passenden Videos, keine globale Nostr-Vollständigkeit. Nicht nur gescrollte Feedseiten indexieren. Die Videodateien selbst werden nicht geladen.

Der Index wird nach Quellen-/Creatorauswahl abgegrenzt, nicht blind aus dem gemeinsamen globalen Cache aufgebaut. Quellevents vor Indexierung und Ergebnisausgabe gegen die erlaubten Autoren prüfen; allgemeine Profil-/Kommentarabfragen können den Store weiter füllen, dürfen aber keine fremden Videos in den Homepageindex einschleusen. Ersatzversionen, Löschereignisse, neue Videos, Profilnamen und Konfigurationswechsel aktualisieren Index und Ergebnisse. Ein Creator aus der Anzeige zu entfernen löscht dessen Dateien nicht automatisch.

UI unterscheidet „Katalog wird geladen“, „vollständig gemäß Quellenvertrag“, „teilweise verfügbar“ und „keine Treffer“. Relayfehler oder aktuelles Seitenlimit dürfen nicht als vollständige erfolglose Suche erscheinen. Ladezeit und RAM mit wachsenden Katalogen messen. Ein zusätzlicher Serverindex bleibt spätere ausdrückliche Option, keine Voraussetzung für den ersten Paketschnitt.

### Inspiration aus PeerTube: berücksichtigen, nicht pauschal übernehmen

Recherche in offizieller Dokumentation und aktuellem Entwicklungsbranch am 6. Oktober 2026. Abgeleitete Prioritäten für dieses Konzept:

| Inspiration | Anwendung auf Nostube | Priorität |

|---|---|---|

| Homepage und Startansicht | Creator-Liste, Startmodus; bestehende Profilseite als mögliche Startseite | Erster Schnitt / Gestaltungsvorschlag |

| Eigenes Branding | Eigenes Logo, Farben, optional Favicon/Banner | Wichtige spätere Erweiterung, zunächst zurückstellbar |

| Getrennte externe Suche/Remote-URI-Suche | Suchmodus ausdrücklich; keine Umgehung der Videoauswahl durch versteckte Loader | Erster Schnitt |

| Upload-/Gesamtkontingente | Maximaldatei, Gesamtspeicher, Reserve; Ausgabevarianten mitzählen | Erster Schnitt |

| Sichtbarkeits-/Kommentar-/Download-/Lizenzdefaults | Passende Uploaddefaults prüfen; keine Scheinprivatsphäre durch versteckte Links oder Buttons | Gezielte Auswahl, noch kein vollständiger Featureauftrag |

| Sensible Inhalte und Wiedergabevorgaben | Kennzeichnungen unabhängig von Known Creator; persönliche Präferenzen von Instanzgrenzen unterscheiden | Schlanker erster Schnitt |

| Hinweisbanner | Wartung/Uploadstörung/Communityhinweis | Optional kleiner Zusatz |

| Follow versus lokale Redundanz | Angezeigte Creator und tatsächlich lokal gespiegelte Assets trennen | Grundlage; Spiegelautomatik später |

| Registrierung, Moderation, Plugins, Live/Transkription | Gemeinsame Rechte/erweiterte Plattformfunktionen | Später, keine neue Pflicht |

Quellen: \[PeerTube-Konfiguration\]([https://docs.joinpeertube.org/admin/configuration](https://docs.joinpeertube.org/admin/configuration)), \[Branding und Anpassung\]([https://docs.joinpeertube.org/admin/customize-instance](https://docs.joinpeertube.org/admin/customize-instance)), \[Quotas und Nutzerverwaltung\]([https://docs.joinpeertube.org/admin/managing-users](https://docs.joinpeertube.org/admin/managing-users)), \[Follows/Redundanz\]([https://docs.joinpeertube.org/admin/following-instances](https://docs.joinpeertube.org/admin/following-instances)), \[Systemkonfiguration\]([https://docs.joinpeertube.org/maintain/configuration](https://docs.joinpeertube.org/maintain/configuration)), \[aktuelle Defaultkonfiguration\]([https://github.com/Chocobozzz/PeerTube/blob/develop/config/default.yaml](https://github.com/Chocobozzz/PeerTube/blob/develop/config/default.yaml)).

PeerTube-Webadmin deckt nicht alle Systemoptionen ab; einige bleiben dateibasiert. Wir übernehmen deshalb nicht dessen Bediengrenze: normale Betriebsaktionen bleiben bei uns im Webadmin. Private PeerTube-Videos sind außerdem keine sofort verfügbare Eigenschaft öffentlicher Nostr-Events und Blossom-Blobs. Private Archivoriginale sind eine eigene serverseitige Zugriffsfläche.

## 10. Neustart, Backup und optionales Synchronisieren

Gesichert werden Konfiguration/Recovery, optionaler Upload-/Verwaltungszustand, Relaydaten, private Originale nach gewählter Politik und öffentliche Assetgraphen. Live-SQLite über Backup-API sichern oder kontrolliert anhalten und Journale berücksichtigen. Dateimanifest und DBsnapshot müssen zusammenpassen. Ein erfolgreicher Backupjob ist erst durch einen Restore auf einer frischen Instanz praktisch belegt.

Bei Neustart erkennt das Hauptprogramm unvollständige Serveruploads und bereits gespeicherte Ausgaben. Der Browser erkennt unterbrochene Verarbeitung getrennt; der Server kann deren Encoderzustand nicht rekonstruieren. Gesundheitsstatus trennt „öffentliche Seite erreichbar“, „Relay liest/schreibt“, „Speicher bereit“ und „Creator-Browser unterstützt die gewählte Verarbeitung“. Compose-Startreihenfolge allein garantiert keine Bereitschaft. \[Compose-Bereitschaft\]([https://docs.docker.com/compose/how-tos/startup-order/](https://docs.docker.com/compose/how-tos/startup-order/)).

Externe Synchronisierung ist eine dauerhafte Outbox mit Ziel, Status und Retry. Medien nur auf explizit ausgewählte Blossom-Server spiegeln und Hash/Größe bestätigen. Eventverbreitung getrennt beobachten. Für spätere Verbreitung offline erzeugter Events bleiben signierte Events und offene Aufträge lokal erhalten. Öffentliche Medien-URLs von einer ausschließlich lokalen Namenswelt auf einen extern nutzbaren Ursprung umzustellen ist eine bewusste Publikations-/Adressentscheidung, keine beliebige URL-Ersetzung.

## 11. Vorgehen zur Validierung des Vorschlags

1. **Bestehende Integration als Basis:** Teststack und aktuellen Webcontainer als Basis verwenden, daraus einen Creator-Testpfad ohne Divico oder Server-Video-Worker wählen; LAN-Adressen und tatsächliche Thumbnail-/Runtime-Verträge bewusst setzen. JSON-Konfigurationsvertrag, unveränderten Nostube-Uploadweg, Homepage-Kataloggrenzen und Offline-Abnahmetest definieren.

2. **Einbettbarkeit prüfen:** Kleiner Rust-Buildnachweis für Hauptserver, Almond-Bibliothek, Relay-Lebenszyklus, SQLite-/TLS-Abhängigkeiten und eingebettete UI einschließlich Browserworker-/Mediabunnychunks. Noch keine vollständige Neuentwicklung.

3. **Lokalen vertikalen Weg herstellen:** Lokale Datei → Browser-Fähigkeitsprüfung → vorhandener Browserworker und Canvasthumbnail → lokaler Blossom-Upload → vollständige Assets → lokales Signing → bestätigtes Event → frischer Zuschauerbrowser.

4. **Admin und Betrieb vervollständigen:** Erststart, Admin-Anwenden und Neustarts, TLS/DNS-Prüfungen, Upload-Speicherreserve, Supervisor/Recovery, Browserunterbrechungen und konsistenter Restore.

5. **Offlineabnahme des lokalen Profils auf zwei Geräten:** WAN gesperrt, Host neu gestartet, frischer Browser; Fähigkeitsprüfung, dynamische Assets, MP4/HLS und Thumbnail im kalten Browser testen. Zusätzlich Codecfehler, RAMgrenzen, Abbruch/Tabverlust, Serverrestart während Verarbeitung/Upload, DNS/Trust und Platzmangel verständlich behandeln. Verarbeitung auf einem ausdrücklich unterstützten Creatorgerät nachweisen; Zuschauergerät benötigt nur Wiedergabefähigkeit.

6. **Funktions-/Quellengrenzen prüfen:** Suchmodus aus startet keine Requests; Homepage-Videos bleiben trotz persönlicher Presets, Eventhints und zusätzlicher Kommentar-/Profilrelays im erlaubten Katalog. Vollständige Suche, Ersatz-/Löschereignisse und Creatorwechsel prüfen.

7. **Optional extern anbinden:** Bewusst konfigurierte externe Creator/Videoquellen, Outbox und Mirrors validieren. Gewöhnliche Nutzerinteraktionen behalten ihre Relaywege; lokale Kernabnahme bleibt unabhängig. Gemeinsame Community-Verwaltungsrechte und größere Server-Suche bleiben spätere Entscheidungen.

Ergebnis dieser Reihenfolge ist zunächst ein belegter Kernweg und danach eine kompakte Verpackung. Der vorhandene Teststack erfüllt dafür seinen vorgesehenen Zweck; er wird nicht als mangelhaftes Produktionsprodukt bewertet.

## 12. Entscheidungen, die vor einer Umsetzung feststehen sollten

Vereinbarte Basis und empfohlene Defaults: eigene Homepage mit Creator-Liste, Mehrcreator-Kuration von Anfang an im Modell, bestehender Nostube-Uploadweg, privater Instanzadmin, öffentliche JSON-Konfiguration, getrennte Video-/Interaktionsquellen, direkte lokale Mehrfeldsuche mit Ziel vollständiger Katalog, Hauptprogramm ohne Server-Video-Worker, Browser-Transcoding, lokal hochgeladenes Canvasthumbnail, lokales Dateibackend, zusätzliche Verwaltungs-SQLite nur bei nachgewiesenem Bedarf, lokal entsperrter Signer, eigene lokale Datei statt remote URL, keine automatische Archivlöschung, externe Dienste opt-in.

Noch konkret zu entscheiden: bevorzugter Installationshost und passender Supervisor/Service-Manager; öffentlicher Domainbetrieb oder LAN/Private-CA als erster Setupweg; erstes Standardprofil lokal oder extern; unterstützte Creator-Browser-/Gerätekonfigurationen und gemessene Medienlimits; optionale Aufbewahrung privater Originale; URLstrategie für spätere externe Verbreitung; Relay-Einbettung nach Buildnachweis. Noch abzuleiten ist zudem, welche PeerTube-inspirierten Defaults/Hinweisbanner in die erste UI gehören, welcher Startmodus zuerst umgesetzt wird und wann individuelles Branding folgt. Diese Details verfeinern das Konzept, statt schon eine Implementierung freizugeben.

**Kerngedanke:** Autonomie entsteht durch geschlossene lokale Daten- und Kontrollwege. Browserverarbeitung und wenige Serverkomponenten vereinfachen den Betrieb; sie beweisen allein keine Unabhängigkeit von externen Defaults, Schlüsseldiensten, Zertifikaten oder Datenquellen.

## 13. Implementierter Erststart

Ohne vorbereitete Dateien: `nostube-server` legt im Arbeitsverzeichnis `data/` an.
Alternativ, auch für mehrere lokale Instanzen:

```sh
cargo run -- --data tmp2 --port 9376 --http-port 0
```

- `--data <Verzeichnis>`: Daten und `config.toml`; Standard `data`.
- `--bind <IP>`: Bindadresse beider Listener; Standard `0.0.0.0`.
- `--port <Port>`: HTTPS für Frontend, Admin, Relay und Blossom; Standard aus der Config, beim Erststart 443.
- `--http-port <Port>`: separater HTTP-Listener ausschließlich für CA-Onboarding und HTTPS-Weiterleitung; 0 deaktiviert ihn, Erststart-Standard 80. Ist er belegt oder nicht bindbar, läuft HTTPS mit einer Warnung weiter. HTTPS-Bindefehler nennen Adresse und Port und brechen den Start ab.

Beim Erststart werden die gewählten Ports, die lokale `.local`-Origin und die eigenen Relay-URLs einschließlich HTTPS-Port gespeichert. Vorhandene Config-Dateien werden nicht überschrieben; CLI-Listener-Overrides ändern deren kanonische Origin nicht. Hinter einem Proxy muss diese weiterhin die öffentliche Adresse enthalten. Aktuell implementiert ist `local-ca`; `--http-port 0` schaltet nicht TLS ab.

Solange kein Admin registriert ist, zeigt das Log einen vollständigen Setup-Link und einen Terminal-QR-Code mit demselben einmaligen Token. Der Token steht im URL-Fragment, nicht im HTTP-Query: Die Setup-Seite übernimmt ihn ins Formular und entfernt ihn aus der Adresszeile. Link und QR-Code sind Zugangsdaten; Logs nicht weitergeben. Passwort festlegen, danach Creator, zugelassene Schreiber und übrige Instanzwerte im Studio unter `/studio/` eintragen (`/admin` leitet dorthin weiter). Ohne zugelassene Schreiber sind Upload und Mirror deaktiviert. Admin-Pubkey-Bindung bleibt optional.

`/admin` und `/admin/*` gehören ausschließlich dem Server, auch bei Navigation aus dem Instanz-Frontend und mit aktivem Service Worker. Unbekannte Admin-Unterpfade liefern 404 statt des Frontends. Der normale Nostube-Build behält seine eigene Admin-Route.

Vor Zugriff von einem anderen Gerät muss die Instanz-CA vertraut werden: über den aktivierten HTTP-Onboarding-Listener (`http://<Host>:<HTTP-Port>/ca`) oder durch Import von `<data>/tls/ca.pem`. `--bind 127.0.0.1` erlaubt nur Zugriffe auf dem Host, nicht per Handy-QR-Code. Apply beendet den Prozess; ohne Supervisor anschließend manuell neu starten.

