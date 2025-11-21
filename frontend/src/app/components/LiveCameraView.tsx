"use client";

import React, { useState, useEffect, useRef } from "react";
import { Camera } from "@/app/types";
import {
  Loader,
  AlertTriangle,
  VolumeX,
  Volume2,
  ZoomIn,
  RefreshCcw, // <-- New Icon
} from "lucide-react";
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

  // Refresh State
  const [refreshKey, setRefreshKey] = useState(0); // <-- Used to trigger re-connect
  const [retryAttempt, setRetryAttempt] = useState(0); // Auto-retry counter
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Zoom/Pan State ---
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const handleUnmute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsForceMuted(false);
    }
  };

  const handleManualRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshKey((prev) => prev + 1); // Triggers the useEffect
  };

  // --- WebRTC Connection Logic ---
  useEffect(() => {
    if (!camera) {
      setConnectionState("idle");
      return;
    }

    // Reset UI states on new connection
    if (refreshKey === 0) {
      // Only reset zoom on camera change, not manual refresh
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
    setIsForceMuted(false);

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    const connect = async () => {
      // Cleanup old connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
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
          // Only auto-retry if we haven't hit a manual refresh
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
                  videoRef.current.play().catch(console.error);
                }
              });
            }
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const credsResponse = await api("/api/webrtc-creds");
        if (!credsResponse || !credsResponse.ok) throw new Error("Auth failed");

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

        if (!response.ok) throw new Error(`WHEP ${response.status}`);

        const answerSdp = await response.text();
        await pc.setRemoteDescription({
          type: "answer",
          sdp: answerSdp,
        });
      } catch (error) {
        console.error("Connection Error:", error);
        setConnectionState("failed");
      }
    };

    connect();

    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [camera, retryAttempt, refreshKey, api, isMuted]); // Added refreshKey dependency

  // --- Zoom Handlers ---
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const zoomIntensity = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(
      Math.max(1, scale + direction * zoomIntensity),
      5
    );
    setScale(newScale);
    if (newScale === 1) setPosition({ x: 0, y: 0 });
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
      setPosition({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-black rounded-lg shadow-lg group overflow-hidden ${
        scale > 1
          ? isDragging
            ? "cursor-grabbing"
            : "cursor-grab"
          : "cursor-default"
      }`}
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

      {/* --- CONTROLS OVERLAY --- */}
      <div className="absolute top-2 right-2 z-30 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {/* 1. Refresh Button */}
        <button
          onClick={handleManualRefresh}
          className="p-2 bg-black/60 text-white rounded-full hover:bg-blue-600 transition-colors backdrop-blur-md"
          title="Refresh Stream"
        >
          <RefreshCcw
            className={`h-4 w-4 ${
              connectionState === "connecting" ? "animate-spin" : ""
            }`}
          />
        </button>

        {/* 2. Reset Zoom (Only if zoomed) */}
        {scale > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDoubleClick(e);
            }}
            className="p-2 bg-black/60 text-white rounded-full hover:bg-blue-600 transition-colors backdrop-blur-md"
            title="Reset Zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* --- STATUS OVERLAYS --- */}

      {connectionState !== "connected" && connectionState !== "new" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-20">
          {connectionState === "connecting" ? (
            <Loader className="w-8 h-8 animate-spin text-blue-500" />
          ) : (
            <>
              <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
              <p className="font-medium">Connection Lost</p>
              <button
                onClick={handleManualRefresh}
                className="mt-4 px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
              >
                <RefreshCcw className="h-4 w-4" /> Retry
              </button>
            </>
          )}
        </div>
      )}

      {/* Unmute Button */}
      {isForceMuted && connectionState === "connected" && (
        <button
          onClick={handleUnmute}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 bg-red-600/90 text-white px-3 py-1.5 rounded-full hover:bg-red-700 transition-colors shadow-lg animate-pulse"
        >
          <VolumeX className="h-4 w-4" />
          <span className="text-xs font-bold">Tap to Unmute</span>
        </button>
      )}

      {/* Audio Icon (Passive) */}
      {!isMuted && !isForceMuted && connectionState === "connected" && (
        <div className="absolute bottom-4 right-4 z-20 p-2 bg-black/40 rounded-full pointer-events-none">
          <Volume2 className="h-4 w-4 text-white/90" />
        </div>
      )}
    </div>
  );
}
