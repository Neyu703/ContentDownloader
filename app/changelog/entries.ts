export interface ChangelogEntry {
  /** Matches app.json's expo.version exactly. */
  version: string;
  /** ISO date (YYYY-MM-DD) of the release. */
  date: string;
  notes: { de: string[]; en: string[] };
}

/** Bundled release notes shown in the changelog modal — newest first. Append one entry per release. */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: "1.10.0",
    date: "2026-09-05",
    notes: {
      de: [
        "Unterstützung für weitere Plattformen neben YouTube: TikTok, Instagram, Twitter/X, SoundCloud, Vimeo und Twitch.",
        "Neuer Einstellungen-Bereich: das zuletzt genutzte Format/Qualität wird jetzt gemerkt statt bei jedem Start auf „Audio/320“ zurückzuspringen.",
        "Umschaltbares Design (hell/dunkel/Systemeinstellung).",
        "Android: Download-Ordner frei wählbar statt fest auf den öffentlichen Downloads-Ordner.",
        "Die Job-Liste scrollt jetzt korrekt innerhalb ihrer Karte statt über den Rand hinauszulaufen.",
      ],
      en: [
        "Support for more platforms beyond YouTube: TikTok, Instagram, Twitter/X, SoundCloud, Vimeo and Twitch.",
        "New Settings area: the last-used format/quality is now remembered instead of resetting to \"Audio/320\" on every launch.",
        "Switchable theme (light/dark/system).",
        "Android: choose the downloads folder instead of always saving to the public Downloads collection.",
        "The job list now scrolls correctly inside its card instead of spilling past the edge.",
      ],
    },
  },
  {
    version: "1.9.0",
    date: "2026-09-03",
    notes: {
      de: [
        "Neuer Einstellungen-Tab mit umschaltbarer Sprache (Deutsch/Englisch/Systemsprache).",
        "Änderungsprotokoll: erscheint automatisch nach einem Update und kann jederzeit in den Einstellungen erneut geöffnet werden.",
        "Die App ist jetzt komplett zweisprachig (Deutsch/Englisch) — inklusive Server- und Android-Meldungen.",
      ],
      en: [
        "New Settings tab with a switchable language (German/English/system language).",
        "Changelog: shows automatically after an update and can be reopened anytime from Settings.",
        "The app is now fully bilingual (German/English) — including server and Android messages.",
      ],
    },
  },
  {
    version: "1.8.0",
    date: "2026-09-03",
    notes: {
      de: [
        "YouTube-Links ohne „https://“ (z. B. youtube.com/watch?v=...) werden jetzt korrekt erkannt.",
      ],
      en: [
        "YouTube links without \"https://\" (e.g. youtube.com/watch?v=...) are now recognized correctly.",
      ],
    },
  },
  {
    version: "1.7.0",
    date: "2026-09-03",
    notes: {
      de: [
        "Mehrere Links auf einmal einfügen: jede Zeile wird als eigener Download gestartet.",
        "Playlist-Links innerhalb einer solchen Mehrfach-Eingabe werden übersprungen und gemeldet.",
      ],
      en: [
        "Paste multiple links at once: each line starts its own download.",
        "Playlist links inside a multi-link paste are skipped and reported.",
      ],
    },
  },
  {
    version: "1.6.0",
    date: "2026-09-03",
    notes: {
      de: [
        "Fehler beim Auswählen aller Videos in einer Playlist behoben.",
        "Leere Detail-Box wird nicht mehr angezeigt.",
        "Android-Downloads zeigen jetzt ebenfalls ein Vorschaubild.",
      ],
      en: [
        "Fixed the playlist \"select all\" toggle.",
        "The empty details box is no longer shown when there's nothing to display.",
        "Android downloads now show a thumbnail too.",
      ],
    },
  },
  {
    version: "1.5.0",
    date: "2026-09-03",
    notes: {
      de: [
        "Automatischer Wiederholungsversuch bei vorübergehenden Download-Fehlern.",
      ],
      en: [
        "Automatic retry on transient download failures.",
      ],
    },
  },
  {
    version: "1.4.0",
    date: "2026-09-02",
    notes: {
      de: [
        "Playlist-Download (Web + Android): Playlist-Link einfügen für eine Auswahlliste mit Checkboxen pro Video, „Alle auswählen/abwählen“ und einer endlos scrollenden Liste für große Playlists.",
        "Heruntergeladene Playlist-Einträge erscheinen als eine gruppierte Aufgabe mit Live-Fortschritt „N/M fertig“.",
        "Die Beschriftung des Download-Buttons passt sich jetzt an Format und Auswahlanzahl an.",
      ],
      en: [
        "Playlist download (web + Android): paste a playlist link to get a picker with per-video checkboxes, select-all/none toggle, and an infinite-scrolling list for large playlists.",
        "Downloaded playlist items show as one grouped job with a live \"N/M done\" progress header.",
        "The download button label now adapts to format and selection count.",
      ],
    },
  },
  {
    version: "1.3.0",
    date: "2026-08-20",
    notes: {
      de: [
        "Videos, die eine YouTube-Anmeldung erfordern (z. B. altersbeschränkt), zeigen jetzt eine klare Meldung statt der rohen yt-dlp-Fehlerausgabe.",
      ],
      en: [
        "Videos that require a signed-in YouTube account (e.g. age-restricted) now show a clear message instead of yt-dlp's raw error dump.",
      ],
    },
  },
  {
    version: "1.2.0",
    date: "2026-08-20",
    notes: {
      de: [
        "Formular und Download-Liste wechseln auf breiten Bildschirmen zu einer zweispaltigen Ansicht, sobald ein Download läuft.",
        "Abgebrochene Downloads verschwinden sofort aus der Liste, statt bis zum Klick auf „Fertige entfernen“ liegen zu bleiben.",
      ],
      en: [
        "Form and job list switch to a side-by-side two-column layout on wide screens once a download is running.",
        "Cancelled downloads disappear from the list immediately instead of lingering until \"clear finished\" is clicked.",
      ],
    },
  },
  {
    version: "1.1.0",
    date: "2026-08-19",
    notes: {
      de: [
        "Video-Vorschau (Vorschaubild/Titel/Dauer) vor Downloadstart.",
        "MP3-Downloads enthalten jetzt ID3-Tags und Cover.",
        "Live-ETA, einklappbares Detail-Panel pro Download, geschätzte Endgröße für Audio-Downloads.",
        "Enter-Taste im URL-Feld startet den Download.",
        "Schnellere Vorschau-Abfragen.",
      ],
      en: [
        "Video preview (thumbnail/title/duration) before a download starts.",
        "MP3 downloads embed ID3 tags and cover art.",
        "Live download ETA, collapsible per-job details panel, estimated final size for audio jobs.",
        "Enter key in the URL field starts the download.",
        "Faster preview lookups.",
      ],
    },
  },
  {
    version: "1.0.0",
    date: "2026-08-19",
    notes: {
      de: [
        "Erste Android-Version.",
        "YouTube-Audio- (MP3) und Video-Downloader (MP4).",
        "Download-Warteschlange direkt auf dem Gerät, kein Server nötig.",
      ],
      en: [
        "First Android release.",
        "YouTube audio (MP3) / video (MP4) downloader.",
        "On-device download queue, no server needed.",
      ],
    },
  },
];
