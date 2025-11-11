"use client";

import React, { useState } from "react";
import { Camera } from "@/app/types";
import { toast } from "sonner";
import { Loader, Trash2, Edit, Save, X, Wifi } from "lucide-react"; // --- NEW: Added Wifi icon
import ConfirmDeleteModal from "./ConfirmDeleteModal";

// --- Constants ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface CameraEditRowProps {
  camera: Camera;
  token: string;
  onUpdate: () => void;
}

export default function CameraEditRow({
  camera,
  token,
  onUpdate,
}: CameraEditRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false); // --- NEW ---

  const [name, setName] = useState(camera.name);
  const [rtspUrl, setRtspUrl] = useState(camera.rtsp_url);

  // --- NEW: Test Connection Handler ---
  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const response = await fetch(`${API_URL}/api/cameras/test-connection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rtsp_url: rtspUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Connection test failed");
      }

      toast.success(result.message || "Connection successful!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    // ... (rest of handleSave function is unchanged)
    try {
      const response = await fetch(`${API_URL}/api/cameras/${camera.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name, rtsp_url: rtspUrl }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to update camera");
      }

      toast.success(`Updated "${name}" successfully!`);
      onUpdate(); // This re-fetches the camera list
      setIsEditing(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    // ... (rest of handleDelete function is unchanged)
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_URL}/api/cameras/${camera.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to delete camera");
      }

      toast.success(`Deleted "${camera.name}"`);
      onUpdate(); // Re-fetches the camera list
      setIsConfirmOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    // Reset fields to original state
    setName(camera.name);
    setRtspUrl(camera.rtsp_url);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="rounded-lg border border-blue-500 bg-white p-4 shadow-sm dark:border-blue-700 dark:bg-gray-800">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* ... (inputs for Camera Name and RTSP URL are unchanged) ... */}
          <div>
            <label
              htmlFor={`name-${camera.id}`}
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Camera Name
            </label>
            <input
              type="text"
              id={`name-${camera.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label
              htmlFor={`url-${camera.id}`}
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              RTSP URL
            </label>
            <input
              type="text"
              id={`url-${camera.id}`}
              value={rtspUrl}
              onChange={(e) => setRtspUrl(e.target.value)}
              className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          {/* --- NEW: Test Connection Button --- */}
          <button
            onClick={handleTestConnection}
            disabled={isTesting || !rtspUrl}
            className="flex w-32 items-center justify-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isTesting ? (
              <Loader className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Wifi className="mr-2 h-4 w-4" />
                Test
              </>
            )}
          </button>

          <button
            onClick={handleCancel}
            className="flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex w-28 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    // ... (rest of the non-editing view is unchanged)
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {camera.name}
          </h3>
          <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
            {camera.rtsp_url}
          </p>
        </div>
        <div className="mt-4 flex gap-3 sm:mt-0">
          <button
            onClick={() => setIsConfirmOpen(true)}
            className="flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-red-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/50 dark:hover:text-red-400"
            title="Delete Camera"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </button>
        </div>
      </div>
      <ConfirmDeleteModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDelete}
        cameraName={camera.name}
        isDeleting={isDeleting}
      />
    </div>
  );
}
