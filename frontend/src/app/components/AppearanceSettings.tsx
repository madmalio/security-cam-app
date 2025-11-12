"use client";

import React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Layout, Grid } from "lucide-react";
import { useSettings } from "@/app/contexts/SettingsContext"; // <-- 1. IMPORT
import { DefaultView, GridColumns } from "@/app/contexts/SettingsContext";

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  // --- 2. USE SETTINGS HOOK ---
  const { defaultView, gridColumns, setDefaultView, setGridColumns } =
    useSettings();

  return (
    <div className="space-y-8 max-w-2xl pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
          Appearance
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          Customize the look and feel of your dashboard.
        </p>
      </div>

      {/* Theme Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Theme
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Select your preferred color scheme. &quot;System&quot; will match your
          operating system&apos;s preference.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-4">
          <RadioCard
            label="Light"
            icon={Sun}
            isActive={theme === "light"}
            onClick={() => setTheme("light")}
          />
          <RadioCard
            label="Dark"
            icon={Moon}
            isActive={theme === "dark"}
            onClick={() => setTheme("dark")}
          />
          <RadioCard
            label="System"
            icon={Monitor}
            isActive={theme === "system"}
            onClick={() => setTheme("system")}
          />
        </div>
      </div>

      {/* --- 3. NEW: Dashboard Preferences Card --- */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Dashboard Preferences
        </h2>

        {/* Default View Setting */}
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-900 dark:text-white">
            Default View on Login
          </label>
          <div className="mt-2 flex flex-col sm:flex-row gap-4">
            <RadioCard
              label="Grid View"
              icon={Grid}
              isActive={defaultView === "grid"}
              onClick={() => setDefaultView("grid")}
            />
            <RadioCard
              label="Focus View"
              icon={Layout}
              isActive={defaultView === "focus"}
              onClick={() => setDefaultView("focus")}
            />
          </div>
        </div>

        {/* Grid Columns Setting */}
        <div className="mt-6">
          <label className="text-sm font-medium text-gray-900 dark:text-white">
            Default Grid Columns
          </label>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Select the number of columns for dashboard and fullscreen grids.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-4">
            <NumberButton
              label="3 Columns"
              isActive={gridColumns === 3}
              onClick={() => setGridColumns(3)}
            />
            <NumberButton
              label="4 Columns"
              isActive={gridColumns === 4}
              onClick={() => setGridColumns(4)}
            />
            <NumberButton
              label="5 Columns"
              isActive={gridColumns === 5}
              onClick={() => setGridColumns(5)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper component for Theme/Radio buttons
const RadioCard = ({
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border-2 p-6 text-center transition-all ${
        isActive
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/50"
          : "border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
      }`}
    >
      <Icon className="h-6 w-6 mx-auto mb-2" />
      <span className="font-medium">{label}</span>
    </button>
  );
};

// Helper component for Number buttons
const NumberButton = ({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border-2 p-4 text-center font-medium transition-all ${
        isActive
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/50"
          : "border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
      }`}
    >
      {label}
    </button>
  );
};
