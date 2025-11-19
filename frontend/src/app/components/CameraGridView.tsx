"use client";

import React, { useState } from "react";
import { Camera } from "@/app/types";
import LiveCameraView from "./LiveCameraView";
import AddCameraBox from "./AddCameraBox";
import { GridColumns } from "@/app/contexts/SettingsContext";
import { History } from "lucide-react"; // Import History icon
import ContinuousPlaybackModal from "./ContinuousPlaybackModal"; // Import Modal

interface CameraGridViewProps {
  cameras: Camera[];
  onCameraSelect: (camera: Camera) => void;
  onAddCameraClick: () => void;
  gridColumns: GridColumns;
}

export default function CameraGridView({
  cameras,
  onCameraSelect,
  onAddCameraClick,
  gridColumns,
}: CameraGridViewProps) {
  const [playbackCamera, setPlaybackCamera] = useState<Camera | null>(null);

  const gridClassMap = {
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
  };
  const gridLayout = gridClassMap[gridColumns] || "lg:grid-cols-4";

  return (
    <>
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${gridLayout}`}>
        {cameras.map((cam) => (
          <div
            key={cam.id}
            className="relative rounded-lg shadow-lg overflow-hidden group"
          >
            {/* Main Click Action */}
            <div
              className="absolute inset-0 z-10 cursor-pointer"
              onClick={() => onCameraSelect(cam)}
              title={`View ${cam.name} (full stream)`}
            />

            <LiveCameraView camera={cam} isMuted={true} />

            {/* Footer Overlay */}
            <div className="absolute bottom-0 left-0 w-full bg-black/50 p-2 pointer-events-none flex justify-between items-center z-20">
              <p className="truncate text-sm font-medium text-white">
                {cam.name}
              </p>

              {/* History Button (Only show if 24/7 is enabled) */}
              {cam.continuous_recording && (
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent opening full stream
                    setPlaybackCamera(cam);
                  }}
                  className="pointer-events-auto rounded-full p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
                  title="View 24/7 History"
                >
                  <History className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}

        <AddCameraBox onClick={onAddCameraClick} />
      </div>

      {/* Playback Modal */}
      <ContinuousPlaybackModal
        isOpen={!!playbackCamera}
        onClose={() => setPlaybackCamera(null)}
        camera={playbackCamera}
      />
    </>
  );
}
