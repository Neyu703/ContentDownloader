# Feature-Ideen für ContentDownloader

Bestandsaufnahme (Stand 2026-08-19): Die App lädt aktuell ausschließlich YouTube-Links
(`server/src/validate.ts` prüft nur YouTube-Hosts) als MP3/MP4 herunter, ein Link nach dem
anderen, ohne Verlauf, Playlist-Support oder Vorschau. Der Projektname "ContentDownloader"
(umbenannt von "MP3Converter") deutet auf mehr Ambition hin, als der Code aktuell einlöst — das
ist der größte Hebel unten.

Genutzt wird die App auf drei sehr unterschiedlichen Formfaktoren: Desktop (Web-Build), Tablet
(Samsung Galaxy Tab S10 FE) und Handy (Samsung Galaxy A56, beide Android/nativ). Das UI ist
aktuell eine einzige zentrierte Karte mit `maxWidth: 480` (`app/App.tsx`) — auf dem Handy passend,
auf Tablet-Querformat und Desktop bleibt der Großteil des Bildschirms leer. Das fließt unten in
Abschnitt 7 mit ein.

Sortiert nach Aufwand/Wirkung, größter Hebel zuerst (Gruppen). Innerhalb jeder Gruppe zusätzlich
nach Aufwand sortiert, klein → groß.

## 1. Kernfunktionen (größter Hebel)

- [x] **[1-1] Video-Vorschau vor dem Download** — `getVideoInfo()` liefert bereits Titel, Dauer, Thumbnail,
  Uploader, wird aber aktuell nur intern fürs Logging genutzt. Anzeige einer Karte
  (Thumbnail + Titel + Dauer) direkt nach Einfügen des Links, bevor der Download startet, verhindert
  Fehlklicks auf falsche Videos. **Aufwand: klein** (Daten sind schon da).
- [x] **[1-2] Automatischer Retry bei transienten Fehlern** — z.B. HTTP-403/PO-Token-Fehler (im Code
  bereits als bekanntes Risiko dokumentiert, siehe `checkEnvironment()`), automatisch 1–2×
  erneut versuchen, bevor der Job als "Fehlgeschlagen" markiert wird. **Aufwand: klein**.
- [x] **[1-3] Mehrere Links gleichzeitig einfügen (Batch-Queue)** — Textarea statt Single-Line-Input, ein
  Link pro Zeile, alle als eigene Jobs in die bestehende `jobs[]`-Liste einreihen. Die
  Job-Infrastruktur (Queue, Fortschritt pro Job) existiert bereits vollständig dafür.
  **Aufwand: klein–mittel**.
- [x] **[1-4] Multi-Plattform-Support (nicht nur YouTube)** — yt-dlp unterstützt selbst >1000 Seiten
  (TikTok, Instagram, Twitter/X, SoundCloud, Vimeo, Twitch-Clips …), aber
  `isValidYoutubeUrl()` blockt alles außer den 5 YouTube-Hosts hart ab. Der Produktname
  verspricht das bereits. **Aufwand: mittel** (Validierung lockern/generalisieren,
  Format-Erkennung pro Plattform testen).
  Umgesetzt als objektorientiertes Design: ein `Platform`-Interface (+ optionales
  `PlaylistCapablePlatform` für Plattformen mit Playlist-Support) mit einer Klasse pro Plattform
  (YouTube, TikTok, Instagram, Twitter/X, SoundCloud, Vimeo, Twitch), synchron in Server (TS,
  `server/src/platforms/`) und Android-Modul (Kotlin, `app/modules/ytdlp/android/.../platforms/`)
  gespiegelt.
- [ ] **[1-5] Android Share-Intent** — Link direkt aus der YouTube-/TikTok-App über "Teilen" an
  ContentDownloader schicken, statt manuell zu kopieren und in die App zu wechseln. Größter
  Reibungspunkt im aktuellen Ablauf. **Aufwand: mittel** (Expo Intent-Filter/Linking-Konfig).
  Ergänzt gut die Clipboard-Erkennung in Abschnitt 3.
