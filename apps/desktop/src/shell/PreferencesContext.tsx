import type { Locale } from "@jobfollo/core";
import type { LanguageSetting, ThemeSetting } from "@jobfollo/data";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useServices } from "../boot/index.js";
import { i18n, resolveUiLocale } from "../i18n/index.js";

export type ResolvedTheme = "light" | "dark";

export interface PreferencesContextValue {
  language: LanguageSetting;
  resolvedLocale: Locale;
  theme: ThemeSetting;
  resolvedTheme: ResolvedTheme;
  setLanguage: (next: LanguageSetting) => Promise<void>;
  setTheme: (next: ThemeSetting) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function getSystemDarkPreference(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export interface PreferencesProviderProps {
  children: ReactNode;
}

export function PreferencesProvider({ children }: PreferencesProviderProps) {
  const { settings } = useServices();
  const [language, setLanguageState] = useState<LanguageSetting>("system");
  const [theme, setThemeState] = useState<ThemeSetting>("system");
  const [systemDark, setSystemDark] = useState<boolean>(getSystemDarkPreference);

  useEffect(() => {
    let active = true;
    void Promise.all([settings.get("language"), settings.get("theme")]).then(
      ([storedLang, storedTheme]) => {
        if (!active) return;
        setLanguageState(storedLang);
        setThemeState(storedTheme);
      },
    );
    return () => {
      active = false;
    };
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
    };
  }, []);

  const resolvedLocale = useMemo(
    () =>
      resolveUiLocale(
        language,
        typeof navigator !== "undefined" ? navigator.language : undefined,
      ),
    [language],
  );

  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    if (i18n.language !== resolvedLocale) {
      void i18n.changeLanguage(resolvedLocale);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = resolvedLocale;
    }
  }, [resolvedLocale]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const setLanguage = useCallback(
    async (next: LanguageSetting) => {
      await settings.set("language", next);
      setLanguageState(next);
    },
    [settings],
  );

  const setTheme = useCallback(
    async (next: ThemeSetting) => {
      await settings.set("theme", next);
      setThemeState(next);
    },
    [settings],
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({
      language,
      resolvedLocale,
      theme,
      resolvedTheme,
      setLanguage,
      setTheme,
    }),
    [language, resolvedLocale, theme, resolvedTheme, setLanguage, setTheme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used inside a PreferencesProvider");
  }
  return ctx;
}
