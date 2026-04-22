"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="p-2 rounded hover:bg-surface-container-high/20 transition-colors"
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun className="w-5 h-5 text-on-surface-variant" />
      ) : (
        <Moon className="w-5 h-5 text-on-surface-variant" />
      )}
    </button>
  );
}
