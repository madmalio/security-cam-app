"use client";

import React from "react";
import { Camera } from "@/app/types";
import LiveCameraView from "./LiveCameraView";
import AddCameraBox from "./AddCameraBox";
import { GridColumns } from "@/app/contexts/SettingsContext";

interface CameraGridViewProps {
  cameras: Camera[];
  onCameraSelect: (camera: Camera) => void;
  onAddCameraClick: () => void;
  gridColumns: GridColumns;
  // No more token prop
}

export default function CameraGridView({
  cameras,
  onCameraSelect,
  onAddCameraClick,
  gridColumns,
}: CameraGridViewProps) {
  const gridClassMap = {
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
  };
  const gridLayout = gridClassMap[gridColumns] || "lg:grid-cols-4";

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${gridLayout}`}>
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

      <AddCameraBox onClick={onAddCameraClick} />
    </div>
  );
}
