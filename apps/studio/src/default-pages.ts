/**
 * The standard privacy policy: what the Nostube site and server do with a visitor's data, in the
 * languages of the site. It describes this software only (no cookies, no tracking, what a sign-in,
 * a like, a comment or a zap sends where) and names the operator through the imprint. Every
 * sentence is a fact of the code (apps/site, packages/widgets, apps/server), so a change there
 * means a change here. The one instance setting it depends on is the list of profile lookup relays.
 */

/** Heading first, then the paragraphs of one section. */
type Section = [heading: string, ...paragraphs: string[]]

interface Policy {
  sections: Section[]
  /** After a sign-in, when the profile is looked up on this server's relay only. */
  profileLocal: string
  /** The same, with public lookup relays (`{relays}`). */
  profileOpen: string
}

const en: Policy = {
  sections: [
    [
      'Responsible party',
      'This website is run by the person or organisation named in the imprint. Contact them with any question about this policy or about your data.',
    ],
    [
      'Short version',
      'This website sets no cookies for visitors and uses no advertising, analytics or tracking. It loads no fonts, scripts or embedded players from third parties. The server software keeps no access log and does not store the IP addresses of visitors. What you publish yourself (likes, comments) is public by design, see below.',
    ],
    [
      'When you visit',
      'Your browser loads this website and its settings from this server. It also connects to the Nostr relay of this server to read videos, comments and likes. Videos, thumbnails and images are loaded from the addresses stored in the video data. These are normally on this server, but they can point to another host, which then sees your IP address like any web server does. You do not need an account to watch or read.',
    ],
    [
      'What is stored in your browser',
      "The website sets no cookies. It uses your browser's local storage and cache for: your language choice, your confirmation that you are 18 or older, the volume and loop setting of the player, a copy of the latest site settings, a cache of received Nostr events and a short-lived cache of zap totals. If you sign in, your public key and the sign-in method are stored too. This data stays in your browser and is not sent to the operator. You can delete it in your browser's settings (site data).",
    ],
    [
      'Signing in (optional)',
      "You only need to sign in to like, comment or zap. With a browser extension, your key stays in the extension. If you enter a private key (nsec) or an encrypted key (ncryptsec) with its password, it is used only in your browser, kept only while that browser tab is open and never sent to the server. With a remote signer (Nostr Connect, bunker), the connection data and a connection key are stored in your browser, and the website talks to the signer through the relays named in the connection address, or through this server's relay when you scan a QR code. Those relays can see that a connection takes place.",
    ],
    [
      'Your profile after signing in',
      'After you sign in, the website looks up your public profile (name and picture) and your relay list so that it can show who you are. {profile}',
    ],
    [
      'Likes and comments are public',
      'If you like a video, write a comment, reply or delete a comment, your browser publishes a signed Nostr event: your public key, the text, the time, the video it refers to and the note "client: nostube". It is sent to this server\'s relay, stored in its database and readable by anyone, also outside this website. Do not write anything that should stay private. If you delete your own comment, this server deletes it, but copies that other people have already made cannot be recalled.',
    ],
    [
      'Zaps (Lightning tips)',
      "If you zap a video, your browser asks the Lightning provider of the creator (its domain is part of the creator's Lightning address) for an invoice and sends it a signed zap request with your public key, the amount and, if you choose, a point in the video. You pay in your Lightning wallet; this website and its operator receive no payment data. The provider publishes a public receipt of the zap on Nostr and has its own privacy policy.",
    ],
    [
      'Links to other websites',
      "Some links lead away from this website, for example to other people's profiles or videos on services the operator chose, or to web addresses in comments. When you follow such a link, the privacy policy of the other website applies.",
    ],
    [
      'What the server keeps',
      'The server stores the videos and files the creators published and the likes and comments visitors published (see above) in its database. It writes no access log of page views. Only the operator signs in to the administration; a session cookie is set for the operator for this, never for visitors. If a reverse proxy or hosting provider sits in front of the server, it may record connection data such as IP addresses in its own logs; that is outside this software.',
    ],
    [
      'Your rights',
      'Depending on the law that applies to you, you may ask the operator for information about data stored about you, for correction or deletion, and you may object to processing or complain to a data protection authority. About visitors, the server itself stores only what they publish themselves, so deleting your own comments yourself (see above) is the quickest way. You reach the operator through the imprint.',
    ],
  ],
  profileLocal: "For this it asks only this server's relay; no public relay is asked.",
  profileOpen:
    "For this it asks this server's relay, the public relays {relays} and the relays you list in your own profile. Those relays see your IP address and your public key.",
}

