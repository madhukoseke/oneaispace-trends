import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "oneaispace-theme";

// The document already carries the stored (or default) theme before paint, so
// this only reflects and updates it - no flash, no forced dark mode.
export default function ThemeToggle() {
  const [theme, setTheme] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light"
  );

  useEffect(() => {
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage unavailable - the choice simply is not remembered */
    }
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} appearance`}
      title={`Switch to ${next} appearance`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-border/70 text-muted-foreground outline-none transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {theme === "dark" ? (
        <Sun className="h-[16px] w-[16px]" aria-hidden="true" />
      ) : (
        <Moon className="h-[16px] w-[16px]" aria-hidden="true" />
      )}
    </button>
  );
}