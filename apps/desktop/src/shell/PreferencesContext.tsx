import type { Locale } from "@jobfollo/core";
import type {
  DensitySetting,
  FontSetting,
  LanguageSetting,
  PaletteSetting,
  ThemeSetting,
} from "@jobfollo/data";
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
  palette: PaletteSetting;
  font: FontSetting;
  density: DensitySetting;
  skipWeekends: boolean;
  desktopNotifications: boolean;
  setLanguage: (next: LanguageSetting) => Promise<void>;
  setTheme: (next: ThemeSetting) => Promise<void>;
  setPalette: (next: PaletteSetting) => Promise<void>;
  setFont: (next: FontSetting) => Promise<void>;
  setDensity: (next: DensitySetting) => Promise<void>;
  setSkipWeekends: (next: boolean) => Promise<void>;
  setDesktopNotifications: (next: boolean) => Promise<void>;
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
  const [palette, setPaletteState] = useState<PaletteSetting>("ocean");
  const [font, setFontState] = useState<FontSetting>("system");
  const [density, setDensityState] = useState<DensitySetting>("comfortable");
  const [skipWeekends, setSkipWeekendsState] = useState<boolean>(false);
  const [desktopNotifications, setDesktopNotificationsState] = useState<boolean>(false);
  const [systemDark, setSystemDark] = useState<boolean>(getSystemDarkPreference);

  useEffect(() => {
    let active = true;
    void Promise.all([
      settings.get("language"),
      settings.get("theme"),
      settings.get("appearance.palette"),
      settings.get("appearance.font"),
      settings.get("appearance.density"),
      settings.get("scheduling.skipWeekends"),
      settings.get("notifications.enabled"),
    ]).then(
      ([
        storedLang,
        storedTheme,
        storedPalette,
        storedFont,
        storedDensity,
        storedSkipWeekends,
        storedNotifications,
      ]) => {
        if (!active) return;
        setLanguageState(storedLang);
        setThemeState(storedTheme);
        setPaletteState(storedPalette);
        setFontState(storedFont);
        setDensityState(storedDensity);
        setSkipWeekendsState(storedSkipWeekends);
        setDesktopNotificationsState(storedNotifications);
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.palette = palette;
  }, [palette]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.font = font;
  }, [font]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.density = density;
  }, [density]);

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

  const setPalette = useCallback(
    async (next: PaletteSetting) => {
      await settings.set("appearance.palette", next);
      setPaletteState(next);
    },
    [settings],
  );

  const setFont = useCallback(
    async (next: FontSetting) => {
      await settings.set("appearance.font", next);
      setFontState(next);
    },
    [settings],
  );

  const setDensity = useCallback(
    async (next: DensitySetting) => {
      await settings.set("appearance.density", next);
      setDensityState(next);
    },
    [settings],
  );

  const setSkipWeekends = useCallback(
    async (next: boolean) => {
      await settings.set("scheduling.skipWeekends", next);
      setSkipWeekendsState(next);
    },
    [settings],
  );

  const setDesktopNotifications = useCallback(
    async (next: boolean) => {
      await settings.set("notifications.enabled", next);
      setDesktopNotificationsState(next);
    },
    [settings],
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({
      language,
      resolvedLocale,
      theme,
      resolvedTheme,
      palette,
      font,
      density,
      skipWeekends,
      desktopNotifications,
      setLanguage,
      setTheme,
      setPalette,
      setFont,
      setDensity,
      setSkipWeekends,
      setDesktopNotifications,
    }),
    [
      language,
      resolvedLocale,
      theme,
      resolvedTheme,
      palette,
      font,
      density,
      skipWeekends,
      desktopNotifications,
      setLanguage,
      setTheme,
      setPalette,
      setFont,
      setDensity,
      setSkipWeekends,
      setDesktopNotifications,
    ],
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
