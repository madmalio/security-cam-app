"use client";

import React, { useState } from "react";
import { Camera } from "@/app/types";
import LiveCameraView from "./LiveCameraView";
import AddCameraBox from "./AddCameraBox";
import { GridColumns } from "@/app/contexts/SettingsContext";
import { History, Film, Settings, Trash2 } from "lucide-react";
import ContinuousPlaybackModal from "./ContinuousPlaybackModal";

interface CameraGridViewProps {
  cameras: Camera[];
  onCameraSelect: (camera: Camera) => void;
  onAddCameraClick: () => void;
  gridColumns: GridColumns;
  onViewEvents: (camera: Camera) => void;
  onEditCamera: (camera: Camera) => void;
  onDeleteCamera: (camera: Camera) => void;
}

export default function CameraGridView({
  cameras,
  onCameraSelect,
  onAddCameraClick,
  gridColumns,
  onViewEvents,
  onEditCamera,
  onDeleteCamera,
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
            // --- FIX: Added 'aspect-video' to force 16:9 ratio immediately ---
            className="relative aspect-video rounded-lg shadow-lg overflow-hidden group bg-black"
            // -----------------------------------------------------------------
          >
            {/* Main Click Action (View Fullscreen) */}
            <div
              className="absolute inset-0 z-10 cursor-pointer"
              onClick={() => onCameraSelect(cam)}
              title={`View ${cam.name} (full stream)`}
            />

            <LiveCameraView camera={cam} isMuted={true} />

            {/* Footer Overlay - HUD */}
            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 flex justify-between items-end z-20 opacity-100 transition-opacity">
              <div className="pointer-events-none">
                <p className="truncate text-sm font-bold text-white drop-shadow-md">
                  {cam.name}
                </p>
                {cam.continuous_recording && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] text-gray-300 uppercase font-medium">
                      REC
                    </span>
                  </div>
                )}
              </div>

              {/* Action Toolbar (Visible on Hover/Touch) */}
              <div className="flex items-center gap-1 pointer-events-auto translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200">
                {/* 1. History (24/7) */}
                {cam.continuous_recording && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlaybackCamera(cam);
                    }}
                    className="rounded-full p-2 bg-white/10 text-white hover:bg-blue-600 hover:text-white backdrop-blur-sm transition-colors"
                    title="24/7 History"
                  >
                    <History className="h-4 w-4" />
                  </button>
                )}

                {/* 2. Events */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewEvents(cam);
                  }}
                  className="rounded-full p-2 bg-white/10 text-white hover:bg-blue-600 hover:text-white backdrop-blur-sm transition-colors"
                  title="View Events"
                >
                  <Film className="h-4 w-4" />
                </button>

                {/* 3. Edit */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditCamera(cam);
                  }}
                  className="rounded-full p-2 bg-white/10 text-white hover:bg-gray-600 hover:text-white backdrop-blur-sm transition-colors"
                  title="Edit Details"
                >
                  <Settings className="h-4 w-4" />
                </button>

                {/* 4. Delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCamera(cam);
                  }}
                  className="rounded-full p-2 bg-white/10 text-white hover:bg-red-600 hover:text-white backdrop-blur-sm transition-colors"
                  title="Delete Camera"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
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
