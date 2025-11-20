"use client";

import React, { useState } from "react";
import { Download, Loader, Trash2 } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";

interface EventPlayerProps {
  videoSrc: string;
  onDelete?: () => void; // <-- New Prop
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function EventPlayer({ videoSrc, onDelete }: EventPlayerProps) {
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
      <div className="flex justify-end gap-2">
        {/* Delete Button */}
        {onDelete && (
          <button
            onClick={onDelete}
            className="flex items-center gap-2 rounded-md bg-red-600/10 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-600 hover:text-white dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}

        {/* Download Button */}
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
