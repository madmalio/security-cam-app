"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { toast } from "sonner";
import { Loader, HardDrive, Cpu, Activity, Clock } from "lucide-react";

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

  const fetchHealth = async () => {
    try {
      const response = await api("/api/system/health");
      if (!response) return;
      if (!response.ok) throw new Error("Failed to fetch system health");
      const data = await response.json();
      setHealth(data);
    } catch (err: any) {
      toast.error("Could not load system status");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Refresh every 10 seconds
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [api]);

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
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Storage (/recordings)
              </h3>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {health.disk_percent.toFixed(1)}% Used
              </p>
            </div>
          </div>
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
          <p className="mt-4 text-xs text-gray-400">
            Total Capacity: {formatBytes(health.disk_total)}
          </p>
        </div>

        {/* Uptime Card */}
        <div className="md:col-span-2 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 flex items-center gap-4">
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
      </div>
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
