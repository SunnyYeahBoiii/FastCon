/* global window, document, localStorage, MediaQueryListEvent */
"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

const THEME_STORAGE_KEY = "theme";
const THEME_COOKIE_KEY = "theme";

interface ThemeContextType {
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggle: () => {},
});

function persistTheme(theme: "light" | "dark") {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  document.cookie = `${THEME_COOKIE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

function readThemeFromCookie(): "light" | "dark" | null {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${THEME_COOKIE_KEY}=`));
  if (!cookie) return null;
  const value = cookie.split("=")[1];
  if (value === "dark" || value === "light") return value;
  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const cookieTheme = readThemeFromCookie();
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    const theme =
      savedTheme === "dark" || savedTheme === "light"
        ? savedTheme
        : cookieTheme ?? (prefersDark ? "dark" : "light");

    const dark = theme === "dark";
    document.documentElement.classList.toggle("dark", dark);
    setIsDark(dark);
    persistTheme(theme);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const dark = e.matches;
      document.documentElement.classList.toggle("dark", dark);
      persistTheme(dark ? "dark" : "light");
      setIsDark(dark);
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      persistTheme(next ? "dark" : "light");
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
