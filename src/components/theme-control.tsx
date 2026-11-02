"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
type Appearance = "light" | "dark" | "system";
const key = "gym-appearance";
let temporaryAppearance: Appearance = "system";
let storageUnavailable = false;
function readAppearance(): Appearance {
  if (storageUnavailable) return temporaryAppearance;
  try { const value = localStorage.getItem(key); return value === "light" || value === "dark" ? value : "system"; }
  catch { storageUnavailable = true; return temporaryAppearance; }
}
function subscribe(update: () => void) {
  window.addEventListener("storage", update); window.addEventListener("gym-appearance", update);
  return () => { window.removeEventListener("storage", update); window.removeEventListener("gym-appearance", update); };
}
export function ThemeControl() {
  const [open, setOpen] = useState(false);
  const appearance = useSyncExternalStore(subscribe, readAppearance, () => "system" as const);
  const Icon = appearance === "system" ? Monitor : appearance === "dark" ? Moon : Sun;
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
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="outline" aria-label="Appearance" title={`Appearance: ${appearance}`} className="size-11 shrink-0 border-transparent bg-transparent p-0 text-muted-foreground"><Icon aria-hidden="true" className="size-5" /></Button></PopoverTrigger>
    <PopoverContent align="end" className="w-44 p-2" aria-label="Appearance options">
      <div role="group" aria-label="Color theme" className="grid gap-1">{(["light", "dark", "system"] as const).map(value => {
        const ChoiceIcon = value === "light" ? Sun : value === "dark" ? Moon : Monitor;
        return <Button key={value} variant="outline" aria-pressed={appearance === value} className="justify-start border-transparent aria-pressed:bg-muted" onClick={() => {
          temporaryAppearance = value;
          try { localStorage.setItem(key, value); } catch { storageUnavailable = true; }
          window.dispatchEvent(new Event("gym-appearance"));
          setOpen(false);
        }}><ChoiceIcon aria-hidden="true" className="size-4" />{value === "light" ? "Light" : value === "dark" ? "Dark" : "System"}</Button>;
      })}</div>
    </PopoverContent>
  </Popover>;
}
