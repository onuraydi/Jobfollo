import type { Locale } from "@jobfollo/core";
import type { LanguageSetting } from "@jobfollo/data";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import tr from "./locales/tr.json";

export function resolveUiLocale(
  setting: LanguageSetting,
  navigatorLanguage?: string,
): Locale {
  if (setting === "tr" || setting === "en") {
    return setting;
  }
  if (typeof navigatorLanguage === "string" && navigatorLanguage.toLowerCase().startsWith("tr")) {
    return "tr";
  }
  return "en";
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      tr: { translation: tr },
    },
    lng: resolveUiLocale(
      "system",
      typeof navigator !== "undefined" ? navigator.language : undefined,
    ),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });
}

export { i18n };
