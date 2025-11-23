"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

export type DefaultView = "grid" | "focus";
export type EventsView = "grid" | "list";
export type GridColumns = 3 | 4 | 5;
export type Theme = "light" | "dark" | "system"; // <-- New Type

interface SettingsContextType {
  defaultView: DefaultView;
  eventsView: EventsView;
  gridColumns: GridColumns;
  theme: Theme; // <-- New Field
  setDefaultView: (view: DefaultView) => void;
  setEventsView: (view: EventsView) => void;
  setGridColumns: (cols: GridColumns) => void;
  setTheme: (theme: Theme) => void; // <-- New Setter
}

const getInitialView = (): DefaultView => {
  if (typeof window === "undefined") return "grid";
  return (localStorage.getItem("defaultView") as DefaultView) || "grid";
};

const getInitialEventsView = (): EventsView => {
  if (typeof window === "undefined") return "grid";
  return (localStorage.getItem("eventsView") as EventsView) || "grid";
};

const getInitialColumns = (): GridColumns => {
  if (typeof window === "undefined") return 4;
  const cols = parseInt(localStorage.getItem("gridColumns") || "4", 10);
  return [3, 4, 5].includes(cols) ? (cols as GridColumns) : 4;
};

// --- NEW: Theme Initializer ---
const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem("theme") as Theme) || "system";
};

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [defaultView, setDefaultView] = useState<DefaultView>(getInitialView);
  const [eventsView, setEventsView] =
    useState<EventsView>(getInitialEventsView);
  const [gridColumns, setGridColumns] =
    useState<GridColumns>(getInitialColumns);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    localStorage.setItem("defaultView", defaultView);
  }, [defaultView]);
  useEffect(() => {
    localStorage.setItem("eventsView", eventsView);
  }, [eventsView]);
  useEffect(() => {
    localStorage.setItem("gridColumns", gridColumns.toString());
  }, [gridColumns]);

  // --- FIX: Apply Theme Class ---
  useEffect(() => {
    localStorage.setItem("theme", theme);

    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  return (
    <SettingsContext.Provider
      value={{
        defaultView,
        eventsView,
        gridColumns,
        theme,
        setDefaultView,
        setEventsView,
        setGridColumns,
        setTheme,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
