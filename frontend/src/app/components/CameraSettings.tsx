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
import { useAuth } from "@/app/contexts/AuthContext"; // <-- 1. IMPORT

interface CameraSettingsProps {
  cameras: Camera[];
  onCamerasUpdate: () => void;
}

export default function CameraSettings({
  cameras: initialCameras,
  onCamerasUpdate,
}: CameraSettingsProps) {
  const { api } = useAuth(); // <-- 2. Get api from context
  const [cameras, setCameras] = useState<Camera[]>(initialCameras);

  useEffect(() => {
    setCameras(initialCameras);
  }, [initialCameras]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = cameras.findIndex((c) => c.id === active.id);
      const newIndex = cameras.findIndex((c) => c.id === over.id);
      const newOrderedCameras = arrayMove(cameras, oldIndex, newIndex);
      setCameras(newOrderedCameras);

      const newCameraIds = newOrderedCameras.map((c) => c.id);

      try {
        const response = await api("/api/cameras/reorder", {
          // <-- 3. Use api
          method: "POST",
          body: JSON.stringify({ camera_ids: newCameraIds }),
        });
        if (!response) return;

        if (!response.ok) {
          throw new Error("Failed to save new order");
        }
        toast.success("Camera order saved!");
        onCamerasUpdate();
      } catch (err: any) {
        toast.error(err.message);
        setCameras(initialCameras);
      }
    }
  }

  return (
    <div className="space-y-8 max-w-4xl pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
          Camera Settings
        </h1>
        <p className="mt-1 text-gray-500 dark:text-zinc-400">
          Drag and drop cameras to reorder them. This order will be reflected on
          your dashboard.
        </p>
      </div>

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
              <p className="text-gray-500 dark:text-zinc-400">
                You have not added any cameras yet.
              </p>
            ) : (
              cameras.map((camera) => (
                <CameraEditRow
                  key={camera.id}
                  camera={camera}
                  onUpdate={onCamerasUpdate}
                  // 4. No more token prop
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