const de: Policy = {
  sections: [
    [
      'Verantwortlich',
      'Diese Website wird von der Person oder Organisation betrieben, die im Impressum genannt ist. Bei Fragen zu dieser Erklärung oder zu Ihren Daten wenden Sie sich an sie.',
    ],
    [
      'Kurzfassung',
      'Diese Website setzt für Besucher keine Cookies und verwendet weder Werbung noch Analyse- oder Tracking-Werkzeuge. Sie lädt keine Schriftarten, Skripte oder eingebetteten Player von Dritten. Die Server-Software führt kein Zugriffsprotokoll und speichert keine IP-Adressen von Besuchern. Was Sie selbst veröffentlichen (Likes, Kommentare), ist von vornherein öffentlich, siehe unten.',
    ],
    [
      'Beim Besuch',
      'Ihr Browser lädt diese Website und ihre Einstellungen von diesem Server. Außerdem verbindet er sich mit dem Nostr-Relay dieses Servers, um Videos, Kommentare und Likes zu lesen. Videos, Vorschaubilder und Bilder werden von den Adressen geladen, die in den Videodaten stehen. Meist liegen sie auf diesem Server, sie können aber auf einen anderen Host zeigen; dieser sieht dann wie jeder Webserver Ihre IP-Adresse. Zum Ansehen und Lesen brauchen Sie kein Konto.',
    ],
    [
      'Was in Ihrem Browser gespeichert wird',
      'Die Website setzt keine Cookies. Sie nutzt den lokalen Speicher und den Cache Ihres Browsers für: Ihre Sprachwahl, Ihre Bestätigung, dass Sie mindestens 18 Jahre alt sind, Lautstärke und Wiederholungs-Einstellung des Players, eine Kopie der zuletzt geladenen Website-Einstellungen, einen Zwischenspeicher empfangener Nostr-Ereignisse und einen kurzlebigen Zwischenspeicher für Zap-Summen. Wenn Sie sich anmelden, werden außerdem Ihr öffentlicher Schlüssel und die Anmeldeart gespeichert. Diese Daten bleiben in Ihrem Browser und werden nicht an den Betreiber gesendet. Sie können sie in den Einstellungen Ihres Browsers löschen (Websitedaten).',
    ],
    [
      'Anmeldung (optional)',
      'Sie müssen sich nur anmelden, um zu liken, zu kommentieren oder zu zappen. Mit einer Browser-Erweiterung bleibt Ihr Schlüssel in der Erweiterung. Geben Sie einen privaten Schlüssel (nsec) oder einen verschlüsselten Schlüssel (ncryptsec) mit Passwort ein, wird er nur in Ihrem Browser verwendet, nur so lange gehalten, wie dieser Browser-Tab geöffnet ist, und nie an den Server gesendet. Bei einem Remote-Signer (Nostr Connect, Bunker) werden die Verbindungsdaten und ein Verbindungsschlüssel in Ihrem Browser gespeichert; die Website spricht mit dem Signer über die Relays aus der Verbindungsadresse, beim Scannen eines QR-Codes über das Relay dieses Servers. Diese Relays können sehen, dass eine Verbindung besteht.',
    ],
    [
      'Ihr Profil nach der Anmeldung',
      'Nach der Anmeldung sucht die Website Ihr öffentliches Profil (Name und Bild) und Ihre Relay-Liste, um anzuzeigen, wer Sie sind. {profile}',
    ],
    [
      'Likes und Kommentare sind öffentlich',
      'Wenn Sie ein Video liken, einen Kommentar schreiben, darauf antworten oder einen Kommentar löschen, veröffentlicht Ihr Browser ein signiertes Nostr-Ereignis: Ihren öffentlichen Schlüssel, den Text, die Zeit, das betroffene Video und den Hinweis „client: nostube“. Es wird an das Relay dieses Servers gesendet, in dessen Datenbank gespeichert und ist für alle lesbar, auch außerhalb dieser Website. Schreiben Sie nichts, was privat bleiben soll. Löschen Sie Ihren eigenen Kommentar, löscht ihn dieser Server; Kopien, die andere bereits angefertigt haben, lassen sich aber nicht zurückholen.',
    ],
    [
      'Zaps (Lightning-Trinkgelder)',
      'Wenn Sie ein Video zappen, fragt Ihr Browser beim Lightning-Anbieter der Urheberin oder des Urhebers (dessen Domain steckt in der Lightning-Adresse) eine Rechnung an und sendet ihm eine signierte Zap-Anfrage mit Ihrem öffentlichen Schlüssel, dem Betrag und, wenn Sie das wählen, einer Stelle im Video. Sie bezahlen in Ihrer Lightning-Wallet; diese Website und ihr Betreiber erhalten keine Zahlungsdaten. Der Anbieter veröffentlicht einen öffentlichen Beleg des Zaps auf Nostr und hat eine eigene Datenschutzerklärung.',
    ],
    [
      'Links zu anderen Websites',
      'Einige Links führen von dieser Website weg, zum Beispiel zu Profilen oder Videos anderer Personen bei Diensten, die der Betreiber ausgewählt hat, oder zu Webadressen in Kommentaren. Folgen Sie einem solchen Link, gilt die Datenschutzerklärung der anderen Website.',
    ],
    [
      'Was der Server speichert',
      'Der Server speichert die Videos und Dateien, die die Urheber veröffentlicht haben, und die Likes und Kommentare, die Besucher veröffentlicht haben (siehe oben), in seiner Datenbank. Er schreibt kein Zugriffsprotokoll der Seitenaufrufe. Nur der Betreiber meldet sich in der Verwaltung an; dafür wird ein Sitzungs-Cookie für den Betreiber gesetzt, nie für Besucher. Steht ein Reverse-Proxy oder ein Hosting-Anbieter vor dem Server, kann dieser Verbindungsdaten wie IP-Adressen in eigenen Protokollen erfassen; das liegt außerhalb dieser Software.',
    ],
    [
      'Ihre Rechte',
      'Je nach dem für Sie geltenden Recht können Sie vom Betreiber Auskunft über gespeicherte Daten, Berichtigung oder Löschung verlangen, der Verarbeitung widersprechen oder sich bei einer Datenschutzbehörde beschweren. Der Server selbst speichert über Besucher nur, was diese selbst veröffentlichen; am schnellsten löschen Sie daher Ihre eigenen Kommentare selbst (siehe oben). Den Betreiber erreichen Sie über das Impressum.',
    ],
  ],
  profileLocal:
    'Dafür wird nur das Relay dieses Servers gefragt; kein öffentliches Relay wird angefragt.',
  profileOpen:
    'Dafür fragt sie das Relay dieses Servers, die öffentlichen Relays {relays} und die Relays, die Sie in Ihrem eigenen Profil angeben. Diese Relays sehen Ihre IP-Adresse und Ihren öffentlichen Schlüssel.',
}

