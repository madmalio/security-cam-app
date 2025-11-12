"use client";

import React, { useState } from "react";
import { Camera } from "@/app/types";
import LiveCameraView from "./LiveCameraView";
import FullscreenLiveView from "./FullscreenLiveView";
import { X, ArrowLeft } from "lucide-react";
import { GridColumns } from "@/app/contexts/SettingsContext"; // <-- 1. IMPORT

interface FullscreenGridViewProps {
  cameras: Camera[];
  onExitFullscreen: () => void;
  gridColumns: GridColumns; // <-- 2. ADD PROP
}

export default function FullscreenGridView({
  cameras,
  onExitFullscreen,
  gridColumns, // <-- 3. RECEIVE PROP
}: FullscreenGridViewProps) {
  const [mode, setMode] = useState<"grid" | "focus">("grid");
  const [focusedCamera, setFocusedCamera] = useState<Camera | null>(null);

  const handleCameraClick = (camera: Camera) => {
    setFocusedCamera(camera);
    setMode("focus");
  };

  const handleGoBackToGrid = () => {
    setMode("grid");
    setFocusedCamera(null);
  };

  const CameraTile = ({
    camera,
    isMuted = true,
  }: {
    camera: Camera | undefined;
    isMuted?: boolean;
  }) => {
    if (!camera) return null;
    return (
      <div
        key={camera.id}
        className="relative rounded-lg shadow-lg overflow-hidden group"
      >
        <div
          className="absolute inset-0 z-10 cursor-pointer"
          onClick={() => handleCameraClick(camera)}
          title={`Focus on ${camera.name}`}
        />
        <LiveCameraView camera={camera} isMuted={isMuted} />
        <div className="absolute bottom-0 left-0 w-full bg-black/50 p-1 pointer-events-none">
          <p className="truncate text-xs font-medium text-white">
            {camera.name}
          </p>
        </div>
      </div>
    );
  };

  // --- 4. DYNAMIC GRID CLASSES ---
  const gridClassMap = {
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
  };
  const gridLayout = gridClassMap[gridColumns] || "lg:grid-cols-4";

  return (
    <div className="fixed inset-0 z-50 bg-black p-4 flex items-center justify-center">
      {mode === "focus" && focusedCamera ? (
        // --- SINGLE FOCUS VIEW ---
        <div className="w-full max-w-full max-h-full aspect-video relative group">
          <FullscreenLiveView camera={focusedCamera} isMuted={false} />
          <button
            onClick={handleGoBackToGrid}
            className="absolute top-2 left-2 z-20 flex items-center gap-2 rounded-full p-2 text-white/70 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-white"
            title="Back to Grid View"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
      ) : (
        // --- FULL GRID VIEW ---
        <div className="w-full h-full">
          {/* Header with Exit Button */}
          <div className="flex justify-end mb-2">
            <button
              onClick={onExitFullscreen}
              className="rounded-full bg-black/50 p-2 text-white hover:bg-black/80"
              title="Exit Fullscreen"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Scrollable Grid Container */}
          <div className="w-full h-[calc(100%-40px)] overflow-y-auto">
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 ${gridLayout}`}
            >
              {cameras.map((camera) => (
                <CameraTile key={camera.id} camera={camera} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
