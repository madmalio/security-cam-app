"use client";

import React, { useState } from "react";
import { Camera } from "@/app/types";
import { useAuth } from "@/app/contexts/AuthContext";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Pencil,
  Trash2,
  Save,
  X,
  Video,
  Loader,
  Wifi,
  Activity,
  AlertTriangle, // <-- Import Icon
} from "lucide-react";
import { toast } from "sonner";
import ConfirmModal from "./ConfirmModal";
import TestStreamModal from "./TestStreamModal";

interface CameraEditRowProps {
  camera: Camera;
  onUpdate: () => void;
}

export default function CameraEditRow({
  camera,
  onUpdate,
}: CameraEditRowProps) {
  const { api } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(camera.name);
  const [rtspUrl, setRtspUrl] = useState(camera.rtsp_url);
  const [substreamUrl, setSubstreamUrl] = useState(
    camera.rtsp_substream_url || ""
  );
  const [continuousRecording, setContinuousRecording] = useState(
    camera.continuous_recording
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Wipe State
  const [isWiping, setIsWiping] = useState(false);
  const [isConfirmWipeOpen, setIsConfirmWipeOpen] = useState(false);

  // Test Stream Logic
  const [isTesting, setIsTesting] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testStreamPath, setTestStreamPath] = useState<string | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: camera.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await api(`/api/cameras/${camera.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          rtsp_url: rtspUrl,
          rtsp_substream_url: substreamUrl || null,
          continuous_recording: continuousRecording,
        }),
      });
      if (!response) return;

      if (!response.ok) {
        throw new Error("Failed to update camera");
      }

      toast.success("Camera saved successfully");
      setIsEditing(false);
      onUpdate();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await api(`/api/cameras/${camera.id}`, {
        method: "DELETE",
      });
      if (!response) return;

      if (!response.ok) {
        throw new Error("Failed to delete camera");
      }
      toast.success("Camera deleted");
      onUpdate();
    } catch (err: any) {
      toast.error(err.message);
      setIsDeleting(false);
    }
  };

  const handleWipeRecordings = async () => {
    setIsWiping(true);
    setIsConfirmWipeOpen(false);

    try {
      const response = await api(`/api/cameras/${camera.id}/recordings`, {
        method: "DELETE",
      });

      if (!response || !response.ok) {
        throw new Error("Failed to wipe recordings");
      }

      toast.success(`All recordings for ${camera.name} have been deleted.`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsWiping(false);
    }
  };

  const handleTestConnection = async () => {
    if (!rtspUrl) return;
    setIsTesting(true);
    try {
      const response = await api("/api/cameras/test-connection", {
        method: "POST",
        body: JSON.stringify({ rtsp_url: rtspUrl }),
      });
      if (!response) return;
      if (!response.ok) throw new Error("Test failed");

      const data = await response.json();
      setTestStreamPath(data.path);
      setIsTestModalOpen(true);
    } catch (err: any) {
      toast.error("Connection failed: Check URL");
    } finally {
      setIsTesting(false);
    }
  };

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex flex-col gap-4 rounded-lg border-2 border-blue-500 bg-white p-4 shadow-sm dark:border-blue-400 dark:bg-zinc-800"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-zinc-400">
              Camera Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-zinc-400">
              Main Stream (RTSP)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={rtspUrl}
                onChange={(e) => setRtspUrl(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
              />
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="rounded-md bg-gray-100 p-2 text-gray-600 hover:bg-gray-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                title="Test Stream"
              >
                {isTesting ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-zinc-400">
              Substream (Optional)
            </label>
            <input
              type="text"
              value={substreamUrl}
              onChange={(e) => setSubstreamUrl(e.target.value)}
              placeholder="Lower res for motion detection"
              className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
            />
          </div>
          <div className="flex items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={continuousRecording}
                onChange={(e) => setContinuousRecording(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                Enable 24/7 Recording
              </span>
            </label>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="mt-2 pt-4 border-t border-gray-200 dark:border-zinc-700">
          <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-3">
            Danger Zone
          </h4>
          <button
            type="button"
            onClick={() => setIsConfirmWipeOpen(true)}
            disabled={isWiping}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            {isWiping ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete All Recordings
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={() => setIsEditing(false)}
            className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4" /> Save
              </>
            )}
          </button>
        </div>

        <TestStreamModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          testStreamPath={testStreamPath}
        />

        {/* Wipe Confirmation */}
        <ConfirmModal
          isOpen={isConfirmWipeOpen}
          onClose={() => setIsConfirmWipeOpen(false)}
          onConfirm={handleWipeRecordings}
          title="Clear Camera History"
          confirmText="Delete All"
          message={
            <div className="space-y-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Are you sure you want to delete <strong>all recordings</strong>{" "}
                for{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {camera.name}
                </span>
                ?
              </p>
              <p className="text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="inline h-4 w-4 mr-1 -mt-0.5" />
                This will remove all 24/7 history and motion events. This cannot
                be undone.
              </p>
            </div>
          }
          isLoading={isWiping}
        />
      </div>
    );
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="group flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800"
      >
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          <GripVertical className="h-5 w-5" />
        </div>

        <div className="flex h-10 w-16 flex-shrink-0 items-center justify-center rounded bg-gray-100 dark:bg-zinc-700">
          <Video className="h-5 w-5 text-gray-500 dark:text-zinc-400" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="truncate font-medium text-gray-900 dark:text-white">
            {camera.name}
          </h3>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400">
            <span className="truncate max-w-[200px]">{camera.rtsp_url}</span>
            {camera.continuous_recording && (
              <span className="flex items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <Activity className="h-3 w-3" /> 24/7
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setIsEditing(true)}
            className="rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-blue-400"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsConfirmOpen(true)}
            className="rounded p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title="Delete Camera"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Delete Camera Confirmation */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Camera"
        confirmText="Delete"
        cameraName={camera.name}
        isLoading={isDeleting}
      />
    </>
  );
}
