export interface ThemeColors {
  background: string;
  surface: string;
  /** Slightly distinct from `surface` — inner cards (job card, preview card) layered on top of it. */
  surfaceVariant: string;
  inputBackground: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  /** Background for a selected/active row (e.g. the picked dropdown option). */
  accentSelected: string;
  onAccent: string;
  danger: string;
  success: string;
  onSuccess: string;
  buttonDisabled: string;
  overlay: string;
}

export const darkColors: ThemeColors = {
  background: "#0d0d0d",
  surface: "#1a1a1a",
  surfaceVariant: "#151515",
  inputBackground: "#111",
  border: "#2c2c2c",
  borderStrong: "#3a3a3a",
  textPrimary: "#f0f0f0",
  textSecondary: "#a0a0a0",
  textMuted: "#888",
  textFaint: "#666",
  accent: "#646cff",
  accentSelected: "#2a2a3a",
  onAccent: "#fff",
  danger: "#ff6b6b",
  success: "#2ecc71",
  onSuccess: "#0a0a0a",
  buttonDisabled: "#3a3a4a",
  overlay: "rgba(0,0,0,0.6)",
};

export const lightColors: ThemeColors = {
  background: "#f2f2f5",
  surface: "#ffffff",
  surfaceVariant: "#f7f7fa",
  inputBackground: "#ffffff",
  border: "#e0e0e5",
  borderStrong: "#c8c8d0",
  textPrimary: "#1a1a1a",
  textSecondary: "#55555c",
  textMuted: "#78787f",
  textFaint: "#9a9aa0",
  accent: "#5459e8",
  accentSelected: "#e6e7fb",
  onAccent: "#fff",
  danger: "#c23a3a",
  success: "#248a4d",
  onSuccess: "#fff",
  buttonDisabled: "#c6c6d6",
  overlay: "rgba(0,0,0,0.4)",
};
