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
    // --- THIS IS THE FIX ---
    // Switched from Flexbox to a 4-column CSS Grid.
    // The main view takes 3 columns, the side list takes 1.
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full">
      {/* Main Focus View (takes 3/4 width) */}
      <div className="lg:col-span-3 min-w-0">
        <div
          className="relative rounded-lg shadow-lg overflow-hidden group"
          title={`View ${selectedCamera.name} (full stream)`}
        >
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={() => onFocusClick(selectedCamera)}
          />
          <LiveCameraView camera={selectedCamera} isMuted={false} />
        </div>
      </div>

      {/* Sidebar Camera List (takes 1/4 width) */}
      <div className="w-full flex-shrink-0 flex flex-col min-h-0">
        {/* This div scrolls if the content overflows */}
        <div className="flex flex-col gap-2 overflow-y-auto">
          {otherCameras.map((cam) => (
            <div
              key={cam.id}
              className="relative rounded-lg shadow-lg overflow-hidden group"
            >
              <div
                className="absolute inset-0 z-10 cursor-pointer"
                onClick={() => onSelectCamera(cam)}
                title={`Focus on ${cam.name}`}
              />
              <LiveCameraView camera={cam} isMuted={true} />
              <div className="absolute bottom-0 left-0 w-full bg-black/50 p-1 pointer-events-none">
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
