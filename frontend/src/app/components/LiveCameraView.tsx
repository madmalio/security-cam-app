"use client";

import React, { useState, useEffect, useRef } from "react";
import { Camera } from "@/app/types";
import { Loader, AlertTriangle, Video, Maximize } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";

const MEDIAMTX_URL =
  process.env.NEXT_PUBLIC_WHEP_URL || "http://localhost:8888";

interface LiveCameraViewProps {
  camera: Camera | null;
  isMuted?: boolean;
  fill?: boolean; // <-- Preserving the fill prop for black bars fix
}

export default function LiveCameraView({
  camera,
  isMuted = true,
  fill = false,
}: LiveCameraViewProps) {
  const { api } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [connectionState, setConnectionState] = useState("idle");

  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!camera) {
      setConnectionState("idle");
      return;
    }

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
            videoRef.current.srcObject = event.streams[0];
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // 1. Get credentials via API (No popup!)
        const credsResponse = await api("/api/webrtc-creds");
        if (!credsResponse || !credsResponse.ok) {
          throw new Error("Failed to fetch stream credentials");
        }
        const creds = await credsResponse.json();
        const credentials = btoa(`${creds.user}:${creds.pass}`);

        const whepEndpoint = `${MEDIAMTX_URL}/${camera.path}/whep`;

        // 2. Connect using WHEP (WebRTC)
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
        console.error("WebRTC Connection Error:", error);
        setConnectionState("failed");
      }
    };

    connect();

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [camera, retryAttempt, api]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (isFullscreen) {
      if (document.exitFullscreen) document.exitFullscreen();
    } else {
      if (containerRef.current.requestFullscreen)
        containerRef.current.requestFullscreen();
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black rounded-lg shadow-lg group"
    >
      <video
        ref={videoRef}
        autoPlay
        muted={isMuted}
        playsInline
        // --- THIS FIXES THE BLACK BARS ---
        className={`w-full h-full ${
          fill || isMuted ? "object-cover" : "object-contain"
        }`}
        // ---------------------------------
      />

      {connectionState !== "connected" && connectionState !== "new" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white">
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

      {connectionState === "connected" && !isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="absolute bottom-2 right-2 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
        >
          <Maximize className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
