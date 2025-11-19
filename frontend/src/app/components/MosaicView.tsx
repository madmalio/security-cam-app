"use client";

import React, { useState, useEffect } from "react";
import { Camera } from "@/app/types";
import LiveCameraView from "./LiveCameraView";
import MosaicLiveView from "./MosaicLiveView";
import { Pause, Play, X, ArrowLeft } from "lucide-react";

interface MosaicViewProps {
  cameras: Camera[];
  onExitFullscreen: () => void;
}

const CYCLE_TIME_MS = 15000; // 15 seconds

export default function MosaicView({
  cameras,
  onExitFullscreen,
}: MosaicViewProps) {
  const [mosaicMode, setMosaicMode] = useState<"grid" | "focus">("grid");
  const [focusedCamera, setFocusedCamera] = useState<Camera | null>(null);
  const [mainCamera, setMainCamera] = useState<Camera>(cameras[0]);
  const [otherCameras, setOtherCameras] = useState<Camera[]>(
    cameras.slice(1, 6)
  );
  const [isCycling, setIsCycling] = useState(true);

  useEffect(() => {
    if (mosaicMode !== "grid" || !isCycling || cameras.length < 2) return;

    const intervalId = setInterval(() => {
      setMainCamera((currentFocus) => {
        const currentIndex = cameras.findIndex((c) => c.id === currentFocus.id);
        const nextIndex = (currentIndex + 1) % cameras.length;
        return cameras[nextIndex];
      });
    }, CYCLE_TIME_MS);

    return () => clearInterval(intervalId);
  }, [mosaicMode, isCycling, cameras]);

  useEffect(() => {
    setOtherCameras(cameras.filter((c) => c.id !== mainCamera.id).slice(0, 5));
  }, [mainCamera, cameras]);

  const handleCameraClick = (camera: Camera) => {
    setFocusedCamera(camera);
    setMosaicMode("focus");
    setIsCycling(false);
  };

  const handleGoBackToGrid = () => {
    setMosaicMode("grid");
    setFocusedCamera(null);
    setIsCycling(true);
  };

  const CameraTile = ({
    camera,
    isMuted = true,
  }: {
    camera: Camera | undefined;
    isMuted?: boolean;
  }) => {
    if (!camera) {
      return (
        <div className="rounded-lg bg-zinc-900/50 flex items-center justify-center" />
      );
    }
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

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {mosaicMode === "focus" && focusedCamera ? (
        // --- SINGLE FOCUS VIEW ---
        <div className="w-full h-full relative group">
          <MosaicLiveView camera={focusedCamera} isMuted={false} />
          <button
            onClick={handleGoBackToGrid}
            className="absolute top-4 left-4 z-[60] flex items-center gap-2 rounded-full bg-black/50 p-2 text-white hover:bg-white/20 backdrop-blur-sm transition-colors"
            title="Back to Mosaic View"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
        </div>
      ) : (
        // --- 1+5 GRID VIEW ---
        <div className="w-full h-full p-1">
          <div className="grid grid-cols-3 grid-rows-3 gap-1 h-full">
            {/* Main Focus View */}
            <div className="col-span-2 row-span-2 relative rounded-lg shadow-lg overflow-hidden group bg-zinc-900">
              <div
                className="absolute inset-0 z-10 cursor-pointer"
                onClick={() => handleCameraClick(mainCamera)}
                title={`Focus on ${mainCamera.name}`}
              />
              {/* --- PASS FILL=TRUE TO REMOVE BLACK BARS --- */}
              <LiveCameraView camera={mainCamera} isMuted={false} fill={true} />
              {/* ------------------------------------------ */}

              <div className="absolute bottom-0 left-0 w-full bg-black/50 p-2 pointer-events-none">
                <p className="truncate text-sm font-medium text-white">
                  {mainCamera.name}
                </p>
              </div>

              {/* Control buttons */}
              <div className="absolute top-4 right-4 z-20 flex gap-2">
                <button
                  onClick={() => setIsCycling(!isCycling)}
                  className="rounded-full bg-black/50 p-2 text-white hover:bg-white/20 backdrop-blur-sm transition-colors"
                  title={isCycling ? "Pause Auto-Cycle" : "Play Auto-Cycle"}
                >
                  {isCycling ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </button>
                <button
                  onClick={onExitFullscreen}
                  className="rounded-full bg-black/50 p-2 text-white hover:bg-white/20 backdrop-blur-sm transition-colors"
                  title="Exit Fullscreen"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Small Views */}
            <CameraTile camera={otherCameras[0]} />
            <CameraTile camera={otherCameras[1]} />
            <CameraTile camera={otherCameras[2]} />
            <CameraTile camera={otherCameras[3]} />
            <CameraTile camera={otherCameras[4]} />
          </div>
        </div>
      )}
    </div>
  );
}
