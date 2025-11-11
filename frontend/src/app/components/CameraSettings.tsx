"use client";

import React from "react";
import { Camera } from "@/app/types";
import CameraEditRow from "./CameraEditRow";

interface CameraSettingsProps {
  token: string;
  cameras: Camera[];
  onCamerasUpdate: () => void;
}

export default function CameraSettings({
  token,
  cameras,
  onCamerasUpdate,
}: CameraSettingsProps) {
  return (
    <div className="space-y-8 max-w-4xl pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
          Camera Settings
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          Manage your connected cameras.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {cameras.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">
            You have not added any cameras yet.
          </p>
        ) : (
          cameras.map((camera) => (
            <CameraEditRow
              key={camera.id}
              camera={camera}
              token={token}
              onUpdate={onCamerasUpdate}
            />
          ))
        )}
      </div>
    </div>
  );
}
