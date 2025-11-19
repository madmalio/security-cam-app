"use client";

import React, { useState } from "react";
import { Camera } from "@/app/types";
import LiveCameraView from "./LiveCameraView";
import MosaicLiveView from "./MosaicLiveView";
import { X, ArrowLeft } from "lucide-react";
import { GridColumns } from "@/app/contexts/SettingsContext";

interface FullscreenGridViewProps {
  cameras: Camera[];
  onExitFullscreen: () => void;
  gridColumns: GridColumns;
}

export default function FullscreenGridView({
  cameras,
  onExitFullscreen,
  gridColumns,
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
        className="relative rounded-lg shadow-lg overflow-hidden group bg-zinc-900"
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

  const gridClassMap = {
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
  };
  const gridLayout = gridClassMap[gridColumns] || "lg:grid-cols-4";

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Floating Exit Button */}
      <button
        onClick={onExitFullscreen}
        className="absolute top-4 right-4 z-[60] rounded-full bg-black/50 p-2 text-white hover:bg-white/20 backdrop-blur-sm transition-colors"
        title="Exit Fullscreen"
      >
        <X className="h-6 w-6" />
      </button>

      {mode === "focus" && focusedCamera ? (
        // --- SINGLE FOCUS VIEW ---
        <div className="w-full h-full relative group bg-black">
          {/* Uses full height/width with object-contain in MosaicLiveView */}
          <MosaicLiveView camera={focusedCamera} isMuted={false} />

          <button
            onClick={handleGoBackToGrid}
            className="absolute top-4 left-4 z-[60] flex items-center gap-2 rounded-full bg-black/50 p-2 text-white hover:bg-white/20 backdrop-blur-sm transition-colors"
            title="Back to Grid View"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
        </div>
      ) : (
        // --- FULL GRID VIEW ---
        <div className="w-full h-full overflow-y-auto p-2">
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 ${gridLayout} min-h-full content-start`}
          >
            {cameras.map((camera) => (
              <CameraTile key={camera.id} camera={camera} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
