"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { toast } from "sonner";
import {
  Loader,
  HardDrive,
  Cpu,
  Activity,
  Clock,
  Power,
  AlertOctagon,
  Save,
} from "lucide-react";
import ConfirmModal from "./ConfirmModal";

interface SystemHealth {
  cpu_percent: number;
  memory_total: number;
  memory_used: number;
  memory_percent: number;
  disk_total: number;
  disk_free: number;
  disk_used: number;
  disk_percent: number;
  uptime_seconds: number;
}

export default function SystemSettings() {
  const { api } = useAuth();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Retention State
  const [retentionDays, setRetentionDays] = useState(30);
  const [isSavingRetention, setIsSavingRetention] = useState(false);

  // Restart State
  const [isRestarting, setIsRestarting] = useState(false);
  const [isConfirmRestartOpen, setIsConfirmRestartOpen] = useState(false);

  // Wipe State
  const [isWiping, setIsWiping] = useState(false);
  const [isConfirmWipeOpen, setIsConfirmWipeOpen] = useState(false);

  const fetchHealth = async () => {
    try {
      const response = await api("/api/system/health");
      if (!response) return;
      if (!response.ok) throw new Error("Failed to fetch system health");
      const data = await response.json();
      setHealth(data);
    } catch (err: any) {
      console.error("Could not load system status");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await api("/api/system/settings");
      if (response && response.ok) {
        const data = await response.json();
        setRetentionDays(data.retention_days);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchSettings();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [api]);

  const handleSaveRetention = async () => {
    setIsSavingRetention(true);
    try {
      const response = await api("/api/system/settings", {
        method: "PUT",
        body: JSON.stringify({ retention_days: retentionDays }),
      });
      if (response && response.ok) {
        toast.success("Retention policy saved successfully.");
      } else {
        throw new Error("Failed to save");
      }
    } catch (e) {
      toast.error("Could not save settings.");
    } finally {
      setIsSavingRetention(false);
    }
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    setIsConfirmRestartOpen(false);
    try {
      toast.info("Restart command sent. System will reboot...");
      const response = await api("/api/system/restart", { method: "POST" });

      if (response) {
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Restart failed");
        }
        toast.success("Restart initiated. Please wait 30 seconds.");
      }
    } catch (err: any) {
      if (err.message && err.message.includes("Restart failed")) {
        toast.error(err.message);
      } else {
        toast.success("System is restarting. Reload in a moment.");
      }
    } finally {
      setTimeout(() => setIsRestarting(false), 15000);
    }
  };

  const handleWipe = async () => {
    setIsWiping(true);
    setIsConfirmWipeOpen(false);
    try {
      const response = await api("/api/system/recordings", {
        method: "DELETE",
      });
      if (!response) return;

      if (!response.ok) {
        throw new Error("Failed to wipe recordings");
      }

      toast.success("All recordings have been deleted successfully.");
      fetchHealth(); // Refresh disk usage stats
    } catch (err: any) {
      toast.error(err.message || "Failed to wipe recordings");
    } finally {
      setIsWiping(false);
    }
  };

  if (isLoading && !health) {
    return (
      <div className="flex justify-center p-12">
        <Loader className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!health) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  return (
    <div className="space-y-8 max-w-3xl pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
          System Health
        </h1>
        <p className="mt-1 text-gray-500 dark:text-zinc-400">
          Monitor server performance and storage usage.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CPU Card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                CPU Usage
              </h3>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {health.cpu_percent}%
              </p>
            </div>
          </div>
          <ProgressBar percent={health.cpu_percent} colorClass="bg-blue-600" />
        </div>

        {/* RAM Card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Memory
              </h3>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {health.memory_percent}%
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            {formatBytes(health.memory_used)} used of{" "}
            {formatBytes(health.memory_total)}
          </p>
          <ProgressBar
            percent={health.memory_percent}
            colorClass="bg-purple-600"
          />
        </div>

        {/* Storage Card */}
        <div className="md:col-span-2 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
              <HardDrive className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Storage (/recordings)
              </h3>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {health.disk_percent.toFixed(1)}% Used
              </p>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-2 flex justify-between">
              <span>Used: {formatBytes(health.disk_used)}</span>
              <span>Free: {formatBytes(health.disk_free)}</span>
            </p>
            <ProgressBar
              percent={health.disk_percent}
              colorClass={
                health.disk_percent > 90 ? "bg-red-600" : "bg-green-600"
              }
            />
            <p className="mt-1 text-xs text-gray-400 text-right">
              Total Capacity: {formatBytes(health.disk_total)}
            </p>
          </div>

          {/* Retention Setting */}
          <div className="border-t pt-4 border-gray-200 dark:border-zinc-700">
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Storage Retention Policy
            </label>
            <div className="flex items-center gap-3">
              <div className="relative rounded-md shadow-sm">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="block w-24 rounded-md border-gray-300 p-2 pl-3 pr-12 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white sm:text-sm"
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <span className="text-gray-500 sm:text-sm">days</span>
                </div>
              </div>
              <button
                onClick={handleSaveRetention}
                disabled={isSavingRetention}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSavingRetention ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
              Files older than this will be automatically deleted.
            </p>
          </div>
        </div>

        {/* Uptime Card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 flex items-center gap-4">
          <div className="p-3 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-zinc-400">
              System Uptime
            </h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {formatUptime(health.uptime_seconds)}
            </p>
          </div>
        </div>

        {/* Power Options Card */}
        <div className="rounded-lg border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/30 dark:bg-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              <Power className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Power Options
              </h3>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                Restart application services.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsConfirmRestartOpen(true)}
            disabled={isRestarting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isRestarting ? (
              <Loader className="h-5 w-5 animate-spin" />
            ) : (
              "Restart Services"
            )}
          </button>
        </div>

        {/* Danger Zone Card (Wipe) */}
        <div className="md:col-span-2 rounded-lg border border-red-600 bg-red-50 p-6 shadow-sm dark:border-red-800 dark:bg-red-900/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-red-200 text-red-700 dark:bg-red-900/50 dark:text-red-400">
                <AlertOctagon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-800 dark:text-red-400">
                  Danger Zone
                </h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  Permanently delete all recordings and event history. This
                  action cannot be undone.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsConfirmWipeOpen(true)}
              disabled={isWiping}
              className="whitespace-nowrap rounded-lg bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {isWiping ? (
                <Loader className="h-5 w-5 animate-spin" />
              ) : (
                "Wipe All Recordings"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* RESTART MODAL */}
      <ConfirmModal
        isOpen={isConfirmRestartOpen}
        onClose={() => setIsConfirmRestartOpen(false)}
        onConfirm={handleRestart}
        title="Restart Services"
        confirmText="Restart"
        message={
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Are you sure you want to restart{" "}
            <strong className="text-gray-900 dark:text-white">
              all application services
            </strong>
            ? The dashboard will be unavailable for a few moments.
          </p>
        }
        isLoading={isRestarting}
      />

      {/* WIPE MODAL */}
      <ConfirmModal
        isOpen={isConfirmWipeOpen}
        onClose={() => setIsConfirmWipeOpen(false)}
        onConfirm={handleWipe}
        title="Wipe All Recordings"
        confirmText="Delete Everything"
        message={
          <div className="space-y-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This will permanently delete:
            </p>
            <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400 font-medium">
              <li>All 24/7 Video History</li>
              <li>All Motion Event Clips</li>
              <li>All Event Thumbnails</li>
            </ul>
            <p className="text-sm text-gray-500 dark:text-gray-400 pt-2">
              Your camera configurations and user account will be preserved.
            </p>
          </div>
        }
        isLoading={isWiping}
      />
    </div>
  );
}

const ProgressBar = ({
  percent,
  colorClass,
}: {
  percent: number;
  colorClass: string;
}) => (
  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
    <div
      className={`${colorClass} h-2.5 rounded-full transition-all duration-500`}
      style={{ width: `${Math.min(percent, 100)}%` }}
    ></div>
  </div>
);
