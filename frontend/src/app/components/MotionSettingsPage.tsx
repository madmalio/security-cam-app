"use client";

import React, { useState, useMemo } from "react";
import { Camera, MotionType } from "@/app/types";
import { useAuth } from "@/app/contexts/AuthContext";
import { toast } from "sonner";
import {
  RadioTower,
  Webhook,
  ToggleLeft,
  Loader,
  Copy,
  Check,
} from "lucide-react";
import LiveCameraView from "./LiveCameraView";
import MotionGrid from "./MotionGrid";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface MotionSettingsPageProps {
  cameras: Camera[];
  onCamerasUpdate: () => void;
}

export default function MotionSettingsPage({
  cameras,
  onCamerasUpdate,
}: MotionSettingsPageProps) {
  const { api } = useAuth();
  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(
    cameras.length > 0 ? cameras[0].id : null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const selectedCamera = useMemo(
    () => cameras.find((c) => c.id === selectedCameraId),
    [cameras, selectedCameraId]
  );

  const [motionType, setMotionType] = useState<MotionType>(
    selectedCamera?.motion_type || "off"
  );
  const [motionRoi, setMotionRoi] = useState(selectedCamera?.motion_roi || "");

  React.useEffect(() => {
    if (selectedCamera) {
      setMotionType(selectedCamera.motion_type);
      setMotionRoi(selectedCamera.motion_roi || "");
    }
  }, [selectedCamera]);

  const handleSave = async () => {
    if (!selectedCamera) return;

    setIsSaving(true);
    try {
      const response = await api(`/api/cameras/${selectedCamera.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: selectedCamera.name,
          rtsp_url: selectedCamera.rtsp_url,
          rtsp_substream_url: selectedCamera.rtsp_substream_url,
          motion_type: motionType,
          motion_roi: motionRoi,
        }),
      });
      if (!response) return;

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to save settings");
      }

      toast.success("Motion settings saved!");
      onCamerasUpdate();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const webhookUrl = selectedCamera
    ? `${API_URL}/api/webhook/motion/${selectedCamera.path}`
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setIsCopied(true);
    toast.success("Webhook URL copied to clipboard!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    // --- FIX: Use a single-column (vertical) layout ---
    <div className="space-y-8 max-w-4xl pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
          Motion Detection
        </h1>
        <p className="mt-1 text-gray-500 dark:text-zinc-400">
          Configure motion detection for your cameras.
        </p>
      </div>

      {/* Camera Selector - now full width */}
      <div className="space-y-5">
        <label
          htmlFor="camera-select"
          className="block text-sm font-medium text-gray-700 dark:text-zinc-300"
        >
          Select Camera
        </label>
        <select
          id="camera-select"
          value={selectedCameraId || ""}
          onChange={(e) => setSelectedCameraId(Number(e.target.value))}
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
        >
          {cameras.map((cam) => (
            <option key={cam.id} value={cam.id}>
              {cam.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedCamera ? (
        <p className="text-gray-500 dark:text-zinc-400">
          Please add a camera to configure motion detection.
        </p>
      ) : (
        // --- FIX: Removed grid-cols-2, now a simple vertical stack ---
        <div className="space-y-8">
          {/* Section 1: Settings */}
          <div className="space-y-6">
            <div>
              <label className="text-lg font-medium text-gray-900 dark:text-white">
                Detection Type
              </label>
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <MotionRadioCard
                  label="Off"
                  desc="Do not record motion."
                  icon={ToggleLeft}
                  value="off"
                  currentType={motionType}
                  onChange={setMotionType}
                />
                <MotionRadioCard
                  label="Webhook"
                  desc="Use an external trigger (e.g., Wyze-Bridge)."
                  icon={Webhook}
                  value="webhook"
                  currentType={motionType}
                  onChange={setMotionType}
                />
                <MotionRadioCard
                  label="In-App"
                  desc="Use server CPU to detect motion (Beta)."
                  icon={RadioTower}
                  value="active"
                  currentType={motionType}
                  onChange={setMotionType}
                />
              </div>
            </div>

            {motionType === "webhook" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Motion Webhook URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={webhookUrl}
                    readOnly
                    className="w-full flex-1 rounded-md border border-gray-300 bg-gray-50 p-2 text-gray-600 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`flex w-12 items-center justify-center rounded-lg ${
                      isCopied
                        ? "bg-green-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-500"
                    }`}
                    title="Copy to clipboard"
                  >
                    {isCopied ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Copy className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Live View & Grid (only if In-App is selected) */}
          {motionType === "active" && (
            <div className="space-y-4">
              <label className="text-lg font-medium text-gray-900 dark:text-white">
                Motion Zone
              </label>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                Click to select the grid squares to watch for motion.
              </p>
              <div className="relative aspect-video w-full rounded-lg bg-black shadow-lg">
                <LiveCameraView camera={selectedCamera} isMuted={true} />
                <MotionGrid
                  roi={motionRoi}
                  onChange={setMotionRoi}
                  disabled={false} // No longer needs to be disabled
                />
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t dark:border-zinc-700">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex w-32 items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader className="h-5 w-5 animate-spin" />
              ) : (
                "Save Motion Settings"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper component for radio buttons
const MotionRadioCard = ({
  label,
  desc,
  icon: Icon,
  value,
  currentType,
  onChange,
}: {
  label: string;
  desc: string;
  icon: React.ElementType;
  value: MotionType;
  currentType: MotionType;
  onChange: (value: MotionType) => void;
}) => {
  const isActive = currentType === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${
        isActive
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/50"
          : "border-gray-300 bg-white hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon
          className={`h-5 w-5 ${
            isActive
              ? "text-blue-600 dark:text-blue-400"
              : "text-gray-500 dark:text-zinc-400"
          }`}
        />
        <span
          className={`font-medium ${
            isActive
              ? "text-blue-700 dark:text-blue-300"
              : "text-gray-800 dark:text-zinc-200"
          }`}
        >
          {label}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">{desc}</p>
    </button>
  );
};