const fr: Policy = {
  sections: [
    [
      'Responsable',
      "Ce site est exploité par la personne ou l'organisation indiquée dans les mentions légales. Adressez-lui toute question sur cette politique ou sur vos données.",
    ],
    [
      'En bref',
      "Ce site ne dépose aucun cookie chez les visiteurs et n'utilise ni publicité, ni outil d'analyse ou de suivi. Il ne charge ni polices, ni scripts, ni lecteurs intégrés provenant de tiers. Le logiciel du serveur ne tient aucun journal d'accès et ne conserve pas l'adresse IP des visiteurs. Ce que vous publiez vous-même (mentions « j'aime », commentaires) est public par nature, voir plus bas.",
    ],
    [
      'Lors de votre visite',
      "Votre navigateur charge ce site et ses paramètres depuis ce serveur. Il se connecte aussi au relais Nostr de ce serveur pour lire les vidéos, les commentaires et les mentions « j'aime ». Les vidéos, vignettes et images sont chargées depuis les adresses indiquées dans les données de la vidéo. Elles se trouvent en général sur ce serveur, mais peuvent pointer vers un autre hôte, qui voit alors votre adresse IP comme tout serveur web. Aucun compte n'est nécessaire pour regarder ou lire.",
    ],
    [
      'Ce qui est enregistré dans votre navigateur',
      "Le site ne dépose aucun cookie. Il utilise le stockage local et le cache de votre navigateur pour : votre choix de langue, votre confirmation d'avoir 18 ans ou plus, le volume et le réglage de lecture en boucle du lecteur, une copie des derniers paramètres du site, un cache des événements Nostr reçus et un cache de courte durée des totaux de zaps. Si vous vous connectez, votre clé publique et la méthode de connexion sont aussi enregistrées. Ces données restent dans votre navigateur et ne sont pas envoyées à l'exploitant. Vous pouvez les supprimer dans les réglages de votre navigateur (données de sites).",
    ],
    [
      'Connexion (facultative)',
      "Vous n'avez besoin de vous connecter que pour aimer, commenter ou zapper. Avec une extension de navigateur, votre clé reste dans l'extension. Si vous saisissez une clé privée (nsec) ou une clé chiffrée (ncryptsec) avec son mot de passe, elle n'est utilisée que dans votre navigateur, conservée seulement tant que cet onglet est ouvert et jamais envoyée au serveur. Avec un signataire distant (Nostr Connect, bunker), les données de connexion et une clé de connexion sont enregistrées dans votre navigateur, et le site dialogue avec le signataire via les relais indiqués dans l'adresse de connexion, ou via le relais de ce serveur si vous scannez un code QR. Ces relais peuvent voir qu'une connexion a lieu.",
    ],
    [
      'Votre profil après la connexion',
      "Après la connexion, le site recherche votre profil public (nom et image) et votre liste de relais afin d'afficher qui vous êtes. {profile}",
    ],
    [
      "Les mentions « j'aime » et les commentaires sont publics",
      "Si vous aimez une vidéo, écrivez un commentaire, répondez ou supprimez un commentaire, votre navigateur publie un événement Nostr signé : votre clé publique, le texte, l'heure, la vidéo concernée et la mention « client: nostube ». Il est envoyé au relais de ce serveur, enregistré dans sa base de données et lisible par tous, y compris en dehors de ce site. N'écrivez rien qui doive rester privé. Si vous supprimez votre propre commentaire, ce serveur le supprime, mais les copies déjà faites par d'autres ne peuvent pas être rappelées.",
    ],
    [
      'Zaps (pourboires Lightning)',
      "Si vous zappez une vidéo, votre navigateur demande une facture au fournisseur Lightning du créateur (son domaine fait partie de l'adresse Lightning du créateur) et lui envoie une demande de zap signée avec votre clé publique, le montant et, si vous le choisissez, un moment de la vidéo. Vous payez avec votre portefeuille Lightning ; ce site et son exploitant ne reçoivent aucune donnée de paiement. Le fournisseur publie sur Nostr un reçu public du zap et a sa propre politique de confidentialité.",
    ],
    [
      "Liens vers d'autres sites",
      "Certains liens mènent hors de ce site, par exemple vers des profils ou des vidéos d'autres personnes sur des services choisis par l'exploitant, ou vers des adresses web dans des commentaires. Si vous suivez un tel lien, la politique de confidentialité de l'autre site s'applique.",
    ],
    [
      'Ce que le serveur conserve',
      "Le serveur conserve dans sa base de données les vidéos et fichiers publiés par les créateurs ainsi que les mentions « j'aime » et commentaires publiés par les visiteurs (voir plus haut). Il n'écrit aucun journal d'accès des pages consultées. Seul l'exploitant se connecte à l'administration ; un cookie de session est alors déposé pour l'exploitant, jamais pour les visiteurs. Si un proxy inverse ou un hébergeur se trouve devant le serveur, il peut enregistrer des données de connexion telles que les adresses IP dans ses propres journaux ; cela échappe à ce logiciel.",
    ],
    [
      'Vos droits',
      "Selon le droit qui vous est applicable, vous pouvez demander à l'exploitant des informations sur les données conservées à votre sujet, leur rectification ou leur suppression, vous opposer à un traitement ou saisir une autorité de protection des données. Sur les visiteurs, le serveur lui-même ne conserve que ce qu'ils publient eux-mêmes ; le plus rapide est donc de supprimer vous-même vos commentaires (voir plus haut). Vous joignez l'exploitant via les mentions légales.",
    ],
  ],
  profileLocal:
    "Pour cela, il n'interroge que le relais de ce serveur ; aucun relais public n'est interrogé.",
  profileOpen:
    'Pour cela, il interroge le relais de ce serveur, les relais publics {relays} et les relais que vous indiquez dans votre propre profil. Ces relais voient votre adresse IP et votre clé publique.',
}

