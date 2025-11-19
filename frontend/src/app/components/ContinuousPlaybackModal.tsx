"use client";

import React, { Fragment, useState, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { X, Calendar, Play, Film, Download, Loader } from "lucide-react";
import { Camera } from "@/app/types";
import { useAuth } from "@/app/contexts/AuthContext";
import { format } from "date-fns";

interface Recording {
  filename: string;
  url: string;
  time: string; // HHMMSS
}

interface ContinuousPlaybackModalProps {
  isOpen: boolean;
  onClose: () => void;
  camera: Camera | null;
}

// --- FIX: Changed default port from 8887 to 8080 ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
// --------------------------------------------------

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
}: ContinuousPlaybackModalProps) {
  const { api } = useAuth();
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [currentVideo, setCurrentVideo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

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
        setCurrentVideo(null);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecordings();
  }, [api, camera, selectedDate, isOpen]);

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
    } finally {
      setIsDownloading(false);
    }
  };

  return (
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
                  {/* Video Player */}
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

                    {/* Player Footer / Download */}
                    {currentVideo && (
                      <div className="bg-zinc-800 p-3 flex justify-end border-t border-zinc-700">
                        <button
                          onClick={handleDownload}
                          disabled={isDownloading}
                          className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isDownloading ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          {isDownloading ? "Downloading..." : "Download Clip"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Playlist */}
                  <div className="w-full md:w-80 border-l border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900 overflow-y-auto">
                    <div className="p-4">
                      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Available Clips
                      </h3>

                      {isLoading ? (
                        <p className="text-sm text-gray-500">Loading...</p>
                      ) : recordings.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          No recordings found for this date.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {recordings.map((rec) => (
                            <button
                              key={rec.filename}
                              onClick={() => setCurrentVideo(rec.url)}
                              className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                                currentVideo === rec.url
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                  : "hover:bg-gray-200 dark:hover:bg-zinc-800 dark:text-gray-300"
                              }`}
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
  );
}