- [ ] **[1-6] Automatische Format-Liste statt fixer Presets** — `QUALITY_OPTIONS` ist aktuell statisch
  (128/192/320 kbps, 360–1080p); `yt-dlp -F <url>` liefert die tatsächlich für das jeweilige
  Video verfügbaren Formate. Verhindert z.B. Downloads in "1080p", obwohl das Video nur in 480p
  vorliegt. **Aufwand: mittel**.
- [x] **[1-7] Playlist-Download** — `downloadMedia()` übergibt `--no-playlist` fest an yt-dlp; ein
  Playlist-Link lädt nur das erste Video. Auswahl "ganze Playlist" vs. "nur dieses Video" +
  Batch-Fortschritt (Job pro Video) wäre ein natürlicher nächster Schritt. **Aufwand: mittel–groß**
  (UI für Job-Gruppen, Server-seitige Queue).
- [ ] **[1-8] Live-Stream-Mitschnitt** — yt-dlp kann laufende Livestreams von Beginn des Anschauens an
  aufzeichnen (`--live-from-start`); eigener Job-Typ ohne bekannte Gesamtlänge/Fortschritt.
  **Aufwand: mittel–groß**.
- [x] **[1-9] YouTube-Cookie-Authentifizierung gegen "Sign in to confirm"-Gate** — YouTube verlangt bei
  einem unvorhersehbaren Teil der Videos inzwischen eine echte Login-Session statt nur eines
  PO-Tokens (bestätigt 2026-08-20 anhand Job-Logs: gleicher Tag, ein Video scheitert mit der Gate,
  andere laufen normal durch — kein Totalausfall, aber auch kein Fall, den yt-dlp wie das
  PO-Token/403-Problem automatisch selbst löst, dafür ist die Gate zu bewusst gesetzt). yt-dlp
  nennt selbst nur `--cookies-from-browser`/`--cookies` als Lösung; das existiert im Code aktuell
  nirgends (`server/src/youtube.ts`, `app/modules/ytdlp/android/.../DownloadQueue.kt`).
  Öffentliche Download-APIs (Cobalt, Apify, RapidAPI-Marktplatz-Anbieter) als Alternative
  recherchiert: kein Shortcut — sie kämpfen intern mit demselben Bot-Detection-Problem (die
  öffentliche Cobalt-Instanz wurde 2026 von YouTube selbst geblockt), kosten zusätzlich Geld/Abo
  und schicken Links an einen Drittanbieter (Datenschutz/ToS-Risiko, siehe Abschnitt 8).
  Zwei Umsetzungswege je Plattform: Server (Desktop) einfach per `--cookies-from-browser chrome`
  (Chrome läuft lokal); Android-APK schwieriger, da kein Zugriff auf fremde Browser-Profile
  möglich ist (Sandboxing) und die YouTube-App keine nutzbaren Cookies liefert — entweder (a)
  manuell exportierte `cookies.txt` über einen neuen Settings-Screen importieren, oder (b)
  In-App-WebView-Login mit Cookie-Extraktion (Risiko: Google blockt eingebettete WebViews teils
  aktiv). **Aufwand: mittel–groß** (zwei Plattformen, UI für Cookie-Verwaltung, ggf.
  Fallback-Logik).

## 2. Verlauf & Persistenz

- [ ] **[2-1] Suche im Verlauf** — nach Titel/Kanal filtern, sobald der Verlauf (unten) existiert.
  **Aufwand: klein**.
- [ ] **[2-2] Favoriten/Pins** — einzelne Verlaufseinträge oben anheften, z.B. oft erneut heruntergeladene
  Podcasts/Musik. **Aufwand: klein**.
- [ ] **[2-3] Speicherplatz-Übersicht** — Gesamtgröße aller gespeicherten Downloads anzeigen, mit
  Schnellzugriff zum Aufräumen. **Aufwand: klein**.
- [ ] **[2-4] Export/Import des Verlaufs** — als JSON, z.B. für ein Backup vor einer Neuinstallation.
  **Aufwand: klein**.
