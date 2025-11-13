"use client";

import React from "react";

interface EventPlayerProps {
  videoSrc: string; // This will be the relative path, e.g., "rec/file.mp4"
}

// Get API_URL from environment (where the files are served)
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function EventPlayer({ videoSrc }: EventPlayerProps) {
  // Construct the full URL to the static MP4 file
  const fullVideoUrl = `${API_URL}/${videoSrc}`;

  return (
    <div className="relative aspect-video w-full rounded-lg bg-black shadow-lg">
      <video
        src={fullVideoUrl} // Use the direct MP4 URL
        controls
        autoPlay
        playsInline
        className="h-full w-full rounded-lg"
      />
    </div>
  );
}
