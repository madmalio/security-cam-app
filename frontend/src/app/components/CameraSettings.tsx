"use client";

import React, { useState, useEffect } from "react";
import { Camera } from "@/app/types";
import CameraEditRow from "./CameraEditRow";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { toast } from "sonner";

// --- Constants ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface CameraSettingsProps {
  token: string;
  cameras: Camera[];
  onCamerasUpdate: () => void;
}

export default function CameraSettings({
  token,
  cameras: initialCameras,
  onCamerasUpdate,
}: CameraSettingsProps) {
  // --- 1. NEW: State to manage camera order locally ---
  const [cameras, setCameras] = useState<Camera[]>(initialCameras);

  // Update local state if the prop changes (e.g., after a delete)
  useEffect(() => {
    setCameras(initialCameras);
  }, [initialCameras]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px drag to start
      },
    })
  );

  // --- 2. NEW: Handler for when dragging ends ---
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      // 1. Update UI instantly
      const oldIndex = cameras.findIndex((c) => c.id === active.id);
      const newIndex = cameras.findIndex((c) => c.id === over.id);
      const newOrderedCameras = arrayMove(cameras, oldIndex, newIndex);
      setCameras(newOrderedCameras);

      // 2. Get just the IDs in the new order
      const newCameraIds = newOrderedCameras.map((c) => c.id);

      // 3. Send to API
      try {
        const response = await fetch(`${API_URL}/api/cameras/reorder`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ camera_ids: newCameraIds }),
        });

        if (!response.ok) {
          throw new Error("Failed to save new order");
        }
        toast.success("Camera order saved!");
        onCamerasUpdate(); // Re-fetch from server to confirm
      } catch (err: any) {
        toast.error(err.message);
        setCameras(initialCameras); // Revert on failure
      }
    }
  }

  return (
    <div className="space-y-8 max-w-4xl pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
          Camera Settings
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          Drag and drop cameras to reorder them. This order will be reflected on
          your dashboard.
        </p>
      </div>

      {/* --- 3. NEW: DND Context Wrapper --- */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={cameras.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
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
        </SortableContext>
      </DndContext>
    </div>
  );
}
