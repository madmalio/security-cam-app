"use client";

import React from "react";
import { Camera } from "@/app/types";
import LiveCameraView from "./LiveCameraView";

interface FocusViewProps {
  cameras: Camera[];
  selectedCamera: Camera;
  onSelectCamera: (camera: Camera) => void;
  onFocusClick: (camera: Camera) => void;
}

export default function FocusView({
  cameras,
  selectedCamera,
  onSelectCamera,
  onFocusClick,
}: FocusViewProps) {
  const otherCameras = cameras.filter((c) => c.id !== selectedCamera.id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full">
      {/* Main Focus View (takes 3/4 width) */}
      <div className="lg:col-span-3 min-w-0">
        <div
          // --- FIX: Added 'aspect-video' and 'bg-black' ---
          className="relative aspect-video rounded-lg shadow-lg overflow-hidden group bg-black"
          // ------------------------------------------------
          title={`View ${selectedCamera.name} (full stream)`}
        >
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={() => onFocusClick(selectedCamera)}
          />
          <LiveCameraView camera={selectedCamera} isMuted={false} />

          {/* Overlay Name */}
          <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pointer-events-none">
            <p className="text-lg font-bold text-white drop-shadow-md">
              {selectedCamera.name}
            </p>
          </div>
        </div>
      </div>

      {/* Sidebar Camera List (takes 1/4 width) */}
      <div className="w-full flex-shrink-0 flex flex-col min-h-0">
        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
          {otherCameras.map((cam) => (
            <div
              key={cam.id}
              // --- FIX: Added 'aspect-video' here too for stability ---
              className="relative aspect-video rounded-lg shadow-lg overflow-hidden group bg-black shrink-0"
              // --------------------------------------------------------
            >
              <div
                className="absolute inset-0 z-10 cursor-pointer border-2 border-transparent hover:border-blue-500 transition-all rounded-lg"
                onClick={() => onSelectCamera(cam)}
                title={`Focus on ${cam.name}`}
              />
              <LiveCameraView camera={cam} isMuted={true} />

              <div className="absolute bottom-0 left-0 w-full bg-black/50 p-2 pointer-events-none">
                <p className="truncate text-xs font-medium text-white">
                  {cam.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
