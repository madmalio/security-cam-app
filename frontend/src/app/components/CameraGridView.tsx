"use client";

import React from "react";
import { Camera } from "@/app/types";
import CameraGridItem from "./CameraGridItem";

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
        <CameraGridItem
          key={cam.id}
          camera={cam}
          onClick={() => onCameraSelect(cam)}
        />
      ))}
    </div>
  );
}
