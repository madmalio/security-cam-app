"use client";

import React, { useState, FormEvent } from "react";
import { Camera } from "@/app/types";
import { Loader } from "lucide-react";
import { toast } from "sonner";

// --- Constants ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface AddCameraModalProps {
  token: string;
  onClose: () => void;
  onCameraAdded: (newCamera: Camera) => void;
}

export default function AddCameraModal({
  token,
  onClose,
  onCameraAdded,
}: AddCameraModalProps) {
  const [name, setName] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/cameras`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name,
          rtsp_url: rtspUrl,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to add camera");
      }

      const newCamera: Camera = await response.json();
      onCameraAdded(newCamera);
      onClose();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <h3 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Add New Camera
        </h3>
        {error && (
          <div className="mb-4 rounded-md bg-red-100 p-3 text-center text-sm text-red-700 dark:bg-red-900 dark:text-red-200">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="cam-name"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Camera Name
            </label>
            <input
              type="text"
              id="cam-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g., Front Door"
              className="w-full rounded-md border border-gray-300 p-2.5 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="mb-6">
            <label
              htmlFor="cam-url"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              RTSP Stream URL
            </label>
            <input
              type="text"
              id="cam-url"
              value={rtspUrl}
              onChange={(e) => setRtspUrl(e.target.value)}
              required
              placeholder="rtsp://user:pass@192.168.1.100/stream"
              className="w-full rounded-md border border-gray-300 p-2.5 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? <Loader className="h-5 w-5 animate-spin" /> : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
