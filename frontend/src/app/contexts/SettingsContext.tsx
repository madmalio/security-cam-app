"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

// Define the types for our settings
export type DefaultView = "grid" | "focus";
export type EventsView = "grid" | "list"; // <-- NEW TYPE
export type GridColumns = 3 | 4 | 5;

interface SettingsContextType {
  defaultView: DefaultView;
  eventsView: EventsView; // <-- NEW STATE
  gridColumns: GridColumns;
  setDefaultView: (view: DefaultView) => void;
  setEventsView: (view: EventsView) => void; // <-- NEW SETTER
  setGridColumns: (cols: GridColumns) => void;
}

// Helper functions to get from localStorage
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

// Create the context
const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [defaultView, setDefaultView] = useState<DefaultView>(getInitialView);
  const [eventsView, setEventsView] =
    useState<EventsView>(getInitialEventsView); // <-- NEW
  const [gridColumns, setGridColumns] =
    useState<GridColumns>(getInitialColumns);

  // Save to localStorage whenever settings change
  useEffect(() => {
    localStorage.setItem("defaultView", defaultView);
  }, [defaultView]);

  useEffect(() => {
    localStorage.setItem("eventsView", eventsView); // <-- SAVE NEW SETTING
  }, [eventsView]);

  useEffect(() => {
    localStorage.setItem("gridColumns", gridColumns.toString());
  }, [gridColumns]);

  return (
    <SettingsContext.Provider
      value={{
        defaultView,
        eventsView,
        gridColumns,
        setDefaultView,
        setEventsView,
        setGridColumns,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

// Custom hook to use the settings
export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
