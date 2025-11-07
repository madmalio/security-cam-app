"use client";

import React, { useState, useEffect } from "react";
import { Camera } from "@/app/types";
import { Loader, AlertTriangle } from "lucide-react";

// --- Constants ---
const MEDIAMTX_STATIC_URL = "http://localhost:8889"; // Points to nginx

interface CameraGridItemProps {
  camera: Camera;
  onClick: () => void;
}

export default function CameraGridItem({
  camera,
  onClick,
}: CameraGridItemProps) {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const refreshInterval = 2000; // Refresh snapshot every 2 seconds

  useEffect(() => {
    // This is the new URL to the static file served by port 8889 (nginx)
    const staticSnapshotUrl = `${MEDIAMTX_STATIC_URL}/${camera.path}/snapshot.jpg`;

    const refresh = () => {
      // Add timestamp to break browser cache
      setSnapshotUrl(`${staticSnapshotUrl}?timestamp=${Date.now()}`);
    };

    refresh(); // Initial load
    const intervalId = setInterval(refresh, refreshInterval);

    // Cleanup function
    return () => {
      clearInterval(intervalId);
    };
  }, [camera.path]);

  return (
    <button
      onClick={onClick}
      className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-black shadow-lg transition-all hover:ring-2 hover:ring-blue-500"
    >
      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Loader className="h-8 w-8 animate-spin text-white" />
          <p className="mt-2 text-sm text-gray-300">Loading Snapshot...</p>
        </div>
      )}

      {/* Error State */}
      {isError && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="mt-2 text-sm text-white">Snapshot failed</p>
        </div>
      )}

      {/* Image Display */}
      <img
        src={snapshotUrl || ""}
        alt={camera.name}
        className={`h-full w-full object-cover ${
          snapshotUrl && !isError ? "block" : "hidden"
        }`}
        onLoad={() => {
          setIsLoading(false);
          setIsError(false);
        }}
        onError={() => {
          setIsLoading(false);
          setIsError(true);
        }}
      />

      {/* Camera Name Overlay */}
      <div className="absolute bottom-0 left-0 w-full bg-black/50 p-2">
        <p className="truncate text-sm font-medium text-white">{camera.name}</p>
      </div>
    </button>
  );
}