const es: Policy = {
  sections: [
    [
      'Responsable',
      'Este sitio web lo gestiona la persona u organización indicada en el aviso legal. Diríjase a ella para cualquier duda sobre esta política o sobre sus datos.',
    ],
    [
      'En breve',
      'Este sitio web no instala cookies a los visitantes y no usa publicidad, analítica ni rastreo. No carga fuentes, scripts ni reproductores incrustados de terceros. El software del servidor no guarda registro de accesos ni almacena las direcciones IP de los visitantes. Lo que usted mismo publica (me gusta, comentarios) es público por naturaleza, véase más abajo.',
    ],
    [
      'Al visitar el sitio',
      'Su navegador carga este sitio web y su configuración desde este servidor. También se conecta al relé Nostr de este servidor para leer vídeos, comentarios y me gusta. Los vídeos, miniaturas e imágenes se cargan desde las direcciones guardadas en los datos del vídeo. Normalmente están en este servidor, pero pueden apuntar a otro host, que entonces ve su dirección IP como cualquier servidor web. No necesita una cuenta para ver o leer.',
    ],
    [
      'Qué se guarda en su navegador',
      'El sitio no instala cookies. Usa el almacenamiento local y la caché de su navegador para: su elección de idioma, su confirmación de que tiene 18 años o más, el volumen y el ajuste de repetición del reproductor, una copia de la última configuración del sitio, una caché de eventos Nostr recibidos y una caché de corta duración de los totales de zaps. Si inicia sesión, también se guardan su clave pública y el método de inicio de sesión. Estos datos permanecen en su navegador y no se envían al operador. Puede borrarlos en los ajustes de su navegador (datos de sitios).',
    ],
    [
      'Inicio de sesión (opcional)',
      'Solo necesita iniciar sesión para dar me gusta, comentar o hacer zaps. Con una extensión del navegador, su clave permanece en la extensión. Si introduce una clave privada (nsec) o una clave cifrada (ncryptsec) con su contraseña, solo se usa en su navegador, se conserva únicamente mientras esa pestaña esté abierta y nunca se envía al servidor. Con un firmante remoto (Nostr Connect, bunker), los datos de conexión y una clave de conexión se guardan en su navegador, y el sitio habla con el firmante a través de los relés indicados en la dirección de conexión, o a través del relé de este servidor si escanea un código QR. Esos relés pueden ver que se establece una conexión.',
    ],
    [
      'Su perfil tras iniciar sesión',
      'Tras iniciar sesión, el sitio busca su perfil público (nombre e imagen) y su lista de relés para poder mostrar quién es usted. {profile}',
    ],
    [
      'Los me gusta y los comentarios son públicos',
      'Si da me gusta a un vídeo, escribe un comentario, responde o borra un comentario, su navegador publica un evento Nostr firmado: su clave pública, el texto, la hora, el vídeo al que se refiere y la nota «client: nostube». Se envía al relé de este servidor, se guarda en su base de datos y cualquiera puede leerlo, también fuera de este sitio. No escriba nada que deba seguir siendo privado. Si borra su propio comentario, este servidor lo borra, pero las copias que otras personas ya hayan hecho no se pueden recuperar.',
    ],
    [
      'Zaps (propinas Lightning)',
      'Si hace un zap a un vídeo, su navegador pide una factura al proveedor Lightning del creador (su dominio forma parte de la dirección Lightning del creador) y le envía una solicitud de zap firmada con su clave pública, el importe y, si lo elige, un momento del vídeo. Usted paga con su monedero Lightning; este sitio y su operador no reciben datos de pago. El proveedor publica en Nostr un recibo público del zap y tiene su propia política de privacidad.',
    ],
    [
      'Enlaces a otros sitios web',
      'Algunos enlaces llevan fuera de este sitio, por ejemplo a perfiles o vídeos de otras personas en servicios elegidos por el operador, o a direcciones web en comentarios. Si sigue uno de esos enlaces, se aplica la política de privacidad del otro sitio.',
    ],
    [
      'Qué conserva el servidor',
      'El servidor guarda en su base de datos los vídeos y archivos que han publicado los creadores y los me gusta y comentarios que han publicado los visitantes (véase arriba). No escribe ningún registro de acceso de las páginas vistas. Solo el operador inicia sesión en la administración; para ello se instala una cookie de sesión para el operador, nunca para los visitantes. Si delante del servidor hay un proxy inverso o un proveedor de alojamiento, este puede registrar datos de conexión, como direcciones IP, en sus propios registros; eso queda fuera de este software.',
    ],
    [
      'Sus derechos',
      'Según la ley que le sea aplicable, puede pedir al operador información sobre los datos guardados sobre usted, su rectificación o supresión, oponerse al tratamiento o reclamar ante una autoridad de protección de datos. Sobre los visitantes, el propio servidor solo guarda lo que ellos mismos publican, así que lo más rápido es borrar usted mismo sus comentarios (véase arriba). Puede contactar con el operador a través del aviso legal.',
    ],
  ],
  profileLocal:
    'Para ello solo consulta el relé de este servidor; no se consulta ningún relé público.',
  profileOpen:
    'Para ello consulta el relé de este servidor, los relés públicos {relays} y los relés que usted indique en su propio perfil. Esos relés ven su dirección IP y su clave pública.',
}

