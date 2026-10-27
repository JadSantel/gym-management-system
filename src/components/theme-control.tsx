"use client";
import { useEffect, useSyncExternalStore } from "react";
type Appearance = "light" | "dark" | "system";
const key = "gym-appearance";
let temporaryAppearance: Appearance = "system";
function readAppearance(): Appearance {
  try { const value = localStorage.getItem(key); return value === "light" || value === "dark" ? value : "system"; }
  catch { return temporaryAppearance; }
}
function subscribe(update: () => void) {
  window.addEventListener("storage", update); window.addEventListener("gym-appearance", update);
  return () => { window.removeEventListener("storage", update); window.removeEventListener("gym-appearance", update); };
}
export function ThemeControl() {
  const appearance = useSyncExternalStore(subscribe, readAppearance, () => "system" as const);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      const dark = appearance === "dark" || (appearance === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    }
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance]);
  return <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span>Appearance</span>
    <select aria-label="Appearance" value={appearance} onChange={event => {
      const value = event.target.value as Appearance;
      temporaryAppearance = value;
      try { localStorage.setItem(key, value); } catch { /* Keep the choice for this page when storage is unavailable. */ }
      window.dispatchEvent(new Event("gym-appearance"));
    }} className="min-h-11 rounded-md border border-border bg-card px-2 text-sm text-foreground">
      <option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option>
    </select></label>;
}
