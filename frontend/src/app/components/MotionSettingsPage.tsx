"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Camera, MotionType } from "@/app/types";
import { useAuth } from "@/app/contexts/AuthContext";
import { toast } from "sonner";
import {
  ToggleLeft,
  Loader,
  Copy,
  Check,
  Cpu,
  User,
  Car,
  Dog,
} from "lucide-react";
import LiveCameraView from "./LiveCameraView";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const OBJECT_CLASSES = [
  { id: 0, label: "Person", icon: User },
  { id: 2, label: "Car", icon: Car },
  { id: 3, label: "Motorcycle", icon: Car },
  { id: 5, label: "Bus", icon: Car },
  { id: 7, label: "Truck", icon: Car },
  { id: 15, label: "Cat", icon: Dog },
  { id: 16, label: "Dog", icon: Dog },
];

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
  const [rtspSubstreamUrl, setRtspSubstreamUrl] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<Set<number>>(
    new Set([0])
  );

  useEffect(() => {
    if (selectedCamera) {
      setMotionType(selectedCamera.motion_type);
      setRtspSubstreamUrl(selectedCamera.rtsp_substream_url || "");

      if (selectedCamera.ai_classes) {
        const ids = selectedCamera.ai_classes
          .split(",")
          .map(Number)
          .filter((n) => !isNaN(n));
        setSelectedClasses(new Set(ids));
      } else {
        setSelectedClasses(new Set([0]));
      }
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
          rtsp_substream_url: rtspSubstreamUrl || null,
          ai_classes: Array.from(selectedClasses).join(","),
        }),
      });
      if (!response) return;

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to save settings");
      }

      toast.success("Settings saved!");
      onCamerasUpdate();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleClass = (id: number) => {
    const newSet = new Set(selectedClasses);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedClasses(newSet);
  };

  const webhookUrl = selectedCamera
    ? `${API_URL}/api/webhook/motion/${selectedCamera.path}`
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setIsCopied(true);
    toast.success("Copied!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
          Smart Detection
        </h1>
        <p className="mt-1 text-gray-500 dark:text-zinc-400">
          Configure AI object detection.
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
                Detection Status
              </label>
              <div className="mt-2 flex flex-col sm:flex-row gap-4">
                <MotionRadioCard
                  label="Off"
                  desc="No recording."
                  icon={ToggleLeft}
                  value="off"
                  currentType={motionType}
                  onChange={setMotionType}
                />
                <MotionRadioCard
                  label="AI Enabled"
                  desc="Record when objects are detected."
                  icon={Cpu}
                  value="webhook"
                  currentType={motionType}
                  onChange={setMotionType}
                />
              </div>
            </div>

            {/* --- AI Configuration --- */}
            {motionType === "webhook" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Object Filter */}
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
                  <label className="block text-sm font-medium text-indigo-900 dark:text-indigo-200 mb-3">
                    Objects to Detect
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {OBJECT_CLASSES.map((obj) => (
                      <button
                        key={obj.id}
                        onClick={() => toggleClass(obj.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          selectedClasses.has(obj.id)
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600"
                        }`}
                      >
                        <obj.icon className="h-3 w-3" />
                        {obj.label}
                        {selectedClasses.has(obj.id) && (
                          <Check className="h-3 w-3 ml-1" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Substream URL */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                  <label className="block text-sm font-medium text-blue-900 dark:text-blue-200">
                    Substream URL (Required for AI Efficiency)
                  </label>
                  <input
                    type="text"
                    value={rtspSubstreamUrl}
                    onChange={(e) => setRtspSubstreamUrl(e.target.value)}
                    placeholder="rtsp://.../substream"
                    className="mt-1 w-full rounded-md border border-blue-200 p-2 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  />
                </div>

                {/* Webhook Info (Advanced) */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-zinc-400">
                    Integration URL (For external triggers)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={webhookUrl}
                      readOnly
                      className="w-full flex-1 rounded-md border border-gray-200 bg-gray-50 p-1.5 text-xs text-gray-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                      title="Copy"
                    >
                      {isCopied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

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
