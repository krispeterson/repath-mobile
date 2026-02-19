const lightColors = {
  background: "#F9FAFB",
  surface: "#FFFFFF",
  surfaceMuted: "#F3F4F6",
  textPrimary: "#0B0F1A",
  textSecondary: "#2E3440",
  textMuted: "#6B7280",
  textPlaceholder: "#9CA3AF",
  textInverse: "#FFFFFF",
  textOnOverlay: "#FFFFFF",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  accent: "#2CC5A1",
  accentStrong: "#159C7C",
  warning: "#FFB020",
  warningStrong: "#D78A00",
  warningBg: "#FFF7E8",
  danger: "#FF6B6B",
  link: "#1F6FEB",
  previewBg: "#111827",
  overlayScrim: "rgba(0,0,0,0.35)",
  overlayCard: "#FFFFFF",
  overlayLabelBg: "rgba(0,0,0,0.7)",
  processingPillBg: "rgba(0,0,0,0.6)",
  badgeBestBg: "#E8FBF5",
  badgeBestBorder: "#2CC5A1",
  badgeBestText: "#159C7C",
  badgeHighBg: "#EEF4FF",
  badgeHighBorder: "#1F6FEB",
  badgeHighText: "#1F6FEB",
  badgeFallbackBg: "#F9FAFB",
  badgeFallbackBorder: "#E5E7EB",
  badgeFallbackText: "#6B7280",
  badgeLastBg: "#FFF7E8",
  badgeLastBorder: "#FFB020",
  badgeLastText: "#D78A00",
  disabledBg: "#E5E7EB",
  disabledText: "#6B7280"
};

const darkColors = {
  background: "#0B1220",
  surface: "#111827",
  surfaceMuted: "#1E293B",
  textPrimary: "#F3F4F6",
  textSecondary: "#E5E7EB",
  textMuted: "#CBD5E1",
  textPlaceholder: "#94A3B8",
  textInverse: "#0B1220",
  textOnOverlay: "#F8FAFC",
  border: "#334155",
  borderStrong: "#475569",
  accent: "#2DD4BF",
  accentStrong: "#99F6E4",
  warning: "#D97706",
  warningStrong: "#FCD34D",
  warningBg: "#3A2A05",
  danger: "#FCA5A5",
  link: "#7CB7FF",
  previewBg: "#020617",
  overlayScrim: "rgba(0,0,0,0.6)",
  overlayCard: "#111827",
  overlayLabelBg: "rgba(15,23,42,0.9)",
  processingPillBg: "rgba(15,23,42,0.9)",
  badgeBestBg: "#083D32",
  badgeBestBorder: "#2DD4BF",
  badgeBestText: "#99F6E4",
  badgeHighBg: "#102C55",
  badgeHighBorder: "#60A5FA",
  badgeHighText: "#BFDBFE",
  badgeFallbackBg: "#1E293B",
  badgeFallbackBorder: "#475569",
  badgeFallbackText: "#CBD5E1",
  badgeLastBg: "#3A2A05",
  badgeLastBorder: "#D97706",
  badgeLastText: "#FCD34D",
  disabledBg: "#334155",
  disabledText: "#94A3B8"
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22
};

export const type = {
  h1: { fontSize: 28, fontWeight: "800", letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: "700" },
  h3: { fontSize: 16, fontWeight: "700" },
  body: { fontSize: 14, fontWeight: "500" },
  small: { fontSize: 12, fontWeight: "500" }
};

export function getThemeColors(scheme) {
  return scheme === "dark" ? darkColors : lightColors;
}

export function useAppTheme() {
  let scheme = "light";
  try {
    // Lazy require keeps Node-based tests from parsing react-native internals.
    const ReactNative = require("react-native");
    if (ReactNative && typeof ReactNative.useColorScheme === "function") {
      scheme = ReactNative.useColorScheme() || "light";
    }
  } catch (_error) {
    scheme = "light";
  }
  const isDark = scheme === "dark";
  return {
    scheme: isDark ? "dark" : "light",
    isDark,
    colors: getThemeColors(scheme)
  };
}

export const colors = lightColors;
