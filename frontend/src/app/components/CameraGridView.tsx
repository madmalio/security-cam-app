"use client";

import React from "react";
import { Camera } from "@/app/types";
import LiveCameraView from "./LiveCameraView";
import AddCameraBox from "./AddCameraBox"; // <-- 1. Import new component

interface CameraGridViewProps {
  cameras: Camera[];
  onCameraSelect: (camera: Camera) => void;
  onAddCameraClick: () => void; // <-- 2. Add this prop
}

export default function CameraGridView({
  cameras,
  onCameraSelect,
  onAddCameraClick, // <-- 3. Receive this prop
}: CameraGridViewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cameras.map((cam) => (
        <div
          key={cam.id}
          className="relative rounded-lg shadow-lg overflow-hidden group"
        >
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={() => onCameraSelect(cam)}
            title={`View ${cam.name} (full stream)`}
          />
          <LiveCameraView camera={cam} isMuted={true} />
          <div className="absolute bottom-0 left-0 w-full bg-black/50 p-2 pointer-events-none">
            <p className="truncate text-sm font-medium text-white">
              {cam.name}
            </p>
          </div>
        </div>
      ))}

      {/* --- 4. Render the new box --- */}
      <AddCameraBox onClick={onAddCameraClick} />
    </div>
  );
}