- [ ] **[2-5] Download-Verlauf/Bibliothek** — aktuell verschwinden fertige Jobs nach "Fertige entfernen"
  oder beim Web-Reload spurlos (kein Storage). Eine persistente Liste (AsyncStorage nativ,
  localStorage web) mit Titel, Datum, Format, Re-Download-Button wäre naheliegend, da
  `JobState` bereits fast alle nötigen Felder hat. **Aufwand: klein–mittel**.
- [ ] **[2-6] Automatisches Aufräumen** — Downloads älter als X Tage automatisch löschen (opt-in), verhindert
  vollaufenden Speicher auf dem Handy. **Aufwand: klein–mittel**.
- [ ] **[2-7] Erneuter Zugriff auf bereits heruntergeladene Dateien (nativ)** — Liste der in Downloads
  gespeicherten Dateien direkt in der App statt nur über den System-Dateimanager.
  **Aufwand: mittel**.

## 3. UX-Verbesserungen

- [ ] **[3-1] Clipboard-Auto-Erkennung** — `expo-clipboard` wird schon für den Paste-Button genutzt; ein
  Listener, der beim App-Fokus einen YouTube/Content-Link im Clipboard erkennt und einen
  dezenten Banner "Link erkannt — einfügen?" zeigt, spart den manuellen Klick.
  **Aufwand: klein**.
- [ ] **[3-2] Onboarding beim ersten Start** — kurzer Hinweis-Screen (Format wählen, Link einfügen,
  Speichern) statt einer leeren Karte ohne Erklärung. **Aufwand: klein**.
- [ ] **[3-3] Haptisches Feedback** — kurze Vibration bei "Fertig"/"Fehlgeschlagen" (nativ), zusätzlich zur
  visuellen Statusänderung. **Aufwand: klein**.
- [ ] **[3-4] Swipe-to-dismiss für einzelne Jobs** — statt nur "Fertige entfernen" für alle auf einmal, einen
  einzelnen fertigen Job per Swipe entfernen. **Aufwand: klein**.
- [ ] **[3-5] Undo für "Fertige entfernen"** — kurzes Zeitfenster (z.B. 5s Snackbar), um versehentliches
  Entfernen rückgängig zu machen. **Aufwand: klein**.
- [x] **[3-6] Settings-Screen** — Standard-Format/-Qualität merken (aktuell immer "Audio/320" beim
  Neustart), Downloads-Ordner-Wahl (nativ), Theme. **Aufwand: klein–mittel**.
  Format/Qualität-Persistenz + Theme live im Browser verifiziert; Downloads-Ordner-Wahl (Android,
  Storage-Access-Framework-Picker) implementiert und über Kotlin-Unit-Tests abgesichert, aber
  mangels Android-Gerät/Emulator in dieser Umgebung nicht auf einem echten Gerät getestet.
- [x] **[3-7] Hell/Dunkel-Theme** — `App.tsx` hat aktuell nur fest verdrahtete Dark-Colors in
  `StyleSheet.create`. Ein System-Theme-Toggle wäre für ein UI dieser Größe überschaubar.
  **Aufwand: klein–mittel**.
  Umgesetzt als `ThemeContext`/`ThemeProvider` mit System/Hell/Dunkel-Auswahl, alle Style-Dateien
  auf theme-fähige Farbtokens umgestellt, live im Browser verifiziert (inkl. Persistenz über
  Reload).
- [ ] **[3-8] Benachrichtigung bei Fertigstellung** — besonders relevant, wenn die App im Hintergrund
  läuft (Playlist-/lange Downloads). `expo-notifications` als neue Dependency.
  **Aufwand: mittel**.
- [ ] **[3-9] Mehrsprachigkeit (i18n)** — UI-Texte sind aktuell hart auf Deutsch codiert
  (`"Herunterladen"`, `"Abgebrochen"` etc. direkt in `App.tsx`). Englisch als zweite Sprache
  wäre für eine App mit potenziell nicht-deutschsprachigen Nutzern sinnvoll.
  **Aufwand: mittel** (Text-Extraktion + Sprachumschalter).
- [ ] **[3-10] Persistente Fortschritts-Notification (nativ)** — laufender Download als Android-Notification
  mit Fortschrittsbalken, damit man die App verlassen kann, ohne den Job aus den Augen zu
  verlieren (aktuell nur `JobCard` in der App selbst sichtbar). **Aufwand: mittel**.
