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
  Cpu,
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

  const [motionType, setMotionType] = useState<MotionType>("off");
  const [motionRoi, setMotionRoi] = useState("");
  const [rtspSubstreamUrl, setRtspSubstreamUrl] = useState("");
  const [sensitivity, setSensitivity] = useState(50);

  React.useEffect(() => {
    if (selectedCamera) {
      setMotionType(selectedCamera.motion_type);
      setMotionRoi(selectedCamera.motion_roi || "");
      setRtspSubstreamUrl(selectedCamera.rtsp_substream_url || "");
      setSensitivity(selectedCamera.motion_sensitivity || 50);
    }
  }, [selectedCamera]);

  const handleSave = async () => {
    if (!selectedCamera) return;

    setIsSaving(true);
    try {
      const response = await api(`/api/cameras/${selectedCamera.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          motion_type: motionType,
          motion_roi: motionRoi,
          rtsp_substream_url: rtspSubstreamUrl || null,
          motion_sensitivity: sensitivity,
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
    toast.success("Webhook URL copied!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
          Motion Detection
        </h1>
        <p className="mt-1 text-gray-500 dark:text-zinc-400">
          Configure how your system detects events.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
          Select Camera
        </label>
        <select
          value={selectedCameraId || ""}
          onChange={(e) => setSelectedCameraId(Number(e.target.value))}
          className="block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
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
          Please add a camera first.
        </p>
      ) : (
        <div className="space-y-8">
          <div className="space-y-6">
            <div>
              <label className="text-lg font-medium text-gray-900 dark:text-white">
                Detection Mode
              </label>
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <MotionRadioCard
                  label="Off"
                  desc="No event recording."
                  icon={ToggleLeft}
                  value="off"
                  currentType={motionType}
                  onChange={setMotionType}
                />
                <MotionRadioCard
                  label="Pixel Motion"
                  desc="Internal grid detection."
                  icon={RadioTower}
                  value="active"
                  currentType={motionType}
                  onChange={setMotionType}
                />
                <MotionRadioCard
                  label="AI / Webhook"
                  desc="Use AI Object Detection."
                  icon={Cpu} // Updated Icon
                  value="webhook"
                  currentType={motionType}
                  onChange={setMotionType}
                />
              </div>
            </div>

            {/* --- Sensitivity (Active Only) --- */}
            {motionType === "active" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                  Sensitivity: {sensitivity}%
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
              </div>
            )}

            {/* --- Substream Input (Active OR Webhook) --- */}
            {(motionType === "active" || motionType === "webhook") && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                <label
                  htmlFor="substream-url"
                  className="block text-sm font-medium text-blue-900 dark:text-blue-200"
                >
                  Substream URL (Recommended for AI/Performance)
                </label>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                  Using a lower resolution stream (e.g. 640x480) drastically
                  reduces CPU usage for detection.
                </p>
                <input
                  type="text"
                  id="substream-url"
                  value={rtspSubstreamUrl}
                  onChange={(e) => setRtspSubstreamUrl(e.target.value)}
                  placeholder="rtsp://.../substream"
                  className="w-full rounded-md border border-blue-200 p-2 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            )}

            {/* --- Webhook Info --- */}
            {motionType === "webhook" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Internal Webhook URL
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
                    title="Copy"
                  >
                    {isCopied ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Copy className="h-5 w-5" />
                    )}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  The built-in AI detector uses this automatically. You only
                  need this if connecting external tools (like Blue Iris or
                  HomeAssistant).
                </p>
              </div>
            )}
          </div>

          {/* --- Motion Grid (Active Only) --- */}
          {motionType === "active" && (
            <div className="space-y-4">
              <label className="text-lg font-medium text-gray-900 dark:text-white">
                Motion Grid
              </label>
              <div className="relative aspect-video w-full rounded-lg bg-black shadow-lg">
                <LiveCameraView camera={selectedCamera} isMuted={true} />
                <MotionGrid
                  roi={motionRoi}
                  onChange={setMotionRoi}
                  disabled={false}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t dark:border-zinc-700">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex w-32 items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader className="h-5 w-5 animate-spin" />
              ) : (
                "Save Settings"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
