"use client";

import React, { useState, useEffect, useRef } from "react";
import { Camera } from "@/app/types";
import { Loader, AlertTriangle, VolumeX, Volume2, ZoomIn } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";

const MEDIAMTX_URL =
  process.env.NEXT_PUBLIC_WHEP_URL || "http://localhost:8888";

interface LiveCameraViewProps {
  camera: Camera | null;
  isMuted?: boolean;
  fill?: boolean;
}

export default function LiveCameraView({
  camera,
  isMuted = true,
  fill = false,
}: LiveCameraViewProps) {
  const { api } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  // --- Connection State ---
  const [connectionState, setConnectionState] = useState("idle");
  const [isForceMuted, setIsForceMuted] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Zoom/Pan State ---
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Handle Unmute
  const handleUnmute = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent drag/click
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsForceMuted(false);
    }
  };

  // --- WebRTC Connection Logic ---
  useEffect(() => {
    if (!camera) {
      setConnectionState("idle");
      return;
    }

    // Reset Zoom on camera change
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsForceMuted(false);

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    const connect = async () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      setConnectionState("connecting");

      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        peerConnectionRef.current = pc;

        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          setConnectionState(state);
          if (["failed", "disconnected", "closed"].includes(state)) {
            if (!retryTimeoutRef.current) {
              retryTimeoutRef.current = setTimeout(() => {
                setRetryAttempt((prev) => prev + 1);
              }, 3000);
            }
          }
        };

        pc.addTransceiver("video", { direction: "recvonly" });

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams.length > 0) {
            const stream = event.streams[0];
            videoRef.current.srcObject = stream;

            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
              playPromise.catch((error) => {
                console.warn("Autoplay blocked:", error);
                if (!isMuted && videoRef.current) {
                  videoRef.current.muted = true;
                  setIsForceMuted(true);
                  videoRef.current
                    .play()
                    .catch((e) => console.error("Muted autoplay failed", e));
                }
              });
            }
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const credsResponse = await api("/api/webrtc-creds");
        if (!credsResponse || !credsResponse.ok) {
          throw new Error("Failed to fetch credentials");
        }
        const creds = await credsResponse.json();
        const credentials = btoa(`${creds.user}:${creds.pass}`);

        const whepEndpoint = `${MEDIAMTX_URL}/${camera.path}/whep`;

        const response = await fetch(whepEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/sdp",
            Authorization: `Basic ${credentials}`,
          },
          body: pc.localDescription?.sdp,
        });

        if (!response.ok) {
          throw new Error(`WHEP Error: ${response.status}`);
        }

        const answerSdp = await response.text();
        await pc.setRemoteDescription({
          type: "answer",
          sdp: answerSdp,
        });
      } catch (error) {
        console.error("WebRTC Error:", error);
        setConnectionState("failed");
      }
    };

    connect();

    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (peerConnectionRef.current) peerConnectionRef.current.close();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [camera, retryAttempt, api, isMuted]);

  // --- Zoom & Pan Handlers ---

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    // Prevent default page scroll if we are zoomed in
    if (scale > 1) {
      // e.preventDefault(); // Note: React synthetic events can't always prevent default passive listeners
    }

    const zoomIntensity = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(
      Math.max(1, scale + direction * zoomIntensity),
      5
    ); // Max 5x zoom

    setScale(newScale);

    // If we zoomed out to 1x, reset position
    if (newScale === 1) {
      setPosition({ x: 0, y: 0 });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      e.preventDefault();
      setIsDragging(true);
      setStartPan({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      e.preventDefault();
      const newX = e.clientX - startPan.x;
      const newY = e.clientY - startPan.y;
      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger grid click
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Determine cursor style
  let cursorStyle = "cursor-default";
  if (scale > 1) {
    cursorStyle = isDragging ? "cursor-grabbing" : "cursor-grab";
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-black rounded-lg shadow-lg group overflow-hidden ${cursorStyle}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted || isForceMuted}
        className={`w-full h-full pointer-events-none transition-transform duration-75 ease-linear ${
          fill || (isMuted && !isForceMuted) ? "object-cover" : "object-contain"
        }`}
        style={{
          transform: `scale(${scale}) translate(${position.x / scale}px, ${
            position.y / scale
          }px)`,
        }}
      />

      {/* Zoom Indicator (Only visible when zoomed) */}
      {scale > 1 && (
        <div className="absolute top-4 left-4 z-20 bg-black/60 text-white px-2 py-1 rounded text-xs font-mono pointer-events-none backdrop-blur-md">
          {scale.toFixed(1)}x
        </div>
      )}

      {/* Reset Zoom Button (Bottom Right, small) */}
      {scale > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDoubleClick(e);
          }}
          className="absolute bottom-14 right-4 z-30 p-2 bg-black/60 text-white rounded-full hover:bg-blue-600 transition-colors backdrop-blur-md"
          title="Reset Zoom"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      )}

      {/* Connection Status Overlay */}
      {connectionState !== "connected" && connectionState !== "new" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white z-10">
          {connectionState === "connecting" ? (
            <Loader className="w-8 h-8 animate-spin" />
          ) : (
            <>
              <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
              <p>Connection Failed</p>
            </>
          )}
        </div>
      )}

      {/* Unmute Overlay */}
      {isForceMuted && connectionState === "connected" && (
        <button
          onClick={handleUnmute}
          className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-black/60 text-white px-3 py-1.5 rounded-full hover:bg-blue-600 transition-colors backdrop-blur-sm cursor-pointer"
        >
          <VolumeX className="h-4 w-4" />
          <span className="text-xs font-medium">Tap to Unmute</span>
        </button>
      )}

      {/* Audio Icon */}
      {!isMuted && !isForceMuted && connectionState === "connected" && (
        <div className="absolute top-4 right-4 z-20 p-2 bg-black/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Volume2 className="h-4 w-4 text-white/80" />
        </div>
      )}
    </div>
  );
}