- [ ] **[3-11] Android-Homescreen-Widget** — Link direkt aus einem Widget einfügen/starten, ohne die App zu
  öffnen (ergänzt den Share-Intent aus Abschnitt 1). **Aufwand: mittel–groß**.

## 4. Audio/Video-Optionen

- [ ] **[4-1] Weitere Audioformate** — aktuell nur MP3 (`buildFormatArgs` hardcoded `--audio-format mp3`).
  yt-dlp kann verlustfrei zu FLAC/OPUS/M4A extrahieren, interessant für Musik-Nutzer.
  **Aufwand: klein** (ein weiterer Dropdown-Wert + Server-Parameter).
- [x] **[4-2] ID3-Tags/Metadaten einbetten** — Titel, Künstler, Thumbnail als Cover-Art in die MP3 einbetten
  (`yt-dlp --embed-thumbnail --embed-metadata`, ein reiner Flag-Zusatz). Deutlich bessere
  Bibliotheks-Anzeige in Musik-Playern. **Aufwand: klein**.
- [ ] **[4-3] Untertitel/Captions mitladen** — als separate `.srt`-Datei bei Video-Downloads.
  **Aufwand: klein**.
- [ ] **[4-4] Lautstärke-Normalisierung** — `ffmpeg loudnorm`-Filter beim Audio-Export, damit
  heruntergeladene MP3s nicht unterschiedlich laut sind. **Aufwand: klein**.
- [ ] **[4-5] Thumbnail separat als Bild speichern** — eigener kleiner Download-Button für nur das
  Vorschaubild, ohne das ganze Video/Audio. **Aufwand: klein** (Daten aus `getVideoInfo()` schon da).
- [ ] **[4-6] Playlist als ZIP bündeln** — nach einem Playlist-Batch-Download (Abschnitt 1) alle Dateien
  optional gesammelt als eine ZIP-Datei anbieten, statt einzeln teilen zu müssen.
  **Aufwand: klein–mittel**.
- [ ] **[4-7] Ausschnitt/Clip-Download** — Start-/Endzeit angeben, um nur einen Ausschnitt herunterzuladen
  (`yt-dlp --download-sections`). **Aufwand: mittel**.
- [ ] **[4-8] GIF-Export aus einem Video-Ausschnitt** — kombiniert mit der Clip-Download-Idee oben, für
  kurze Ausschnitte statt vollem Video. **Aufwand: mittel**.

## 5. Technisch/Infrastruktur (Web-Server)

- [ ] **[5-1] Strukturiertes Logging statt `console.log`** — für Fehlersuche im Dauerbetrieb (z.B. wenn der
  Server per Autostart im Hintergrund läuft, siehe Memory zu Server-Autostart) hilfreich.
  **Aufwand: klein**.
- [ ] **[5-2] Health-Check/Status-Endpoint erweitern** — `/api/ping` existiert schon minimal; ein
  `/api/status` mit yt-dlp-Version, ffmpeg-Verfügbarkeit, PO-Token-Skript-Status (die Checks aus
  `checkEnvironment()` sind aktuell nur Server-Log, nicht abfragbar) würde Ferndiagnose übers
  Control-Panel erlauben. **Aufwand: klein**.
- [ ] **[5-3] Job-Concurrency-Limit** — `server/src/index.ts` startet auf jeden `/api/convert`-Request
  sofort einen neuen `yt-dlp`-Prozess, ohne Obergrenze. Bei mehreren gleichzeitigen Nutzern im
  LAN (oder Batch-Downloads, siehe oben) könnte das den Rechner überlasten. Eine einfache
  Warteschlange mit z.B. 2 parallelen Jobs wäre eine sinnvolle Absicherung, sobald Batch/Playlist
  kommt. **Aufwand: klein–mittel**.
- [ ] **[5-4] Persistenter Server-Job-Store** — Jobs leben nur in einer In-Memory-`Map`; ein Server-Neustart
  während eines Downloads verliert den Job komplett (kein Wiederaufsetzen möglich).
  Relevant erst bei längeren/robusteren Downloads. **Aufwand: mittel**.
