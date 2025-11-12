"use client";

import React, { useState } from "react";
import { User, Camera, Palette, Grid } from "lucide-react";
import UserSettings from "./UserSettings";
import CameraSettings from "./CameraSettings";
import AppearanceSettings from "./AppearanceSettings"; // <-- 1. IMPORT
import { User as UserType, Camera as CameraType } from "@/app/types";

type SettingsSection = "user" | "cameras" | "appearance" | "grid";

interface SettingsPageProps {
  token: string;
  user: UserType;
  onLogout: () => void;
  onUserUpdate: (user: UserType) => void;
  cameras: CameraType[];
  onCamerasUpdate: () => void;
}

export default function SettingsPage({
  token,
  user,
  onLogout,
  onUserUpdate,
  cameras,
  onCamerasUpdate,
}: SettingsPageProps) {
  const [currentSection, setCurrentSection] = useState<SettingsSection>("user");

  const NavItem = ({
    label,
    icon: Icon,
    section,
    disabled = false,
  }: {
    label: string;
    icon: React.ElementType;
    section: SettingsSection;
    disabled?: boolean;
  }) => (
    <button
      disabled={disabled}
      onClick={() => setCurrentSection(section)}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium ${
        !disabled && currentSection === section
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-white"
          : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
      } ${
        disabled ? "cursor-not-allowed text-gray-400 dark:text-gray-600" : ""
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col gap-8 md:flex-row">
      {/* Left Navigation */}
      <nav className="flex w-full flex-row gap-2 md:w-1/5 md:flex-col">
        <NavItem label="User" icon={User} section="user" />
        <NavItem label="Cameras" icon={Camera} section="cameras" />
        <NavItem
          label="Appearance"
          icon={Palette}
          section="appearance"
          // disabled is removed
        />
        <NavItem label="Grid" icon={Grid} section="grid" disabled />
      </nav>

      {/* Right Content */}
      <div className="w-full md:w-4/5">
        {currentSection === "user" && (
          <UserSettings
            token={token}
            user={user}
            onLogout={onLogout}
            onUserUpdate={onUserUpdate}
          />
        )}
        {currentSection === "cameras" && (
          <CameraSettings
            token={token}
            cameras={cameras}
            onCamerasUpdate={onCamerasUpdate}
          />
        )}
        {/* --- 2. RENDER NEW COMPONENT --- */}
        {currentSection === "appearance" && <AppearanceSettings />}
      </div>
    </div>
  );
}
