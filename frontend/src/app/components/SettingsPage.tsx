"use client";

import React, { useState, useEffect } from "react";
import {
  User,
  Camera,
  Palette,
  Scan,
  ShieldCheck,
  HardDrive,
} from "lucide-react";
import ProfileSettings from "./ProfileSettings";
import SecuritySettings from "./SecuritySettings";
import CameraSettings from "./CameraSettings";
import AppearanceSettings from "./AppearanceSettings";
import MotionSettingsPage from "./MotionSettingsPage";
import SystemSettings from "./SystemSettings";
import { Camera as CameraType } from "@/app/types";

type SettingsSection =
  | "profile"
  | "security"
  | "cameras"
  | "appearance"
  | "motion"
  | "system";

interface SettingsPageProps {
  cameras: CameraType[];
  onCamerasUpdate: () => void;
}

export default function SettingsPage({
  cameras,
  onCamerasUpdate,
}: SettingsPageProps) {
  const [currentSection, setCurrentSection] =
    useState<SettingsSection>("profile");

  // --- FIX: Restore state from URL on mount ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("settingsTab") as SettingsSection;
      if (
        tab &&
        [
          "profile",
          "security",
          "cameras",
          "appearance",
          "motion",
          "system",
        ].includes(tab)
      ) {
        setCurrentSection(tab);
      }
    }
  }, []);

  // --- FIX: Update URL when tab changes ---
  const handleSectionChange = (section: SettingsSection) => {
    setCurrentSection(section);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("settingsTab", section);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const NavItem = ({
    label,
    icon: Icon,
    section,
  }: {
    label: string;
    icon: React.ElementType;
    section: SettingsSection;
  }) => (
    <button
      onClick={() => handleSectionChange(section)}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium ${
        currentSection === section
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-white"
          : "text-gray-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
        <NavItem label="Profile" icon={User} section="profile" />
        <NavItem label="Security" icon={ShieldCheck} section="security" />
        <NavItem label="Cameras" icon={Camera} section="cameras" />
        <NavItem label="Motion" icon={Scan} section="motion" />
        <NavItem label="System" icon={HardDrive} section="system" />
        <NavItem label="Appearance" icon={Palette} section="appearance" />
      </nav>

      {/* Right Content */}
      <div className="w-full md:w-4/5">
        {currentSection === "profile" && <ProfileSettings />}
        {currentSection === "security" && <SecuritySettings />}
        {currentSection === "cameras" && (
          <CameraSettings cameras={cameras} onCamerasUpdate={onCamerasUpdate} />
        )}
        {currentSection === "appearance" && <AppearanceSettings />}
        {currentSection === "motion" && (
          <MotionSettingsPage
            cameras={cameras}
            onCamerasUpdate={onCamerasUpdate}
          />
        )}
        {currentSection === "system" && <SystemSettings />}
      </div>
    </div>
  );
}