- [ ] **[5-5] Automatisierte Tests** — laut `CLAUDE.md` aktuell kein Test-Tooling im Repo; zumindest
  `isValidYoutubeUrl()` und `buildFormatArgs()` sind reine Funktionen und leicht testbar.
  **Aufwand: mittel** (Test-Runner einführen + erste Tests).

## 6. Sonstiges

- [ ] **[6-1] Barrierefreiheit** — aktuell hat nur der Paste-Button ein `accessibilityLabel`; restliche
  Buttons/Dropdowns haben keine Screenreader-Labels. **Aufwand: klein**.
- [ ] **[6-2] Nutzungsstatistiken** — Anzahl Downloads gesamt, meistgenutztes Format/Qualität, als kleine
  verspielte Übersicht statt echter Analytics (rein lokal, kein Tracking). **Aufwand: klein**.
- [ ] **[6-3] iOS-Support** — laut README aktuell explizit nicht unterstützt, da das native
  `ytdlp`-Modul nur Android targeted. Größere Investition (eigenes iOS-natives Modul oder
  Wechsel auf reinen Server-Modus für iOS). **Aufwand: groß**. Für die drei tatsächlich
  genutzten Geräte (alle Android oder Desktop-Web) aktuell nicht nötig — separat notiert, falls
  sich der Nutzerkreis ändert.

## 7. Multi-Geräte-Optimierung (Desktop, Tablet Tab S10 FE, Handy A56)

Die drei Zielgeräte dieser App:

- **Handy (Galaxy A56)** — schmaler Bildschirm, Hochformat. Aktuelles UI passt hier gut.
- **Tablet (Tab S10 FE)** — großer Bildschirm, oft im Querformat und/oder Samsung-Split-Screen
  genutzt. Die feste `maxWidth: 480`-Karte lässt hier viel ungenutzten Platz übrig.
- **Desktop (Web-Build)** — potenziell noch breiteres Fenster, zusätzlich Tastatur/Maus statt
  Touch als primäre Eingabe.

Ideen, die gezielt diese drei Formfaktoren bedienen, statt generisch "responsive" zu machen:

- [ ] **[7-1] Mehrspaltige Job-Liste auf großen Screens** — `jobList` ist aktuell eine einzelne
  `ScrollView`-Spalte; auf Tablet/Desktop könnten mehrere Jobs (z.B. bei Batch-Downloads,
  siehe Abschnitt 1) nebeneinander statt nur untereinander dargestellt werden.
  **Aufwand: klein** (Flex-Wrap auf der Job-Liste ab Breakpoint).
- [ ] **[7-2] Split-Screen-Robustheit (Tablet)** — Samsung-Tablets werden häufig im Split-Screen mit
  reduzierter Fensterbreite genutzt; das aktuelle zentrierte Karten-Layout verträgt schmale
  Fenster bereits gut (kein Fix nötig), aber beim Testen auf dem Tab S10 FE gezielt auch
  Split-Screen-Breiten prüfen, sobald das Zweispalten-Layout (unten) kommt, damit es dort nicht
  bricht. **Aufwand: klein** (Testaufwand, kein Zusatzcode wenn Breakpoint sauber gewählt ist).
- [x] **[7-3] Desktop: Tastatur-Bedienung** — `TextInput` für die URL hat aktuell kein
  `onSubmitEditing`/Enter-Handling, Download startet nur per Klick auf den Button. Auf Desktop
  mit Tastatur ist Enter-zum-Absenden ein Standarderwartung. **Aufwand: klein**.
- [ ] **[7-4] Größere Touch-Ziele auf Tablet** — Buttons/Dropdown-Optionen sind aktuell für Handy-Daumen
  dimensioniert; auf einem 10"+-Tablet wirkt das oft klein. Relevant erst, falls beim Testen auf
  dem Tab S10 FE tatsächlich Probleme auffallen — nicht blind vergrößern.
  **Aufwand: klein, aber abhängig vom Test-Feedback**.
- [ ] **[7-5] Globaler Tastatur-Shortcut (Desktop)** — z.B. `Strg+V` irgendwo im Fenster fügt automatisch in
  das URL-Feld ein, ohne erst hineinklicken zu müssen. **Aufwand: klein**.