const ru: Policy = {
  sections: [
    [
      'Ответственное лицо',
      'Этот сайт ведёт лицо или организация, указанные в выходных данных. По любым вопросам об этой политике или о ваших данных обращайтесь к ним.',
    ],
    [
      'Коротко',
      'Этот сайт не устанавливает посетителям cookie и не использует рекламу, аналитику и отслеживание. Он не загружает шрифты, скрипты и встроенные плееры третьих сторон. Серверное ПО не ведёт журнал обращений и не сохраняет IP-адреса посетителей. То, что вы публикуете сами (отметки «нравится», комментарии), по своей природе публично, см. ниже.',
    ],
    [
      'При посещении',
      'Ваш браузер загружает этот сайт и его настройки с этого сервера. Он также подключается к Nostr-релею этого сервера, чтобы читать видео, комментарии и отметки «нравится». Видео, превью и изображения загружаются по адресам, указанным в данных видео. Обычно они находятся на этом сервере, но могут указывать и на другой хост, который тогда видит ваш IP-адрес, как любой веб-сервер. Чтобы смотреть и читать, учётная запись не нужна.',
    ],
    [
      'Что хранится в вашем браузере',
      'Сайт не устанавливает cookie. Он использует локальное хранилище и кэш вашего браузера для: выбранного вами языка, вашего подтверждения, что вам 18 лет или больше, громкости и настройки повтора плеера, копии последних настроек сайта, кэша полученных событий Nostr и кратковременного кэша сумм зэпов. Если вы входите в систему, также сохраняются ваш публичный ключ и способ входа. Эти данные остаются в вашем браузере и не отправляются оператору. Вы можете удалить их в настройках браузера (данные сайтов).',
    ],
    [
      'Вход (необязательно)',
      'Входить нужно только для того, чтобы ставить отметки «нравится», комментировать или отправлять зэпы. С расширением браузера ваш ключ остаётся в расширении. Если вы вводите приватный ключ (nsec) или зашифрованный ключ (ncryptsec) с паролем, он используется только в вашем браузере, хранится лишь пока открыта эта вкладка и никогда не отправляется на сервер. При использовании удалённого подписанта (Nostr Connect, bunker) данные подключения и ключ подключения сохраняются в вашем браузере, а сайт общается с подписантом через релеи, указанные в адресе подключения, или через релей этого сервера, если вы сканируете QR-код. Эти релеи видят, что соединение устанавливается.',
    ],
    [
      'Ваш профиль после входа',
      'После входа сайт ищет ваш публичный профиль (имя и изображение) и ваш список релеев, чтобы показать, кто вы. {profile}',
    ],
    [
      'Отметки «нравится» и комментарии публичны',
      'Если вы ставите отметку «нравится» видео, пишете комментарий, отвечаете или удаляете комментарий, ваш браузер публикует подписанное событие Nostr: ваш публичный ключ, текст, время, видео, к которому оно относится, и пометку «client: nostube». Оно отправляется на релей этого сервера, сохраняется в его базе данных и доступно для чтения любому, в том числе за пределами этого сайта. Не пишите ничего, что должно остаться личным. Если вы удалите свой комментарий, этот сервер его удалит, но копии, уже сделанные другими, вернуть нельзя.',
    ],
    [
      'Зэпы (чаевые через Lightning)',
      'Если вы отправляете зэп видео, ваш браузер запрашивает счёт у Lightning-провайдера автора (его домен входит в Lightning-адрес автора) и отправляет ему подписанный запрос зэпа с вашим публичным ключом, суммой и, если вы выберете, моментом видео. Вы платите из своего Lightning-кошелька; этот сайт и его оператор не получают платёжных данных. Провайдер публикует в Nostr публичную квитанцию о зэпе и имеет собственную политику конфиденциальности.',
    ],
    [
      'Ссылки на другие сайты',
      'Некоторые ссылки ведут за пределы этого сайта, например на профили или видео других людей на сервисах, выбранных оператором, или на веб-адреса в комментариях. Если вы переходите по такой ссылке, действует политика конфиденциальности другого сайта.',
    ],
    [
      'Что хранит сервер',
      'Сервер хранит в своей базе данных видео и файлы, опубликованные авторами, а также отметки «нравится» и комментарии, опубликованные посетителями (см. выше). Он не ведёт журнала просмотров страниц. В администрирование входит только оператор; для этого оператору устанавливается cookie сессии, посетителям — никогда. Если перед сервером стоит обратный прокси или хостинг-провайдер, он может записывать данные соединения, например IP-адреса, в собственные журналы; это находится вне данного ПО.',
    ],
    [
      'Ваши права',
      'В зависимости от применимого к вам права вы можете запросить у оператора сведения о хранимых о вас данных, их исправление или удаление, возразить против обработки или подать жалобу в орган по защите данных. О посетителях сам сервер хранит только то, что они публикуют сами, поэтому быстрее всего самому удалить свои комментарии (см. выше). С оператором можно связаться через выходные данные.',
    ],
  ],
  profileLocal:
    'Для этого запрашивается только релей этого сервера; публичные релеи не запрашиваются.',
  profileOpen:
    'Для этого запрашиваются релей этого сервера, публичные релеи {relays} и релеи, которые вы указали в собственном профиле. Эти релеи видят ваш IP-адрес и ваш публичный ключ.',
}

