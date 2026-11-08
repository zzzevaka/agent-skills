export type ThemeMode = "auto" | "light" | "dark";

declare global {
  interface Window {
    /** Installed by the inline script in flow-ui.html, which also tracks the system theme. */
    setThemeMode?: (mode: ThemeMode) => void;
  }
}

export function getThemeMode(): ThemeMode {
  const mode = document.documentElement.dataset.themeMode;
  return mode === "light" || mode === "dark" ? mode : "auto";
}

/** Apply and remember a theme; works without localStorage or matchMedia. */
export function setThemeMode(mode: ThemeMode): void {
  if (window.setThemeMode) {
    window.setThemeMode(mode);
    return;
  }
  try {
    localStorage.setItem("structured-flow-theme", mode);
  } catch {
    /* the choice just isn't remembered */
  }
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const resolved = mode === "auto" ? (systemDark ? "dark" : "light") : mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}
