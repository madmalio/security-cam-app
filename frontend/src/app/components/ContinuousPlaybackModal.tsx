"use client";

import React, { Fragment, useState, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  X,
  Play,
  Film,
  Download,
  Loader,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Camera } from "@/app/types";
import { useAuth } from "@/app/contexts/AuthContext";
import { toast } from "sonner";
import ConfirmModal from "./ConfirmModal";

interface Recording {
  filename: string;
  url: string;
  time: string;
}

interface ContinuousPlaybackModalProps {
  isOpen: boolean;
  onClose: () => void;
  camera: Camera | null;
  initialDate?: string | null; // <-- NEW
  initialFile?: string | null; // <-- NEW
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const getTodayString = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const adjustedToday = new Date(today.getTime() - offset * 60 * 1000);
  return adjustedToday.toISOString().split("T")[0];
};

export default function ContinuousPlaybackModal({
  isOpen,
  onClose,
  camera,
  initialDate,
  initialFile,
}: ContinuousPlaybackModalProps) {
  const { api } = useAuth();
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [currentVideo, setCurrentVideo] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [recordingToDelete, setRecordingToDelete] = useState<string | null>(
    null
  );

  // --- FIX: Sync date prop to state when modal opens ---
  useEffect(() => {
    if (isOpen && initialDate) {
      setSelectedDate(initialDate);
    } else if (isOpen && !initialDate) {
      setSelectedDate(getTodayString());
    }
  }, [isOpen, initialDate]);

  // --- Fetch Recordings ---
  useEffect(() => {
    if (!camera || !isOpen) return;

    const fetchRecordings = async () => {
      setIsLoading(true);
      try {
        const response = await api(
          `/api/cameras/${camera.id}/recordings?date_str=${selectedDate}`
        );
        if (!response || !response.ok) return;
        const data = await response.json();
        setRecordings(data);

        // --- FIX: Auto-play if initialFile matches ---
        if (initialFile) {
          // The URL format from backend is "continuous/{camID}/{filename}"
          const targetUrl = `continuous/${camera.id}/${initialFile}`;
          // Verify it exists in the list (optional, but safer)
          const exists = data.find(
            (r: Recording) => r.filename === initialFile
          );
          if (exists) {
            setCurrentVideo(targetUrl);
          }
        } else {
          setCurrentVideo(null);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecordings();
  }, [api, camera, selectedDate, isOpen, initialFile]); // Added initialFile

  const formatTime = (timeStr: string) => {
    return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(
      4,
      6
    )}`;
  };

  const handleDownload = async () => {
    if (!currentVideo) return;
    setIsDownloading(true);
    try {
      const response = await api(
        `/api/download?path=${encodeURIComponent(currentVideo)}`
      );
      if (!response || !response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = currentVideo.split("/").pop() || "recording.mp4";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      toast.error("Download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  const confirmDelete = (videoUrl: string) => {
    setRecordingToDelete(videoUrl);
    setIsDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!recordingToDelete || !camera) return;
    setIsDeleting(true);
    const filename = recordingToDelete.split("/").pop();
    try {
      const response = await api(
        `/api/cameras/${camera.id}/recordings/${filename}`,
        { method: "DELETE" }
      );
      if (!response || !response.ok) throw new Error("Delete failed");
      toast.success("Recording deleted");
      setRecordings((prev) => prev.filter((r) => r.url !== recordingToDelete));
      if (currentVideo === recordingToDelete) setCurrentVideo(null);
      setIsDeleteConfirmOpen(false);
      setRecordingToDelete(null);
    } catch (e) {
      toast.error("Failed to delete recording");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/80" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-6xl transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all dark:bg-zinc-900">
                  <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-zinc-800">
                    <div>
                      <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">
                        24/7 History: {camera?.name}
                      </Dialog.Title>
                      <p className="text-sm text-gray-500">
                        Viewing recordings for {selectedDate}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="rounded-md border-gray-300 bg-gray-50 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                      <button
                        onClick={onClose}
                        className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-zinc-800"
                      >
                        <X className="h-6 w-6 text-gray-500" />
                      </button>
                    </div>
                  </div>

                  <div className="flex h-[650px] flex-col md:flex-row">
                    <div className="flex-1 bg-black flex flex-col">
                      <div className="flex-1 flex items-center justify-center relative">
                        {currentVideo ? (
                          <video
                            src={`${API_URL}/recordings/${currentVideo}`}
                            controls
                            autoPlay
                            className="max-h-full max-w-full"
                          />
                        ) : (
                          <div className="text-center text-gray-500">
                            <Film className="mx-auto h-12 w-12 mb-2 opacity-50" />
                            <p>Select a clip to play</p>
                          </div>
                        )}
                      </div>
                      {currentVideo && (
                        <div className="bg-zinc-800 p-3 flex justify-end border-t border-zinc-700 gap-2">
                          <button
                            onClick={() => confirmDelete(currentVideo)}
                            className="flex items-center gap-2 rounded-md bg-red-600/20 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-600 hover:text-white transition-colors"
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                          <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isDownloading ? (
                              <Loader className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}{" "}
                            Download Clip
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="w-full md:w-80 border-l border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900 overflow-y-auto">
                      <div className="p-4">
                        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                          Available Clips
                        </h3>
                        {isLoading ? (
                          <div className="flex justify-center py-4">
                            <Loader className="h-6 w-6 animate-spin text-zinc-500" />
                          </div>
                        ) : recordings.length === 0 ? (
                          <p className="text-sm text-gray-500">
                            No recordings found.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {recordings.map((rec) => (
                              <div
                                key={rec.filename}
                                className={`flex w-full items-center justify-between rounded-lg p-2 transition-colors ${
                                  currentVideo === rec.url
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                    : "hover:bg-gray-200 dark:hover:bg-zinc-800 dark:text-gray-300"
                                }`}
                              >
                                <button
                                  onClick={() => setCurrentVideo(rec.url)}
                                  className="flex flex-1 items-center gap-3 text-left min-w-0"
                                >
                                  <Play className="h-4 w-4 shrink-0" />
                                  <div className="flex-1 truncate">
                                    <span className="block text-sm font-medium">
                                      {formatTime(rec.time)}
                                    </span>
                                    <span className="text-xs opacity-70">
                                      15 min segment
                                    </span>
                                  </div>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    confirmDelete(rec.url);
                                  }}
                                  className="ml-2 rounded-full p-2 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:text-zinc-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Recording"
        confirmText="Delete"
        cameraName={
          recordingToDelete ? recordingToDelete.split("/").pop() || "" : ""
        }
        isLoading={isDeleting}
      />
    </>
  );
}