const zh: Policy = {
  sections: [
    [
      '负责方',
      '本网站由法律声明中所列的个人或组织运营。关于本政策或您的数据的任何问题，请联系对方。',
    ],
    [
      '简要说明',
      '本网站不会向访客设置 Cookie，也不使用广告、统计分析或跟踪工具，不加载第三方的字体、脚本或嵌入式播放器。服务器软件不记录访问日志，也不保存访客的 IP 地址。您自己发布的内容（点赞、评论）本身就是公开的，见下文。',
    ],
    [
      '访问时',
      '您的浏览器从本服务器加载本网站及其设置，并连接本服务器的 Nostr 中继以读取视频、评论和点赞。视频、缩略图和图片从视频数据中保存的地址加载。这些地址通常位于本服务器，但也可能指向其他主机，该主机会像任何网络服务器一样看到您的 IP 地址。观看和阅读无需账户。',
    ],
    [
      '浏览器中保存的内容',
      '本网站不设置 Cookie。它使用浏览器的本地存储和缓存来保存：您选择的语言、您已年满 18 岁的确认、播放器的音量和循环设置、最近一次站点设置的副本、已接收 Nostr 事件的缓存，以及短期的 Zap 总额缓存。如果您登录，还会保存您的公钥和登录方式。这些数据只保留在您的浏览器中，不会发送给运营者。您可以在浏览器设置中删除它们（网站数据）。',
    ],
    [
      '登录（可选）',
      '只有点赞、评论或发送 Zap 时才需要登录。使用浏览器扩展时，您的密钥保留在扩展中。如果您输入私钥（nsec）或带密码的加密密钥（ncryptsec），它只在您的浏览器中使用，仅在该浏览器标签页打开期间保留，绝不会发送到服务器。使用远程签名器（Nostr Connect、bunker）时，连接数据和一个连接密钥会保存在您的浏览器中，网站通过连接地址中列出的中继与签名器通信；扫描二维码时则通过本服务器的中继。这些中继可以看到有连接发生。',
    ],
    [
      '登录后的个人资料',
      '登录后，网站会查找您的公开个人资料（名称和头像）及您的中继列表，以便显示您是谁。{profile}',
    ],
    [
      '点赞和评论是公开的',
      '如果您给视频点赞、发表评论、回复或删除评论，您的浏览器会发布一个已签名的 Nostr 事件：您的公钥、文本、时间、所涉及的视频以及备注“client: nostube”。它会发送到本服务器的中继，保存在其数据库中，任何人都可以读取，包括本网站之外。请不要写入应保持私密的内容。如果您删除自己的评论，本服务器会将其删除，但他人已经制作的副本无法收回。',
    ],
    [
      'Zap（Lightning 打赏）',
      '如果您给视频发送 Zap，您的浏览器会向创作者的 Lightning 服务商（其域名包含在创作者的 Lightning 地址中）请求发票，并向其发送一个已签名的 Zap 请求，包含您的公钥、金额，以及（如果您选择）视频中的某个时间点。您用自己的 Lightning 钱包付款；本网站及其运营者不会收到任何支付数据。服务商会在 Nostr 上发布该 Zap 的公开回执，并有其自己的隐私政策。',
    ],
    [
      '指向其他网站的链接',
      '有些链接会离开本网站，例如指向运营者选定的服务上其他人的个人资料或视频，或评论中的网址。当您点击此类链接时，适用对方网站的隐私政策。',
    ],
    [
      '服务器保存的内容',
      '服务器在其数据库中保存创作者发布的视频和文件，以及访客发布的点赞和评论（见上文）。它不记录页面访问日志。只有运营者会登录管理后台；为此会为运营者设置会话 Cookie，绝不会为访客设置。如果服务器前面有反向代理或托管服务商，它可能在自己的日志中记录 IP 地址等连接数据，这超出了本软件的范围。',
    ],
    [
      '您的权利',
      '根据适用于您的法律，您可以要求运营者提供关于您的已存数据的信息，要求更正或删除，反对处理，或向数据保护机构投诉。服务器本身只保存访客自己发布的内容，因此最快的方式是自己删除您的评论（见上文）。您可以通过法律声明联系运营者。',
    ],
  ],
  profileLocal: '为此只查询本服务器的中继，不会查询任何公共中继。',
  profileOpen:
    '为此会查询本服务器的中继、公共中继 {relays}，以及您在自己的个人资料中列出的中继。这些中继会看到您的 IP 地址和公钥。',
}