- [x] **[7-6] Breakpoint-Layout ab Tablet-Breite** — `useWindowDimensions()` (Expo/RN-Bordmittel) statt
  fixer `maxWidth: 480`: ab einer bestimmten Fensterbreite (z.B. >700px) URL-Eingabe/Format-Wahl
  links, Job-Liste rechts als zweispaltiges Layout, statt beides untereinander in einer schmalen
  Karte. Nutzt den Platz auf Tab S10 FE (Querformat) und Desktop sinnvoll, ohne das
  Handy-Layout anzufassen. **Aufwand: klein–mittel** (ein Breakpoint, bestehende Komponenten nur
  umsortiert).
- [ ] **[7-7] Desktop: Drag & Drop eines Links** — einen Link (z.B. aus der Adressleiste) direkt auf das
  Fenster ziehen können, statt zwingend copy-paste. Nur für den Web-Build relevant.
  **Aufwand: klein–mittel** (`onDrop`-Handler nur im Web-Zweig, ähnlich wie
  `downloader/index.web.ts` bereits plattformspezifisch ist).
- [ ] **[7-8] PWA-Installierbarkeit (Desktop-Web)** — der Web-Build als installierbare Progressive Web App
  (eigenes Fenster, Taskleisten-Icon) statt nur Browser-Tab. **Aufwand: klein–mittel**
  (Manifest + Service Worker).
- [ ] **[7-9] Verlauf/Einstellungen geräteübergreifend synchron** — siehe Abschnitt 9 (Sync), hier nur als
  Formfaktor-Bezug: gerade beim Wechsel Handy↔Tablet↔Desktop wäre ein gemeinsamer Verlauf
  praktisch. **Aufwand: groß**.

## 8. Sicherheit & Datenschutz

- [x] **[8-1] Rechtlicher Hinweis im UI** — kurzer, unaufdringlicher Hinweis, dass Downloads nur für Inhalte
  genutzt werden sollten, an denen die entsprechenden Rechte bestehen. **Aufwand: klein**.
  Als kleiner, gedämpfter Hinweistext unten im Settings-Screen umgesetzt.
- [ ] **[8-2] Server-Zugriff absichern** — `server/src/index.ts` erlaubt aktuell jedem im selben
  LAN/localhost uneingeschränkt `/api/convert`; ein einfacher gemeinsamer API-Key (per
  Header) würde Fremdzugriff im WLAN verhindern. **Aufwand: klein**.
- [ ] **[8-3] Eingabegrößen-Limit serverseitig** — `express.json()` hat aktuell kein explizites
  Body-Size-Limit gesetzt; ein Default-Limit ist sinnvolle Absicherung gegen Fehlbedienung/Missbrauch.
  **Aufwand: klein**.
- [ ] **[8-4] HTTPS für den lokalen Server** — aktuell nur `http://localhost:3001`; für ein LAN-Setup mit
  mehreren Geräten (Desktop/Tablet/Handy im selben Netz) wäre TLS mit einem lokalen Zertifikat
  sauberer als Klartext-HTTP. **Aufwand: mittel**.

## 9. Automatisierung & Sync

- [ ] **[9-1] Geplante Downloads** — einen Link zu einer bestimmten Uhrzeit herunterladen (z.B. nachts, um
  Bandbreite zu schonen). **Aufwand: mittel**.
- [ ] **[9-2] Kanal-/Playlist-Abo mit Auto-Download** — wie bei 4K Video Downloader (siehe Abschnitt 10):
  einen Kanal/eine Playlist abonnieren, neue Videos automatisch im gewählten Format
  herunterladen, sobald sie erscheinen. **Aufwand: groß** (periodischer Check + Server-seitige
  Job-Erzeugung).
  Setzt Playlist-Support (Abschnitt 1) voraus.
- [ ] **[9-3] Geräteübergreifender Verlauf-Sync** — z.B. über den ohnehin vorhandenen eigenen Server als
  einfachen Sync-Punkt zwischen Desktop/Tablet/Handy, statt rein lokalem `AsyncStorage`/
  `localStorage`. **Aufwand: groß**.

