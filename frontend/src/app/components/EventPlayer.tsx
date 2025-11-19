"use client";

import React, { useState } from "react";
import { Download, Loader } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";

interface EventPlayerProps {
  videoSrc: string; // e.g. "recordings/event_1_....mp4"
}

// --- FIX: Changed default port from 8887 to 8080 ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
// --------------------------------------------------

export default function EventPlayer({ videoSrc }: EventPlayerProps) {
  const { api } = useAuth();
  const [isDownloading, setIsDownloading] = useState(false);

  const fullVideoUrl = `${API_URL}/${videoSrc}`;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await api(
        `/api/download?path=${encodeURIComponent(videoSrc)}`
      );
      if (!response || !response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = videoSrc.split("/").pop() || "recording.mp4";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Download error", e);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
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
          Download Clip
        </button>
      </div>
      <div className="relative aspect-video w-full rounded-lg bg-black shadow-lg">
        <video
          src={fullVideoUrl}
          controls
          autoPlay
          playsInline
          className="h-full w-full rounded-lg"
        />
      </div>
    </div>
  );
}