const ja: Policy = {
  sections: [
    [
      '責任者',
      'このウェブサイトは、運営者情報に記載された個人または団体が運営しています。このポリシーやお客様のデータについてのご質問は、そちらへお問い合わせください。',
    ],
    [
      '要約',
      'このウェブサイトは、訪問者に Cookie を設定せず、広告、アクセス解析、トラッキングを使用しません。第三者のフォント、スクリプト、埋め込みプレーヤーも読み込みません。サーバーソフトウェアはアクセスログを残さず、訪問者の IP アドレスを保存しません。ご自身で公開するもの（いいね、コメント）は、その性質上公開されます。詳しくは下記をご覧ください。',
    ],
    [
      'ご訪問時',
      'お使いのブラウザは、このウェブサイトとその設定をこのサーバーから読み込みます。また、動画、コメント、いいねを読み込むため、このサーバーの Nostr リレーに接続します。動画、サムネイル、画像は、動画データに記載されたアドレスから読み込まれます。通常はこのサーバー上にありますが、別のホストを指す場合もあり、その場合は他のウェブサーバーと同様にそのホストにお客様の IP アドレスが見えます。視聴や閲覧にアカウントは不要です。',
    ],
    [
      'ブラウザに保存されるもの',
      'このウェブサイトは Cookie を設定しません。ブラウザのローカルストレージとキャッシュを、次の目的で使用します：言語の選択、18 歳以上であることの確認、プレーヤーの音量とループ設定、最新のサイト設定のコピー、受信した Nostr イベントのキャッシュ、短期間の Zap 合計のキャッシュ。ログインした場合は、公開鍵とログイン方法も保存されます。これらのデータはブラウザ内にとどまり、運営者には送信されません。ブラウザの設定（サイトデータ）から削除できます。',
    ],
    [
      'ログイン（任意）',
      'ログインが必要なのは、いいね、コメント、Zap をするときだけです。ブラウザ拡張機能を使う場合、鍵は拡張機能の中にとどまります。秘密鍵（nsec）またはパスワード付きの暗号化された鍵（ncryptsec）を入力した場合、それはお使いのブラウザ内でのみ使用され、そのブラウザのタブが開いている間だけ保持され、サーバーには送信されません。リモート署名者（Nostr Connect、bunker）を使う場合、接続データと接続用の鍵がブラウザに保存され、ウェブサイトは接続アドレスに記載されたリレー経由で、QR コードを読み取った場合はこのサーバーのリレー経由で署名者とやり取りします。これらのリレーは、接続が行われていることを確認できます。',
    ],
    [
      'ログイン後のプロフィール',
      'ログイン後、ウェブサイトはお客様が誰であるかを表示するため、公開プロフィール（名前と画像）とリレーリストを検索します。{profile}',
    ],
    [
      'いいねとコメントは公開されます',
      '動画にいいねをする、コメントを書く、返信する、コメントを削除すると、お使いのブラウザは署名付きの Nostr イベントを公開します。内容は、公開鍵、本文、時刻、対象の動画、「client: nostube」という注記です。これはこのサーバーのリレーに送信され、そのデータベースに保存され、このウェブサイトの外も含め誰でも読めます。非公開にしたい内容は書かないでください。ご自身のコメントを削除すると、このサーバーはそれを削除しますが、すでに他の人が作成したコピーを取り戻すことはできません。',
    ],
    [
      'Zap（Lightning のチップ）',
      '動画に Zap をすると、お使いのブラウザは制作者の Lightning プロバイダー（そのドメインは制作者の Lightning アドレスに含まれます）にインボイスを要求し、公開鍵、金額、選択した場合は動画内の位置を含む署名付きの Zap リクエストを送信します。支払いはご自身の Lightning ウォレットで行います。このウェブサイトとその運営者は支払いデータを受け取りません。プロバイダーは Zap の公開レシートを Nostr に公開し、独自のプライバシーポリシーを持っています。',
    ],
    [
      '他のウェブサイトへのリンク',
      '一部のリンクは、このウェブサイトの外へ移動します。たとえば、運営者が選んだサービス上の他の人のプロフィールや動画、コメント内のウェブアドレスなどです。そのようなリンクをたどると、移動先のウェブサイトのプライバシーポリシーが適用されます。',
    ],
    [
      'サーバーが保持するもの',
      'サーバーは、制作者が公開した動画やファイル、訪問者が公開したいいねやコメント（上記参照）をデータベースに保存します。ページ閲覧のアクセスログは書き込みません。管理画面にログインするのは運営者だけで、そのために運営者にはセッション Cookie が設定されますが、訪問者には設定されません。サーバーの前にリバースプロキシやホスティング事業者がある場合、それらが独自のログに IP アドレスなどの接続データを記録することがあります。これはこのソフトウェアの範囲外です。',
    ],
    [
      'お客様の権利',
      'お客様に適用される法律に応じて、運営者に対し、保存されているお客様のデータの開示、訂正または削除を求めたり、処理に異議を唱えたり、データ保護当局に苦情を申し立てたりできる場合があります。サーバー自体が訪問者について保存するのは訪問者自身が公開したものだけなので、ご自身のコメントを自分で削除する（上記参照）のが最も早い方法です。運営者へは運営者情報からご連絡ください。',
    ],
  ],
  profileLocal:
    'そのために問い合わせるのはこのサーバーのリレーだけで、公開リレーには問い合わせません。',
  profileOpen:
    'そのために、このサーバーのリレー、公開リレー {relays}、およびお客様ご自身のプロフィールに記載したリレーに問い合わせます。これらのリレーには、お客様の IP アドレスと公開鍵が見えます。',
}

const POLICIES: Record<string, Policy> = { en, de, fr, es, ru, zh, ja }

/** The languages a standard text exists in. */
export const DEFAULT_PAGE_LANGUAGES = Object.keys(POLICIES)

/**
 * The standard privacy policy in one language. `profileRelays` are the public relays the site asks
 * for a signed-in visitor's profile (the studio's "Visitor profiles" setting); none means local only.
 */
export function privacyPolicy(language: string, profileRelays: string[]): string | undefined {
  const policy = POLICIES[language]
  if (!policy) return undefined
  const profile = profileRelays.length
    ? policy.profileOpen.replace('{relays}', profileRelays.join(', '))
    : policy.profileLocal
  return policy.sections
    .map(([heading, ...paragraphs]) =>
      [heading, ...paragraphs].join('\n').replace('{profile}', profile)
    )
    .join('\n\n')
}