## 10. Von ähnlichen Apps abgeschaut

Kurzer Blick auf etablierte Downloader/Player-Apps (4K Video Downloader Plus, NewPipe) — was sie
bieten und was davon für ContentDownloader übertragbar ist:

- [ ] **[10-1] Einstellbares Parallel-Download-Limit** — bei 4K Video Downloader in der kostenlosen Version
  begrenzt, in Bezahlversionen bis zu 7 gleichzeitig; für uns als Nutzer-Einstellung statt fixem
  Server-Limit (Abschnitt 5) übertragbar. **Aufwand: klein**.
- [ ] **[10-2] Untertitel ins Video einbetten (statt nur `.srt` daneben)** — 4K Video Downloader bietet beide
  Varianten an; ergänzt die "Untertitel mitladen"-Idee aus Abschnitt 4. **Aufwand: klein**.
- [ ] **[10-3] "Smart Mode"-Presets** — 4K Video Downloader merkt sich pro genutzter Einstellung ein
  Ein-Klick-Profil (Format+Qualität+Zielordner), statt bei jedem Download erneut zu wählen.
  Passt zum Settings-Screen aus Abschnitt 3. **Aufwand: klein–mittel**.
- [ ] **[10-4] Weitere Quellen wie SoundCloud/Bandcamp/Vimeo** — NewPipe und 4K Video Downloader unterstützen
  neben YouTube diverse weitere Plattformen; konkretisiert die Multi-Plattform-Idee aus
  Abschnitt 1 mit tatsächlich verbreiteten Zielseiten. **Aufwand: siehe Abschnitt 1** (mittel).
- [ ] **[10-5] Kanal-/Playlist-Abos mit Auto-Download** — Kernfeature von 4K Video Downloader Plus
  ("neue Videos automatisch laden, sobald sie erscheinen"). Siehe Abschnitt 9.
  **Aufwand: siehe Abschnitt 9** (groß).
- [ ] **[10-6] KI-Nachbearbeitung (optional, groß)** — 4K Video Downloader Plus bietet 2026 KI-Tools wie
  Rauschunterdrückung, Vocal-Isolation und Karaoke-Spur-Erzeugung direkt nach dem Download an.
  Interessant, aber deutlich außerhalb des aktuellen Scopes (eigene KI-Audio-Pipeline nötig).
  **Aufwand: groß**.
- [ ] **[10-7] Lokale, nicht-synchronisierte Abo-/Verlaufsdaten** — NewPipes Grundprinzip (Abos nur lokal auf
  dem Gerät, kein Server-Konto nötig) ist ein guter Datenschutz-Leitgedanke für die
  History/Abo-Features aus Abschnitt 2/9, falls kein Cloud-Sync gewünscht ist.
  (Design-Prinzip, kein eigenständiges Feature — ohne Aufwandsangabe.)

---

**Nächste konkrete Schritte, nach Aufwand/Wirkung:**
1. [x] [1-1] Video-Vorschau vor dem Download (Daten schon vorhanden, nur UI)
2. [x] [4-2] ID3-Tags/Cover-Art einbetten (ein Flag in `buildFormatArgs`)
3. [x] [7-3] Enter-zum-Absenden / [x] [7-6] Breakpoint-Layout für Tablet/Desktop (kleine, gezielte
   Fixes für die drei tatsächlich genutzten Geräte)
4. [x] [1-2] Automatischer Retry bei transienten Fehlern (bis zu 3 Versuche, server- und
   android-seitig gespiegelt)
5. [x] [1-3] Batch-Queue (mehrere Links auf einmal einfügen)
6. [x] [1-4] Multi-Plattform-Support (Validierung generalisieren) — größter strategischer Hebel,
   da er den Produktnamen einlöst
7. [x] [1-7] Playlist-Download

**ID-Schema:** `<Abschnitt>-<Nummer>`, z.B. `1-1` = erste Idee in Abschnitt 1.

Checkbox abhaken = Idee ist in `main` umgesetzt — wir arbeiten direkt auf `main`, kein
Feature-Branch-Workflow, also einfach beim Commit abhaken.
