"use client";

import React from "react";
import { Camera } from "@/app/types";
import LiveCameraView from "./LiveCameraView"; // <-- 1. IMPORT RENAMED COMPONENT

interface CameraGridViewProps {
  cameras: Camera[];
  onCameraSelect: (camera: Camera) => void;
}

export default function CameraGridView({
  cameras,
  onCameraSelect,
}: CameraGridViewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cameras.map((cam) => (
        <div
          key={cam.id}
          className="relative rounded-lg shadow-lg overflow-hidden group"
        >
          {/* 2. This overlay triggers the page change */}
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={() => onCameraSelect(cam)}
            title={`View ${cam.name} (full stream)`}
          />
          {/* 3. Render the live player, muted */}
          <LiveCameraView camera={cam} isMuted={true} />
          <div className="absolute bottom-0 left-0 w-full bg-black/50 p-2 pointer-events-none">
            <p className="truncate text-sm font-medium text-white">
              {cam.name}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
