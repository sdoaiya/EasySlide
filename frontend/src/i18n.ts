import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zh from './locales/zh.json';
import en from './locales/en.json';

const LANGUAGE_KEY = 'easyslide-language';
const LEGACY_LANGUAGE_KEY = 'banana-slides-language';

if (typeof window !== 'undefined') {
  const stored = window.localStorage.getItem(LANGUAGE_KEY);
  const legacyStored = window.localStorage.getItem(LEGACY_LANGUAGE_KEY);
  if (!stored && legacyStored) {
    window.localStorage.setItem(LANGUAGE_KEY, legacyStored);
    window.localStorage.removeItem(LEGACY_LANGUAGE_KEY);
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
    fallbackLng: 'zh',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: LANGUAGE_KEY,
    },
  });

export default i18n;
