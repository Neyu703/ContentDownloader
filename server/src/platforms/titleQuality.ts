/** yt-dlp's own synthesized placeholders when a post has no real title (Instagram) or a bare hashtag caption (TikTok). */
const LOW_QUALITY_TITLE_PATTERNS = [/^(?:Video|Photo|Reel) by\s/i, /^#\S+$/];

const MAX_CAPTION_LENGTH = 100;

export function isLowQualityTitle(title: string): boolean {
  const trimmed = title.trim();
  return trimmed.length === 0 || LOW_QUALITY_TITLE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function firstNonEmptyLine(text: string | null | undefined): string | null {
  if (!text) return null;
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? null;
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

/** yt-dlp's upload_date is an unseparated YYYYMMDD string. */
function formatUploadDate(uploadDate: string | null | undefined): string | null {
  if (!uploadDate || !/^\d{8}$/.test(uploadDate)) return null;
  return `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}`;
}

export interface TitleSource {
  title?: string | null;
  description?: string | null;
  uploader?: string | null;
  uploadDate?: string | null;
  id?: string | null;
}

/**
 * Picks the best available title out of everything yt-dlp's info-dict offers, for platforms
 * (Instagram, TikTok) whose own `title` field is often a low-effort placeholder rather than a real
 * title. Falls through: real title -> caption (description) -> composed uploader/date -> raw title/id.
 */
export function pickTitle(source: TitleSource): string {
  const title = source.title?.trim();
  if (title && !isLowQualityTitle(title)) return title;

  const caption = firstNonEmptyLine(source.description);
  if (caption && !isLowQualityTitle(caption)) return truncate(caption, MAX_CAPTION_LENGTH);

  const uploader = source.uploader?.trim();
  const date = formatUploadDate(source.uploadDate);
  if (uploader && date) return `${uploader} - ${date}`;
  if (uploader) return uploader;

  return title || source.id || "Unknown title";
}
