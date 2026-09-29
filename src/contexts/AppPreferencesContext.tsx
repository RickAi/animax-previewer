import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  appTranslations,
  type AppLocale,
  type TranslationKey,
  type TranslationValues,
} from '../i18n/resources';

export type AppTheme = 'light' | 'dark';

const LOCALE_STORAGE_KEY = 'graphics_ai_locale';
const LOCALE_USER_SET_STORAGE_KEY = 'graphics_ai_locale_user_set';
const THEME_STORAGE_KEY = 'graphics_ai_theme';

interface AppPreferencesContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  theme: AppTheme;
  setTheme: React.Dispatch<React.SetStateAction<AppTheme>>;
  toggleTheme: () => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
}

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

const isAppLocale = (value: string | null): value is AppLocale => value === 'zh' || value === 'en';
const isAppTheme = (value: string | null): value is AppTheme =>
  value === 'light' || value === 'dark';

const getInitialLocale = (): AppLocale => {
  if (typeof window === 'undefined') return 'zh';

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  const userSelectedLocale = window.localStorage.getItem(LOCALE_USER_SET_STORAGE_KEY) === 'true';
  if (userSelectedLocale && isAppLocale(stored)) return stored;

  return 'zh';
};

const getInitialTheme = (): AppTheme => {
  if (typeof window === 'undefined') return 'dark';

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isAppTheme(stored)) return stored;

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

const formatTranslation = (text: string, values: TranslationValues | undefined): string => {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
};

export const AppPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<AppLocale>(getInitialLocale);
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_USER_SET_STORAGE_KEY, 'true');
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.locale = locale;
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      locale,
      setLocale,
      theme,
      setTheme,
      toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
      t: (key, values) => formatTranslation(appTranslations[locale][key], values),
    }),
    [locale, theme],
  );

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
};

export const useAppPreferences = () => {
  const context = useContext(AppPreferencesContext);
  if (!context) {
    throw new Error('useAppPreferences must be used within AppPreferencesProvider');
  }
  return context;
};
