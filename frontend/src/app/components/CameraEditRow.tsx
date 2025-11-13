"use client";

import React, { useState } from "react";
import { Camera } from "@/app/types";
import { toast } from "sonner";
import {
  Loader,
  Trash2,
  Edit,
  Save,
  X,
  Wifi,
  GripVertical,
  Copy,
  Check,
} from "lucide-react";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import TestStreamModal from "./TestStreamModal";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/app/contexts/AuthContext";

// --- 2. Get API_URL from environment ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testStreamPath, setTestStreamPath] = useState<string | null>(null);

  const [name, setName] = useState(camera.name);
  const [rtspUrl, setRtspUrl] = useState(camera.rtsp_url);

  // --- 3. State for copy button ---
  const [isCopied, setIsCopied] = useState(false);

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
    zIndex: isDragging ? 10 : "auto",
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const response = await api("/api/cameras/test-connection", {
        method: "POST",
        body: JSON.stringify({ rtsp_url: camera.rtsp_url }),
      });
      if (!response) return;

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to start test");
      }

      const data = await response.json();
      setTestStreamPath(data.path);
      setIsTestModalOpen(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await api(`/api/cameras/${camera.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: name, rtsp_url: rtspUrl }),
      });
      if (!response) return;

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to update camera");
      }

      toast.success(`Updated "${name}" successfully!`);
      onUpdate();
      setIsEditing(false);
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
        const err = await response.json();
        throw new Error(err.detail || "Failed to delete camera");
      }

      toast.success(`Deleted "${camera.name}"`);
      onUpdate();
      setIsConfirmOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    setName(camera.name);
    setRtspUrl(camera.rtsp_url);
    setIsEditing(false);
  };

  // --- 4. NEW: Handle copy to clipboard ---
  const webhookUrl = `${API_URL}/api/webhook/motion/${camera.webhook_secret}`;
  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setIsCopied(true);
    toast.success("Webhook URL copied to clipboard!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (isEditing) {
    return (
      <>
        <div
          ref={setNodeRef}
          style={style}
          className="rounded-lg border border-blue-500 bg-white p-4 shadow-sm dark:border-blue-700 dark:bg-zinc-800"
        >
          <div className="flex items-center mb-4">
            <button
              className="cursor-not-allowed p-2 text-gray-300 dark:text-zinc-600"
              disabled={true}
            >
              <GripVertical className="h-5 w-5" />
            </button>
            <p className="ml-2 text-sm text-gray-500 dark:text-zinc-500">
              Save changes to enable reordering
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`name-${camera.id}`}
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-zinc-300"
              >
                Camera Name
              </label>
              <input
                type="text"
                id={`name-${camera.id}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor={`url-${camera.id}`}
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-zinc-300"
              >
                RTSP URL
              </label>
              <input
                type="text"
                id={`url-${camera.id}`}
                value={rtspUrl}
                onChange={(e) => setRtspUrl(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={handleCancel}
              className="flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
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
        <TestStreamModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          testStreamPath={testStreamPath}
        />
      </>
    );
  }

  return (
    // This is the "View" mode
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center">
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab p-2 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-700 rounded-md"
              title="Drag to reorder"
            >
              <GripVertical className="h-5 w-5" />
            </button>
            <div className="ml-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {camera.name}
              </h3>
              <p className="mt-1 truncate text-sm text-gray-500 dark:text-zinc-400">
                {camera.rtsp_url}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-3 sm:mt-0">
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex w-24 items-center justify-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
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
              onClick={() => setIsEditing(true)}
              className="flex items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </button>
            <button
              onClick={() => setIsConfirmOpen(true)}
              className="flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-red-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-900/50 dark:hover:text-red-400"
              title="Delete Camera"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* --- 5. NEW: Webhook URL Section --- */}
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-zinc-700">
          <label
            htmlFor={`webhook-${camera.id}`}
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-zinc-300"
          >
            Motion Webhook URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              id={`webhook-${camera.id}`}
              value={webhookUrl}
              readOnly
              className="w-full flex-1 rounded-md border border-gray-300 bg-gray-50 p-2 text-gray-600 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
            />
            <button
              onClick={handleCopy}
              className={`flex w-12 items-center justify-center rounded-lg ${
                isCopied
                  ? "bg-green-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-500"
              }`}
              title="Copy to clipboard"
            >
              {isCopied ? (
                <Check className="h-5 w-5" />
              ) : (
                <Copy className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
      <ConfirmDeleteModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDelete}
        cameraName={camera.name}
        isDeleting={isDeleting}
      />
      <TestStreamModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        testStreamPath={testStreamPath}
      />
    </>
  );
}
