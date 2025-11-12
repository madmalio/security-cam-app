"use client";

import React, { useState, useEffect, useRef } from "react";
import { Camera } from "@/app/types";
import { Loader, AlertTriangle, Video } from "lucide-react";

// --- Constants ---
const MEDIAMTX_URL = "http://localhost:8888";

interface MosaicLiveViewProps {
  camera: Camera | null;
  isMuted?: boolean;
}

export default function MosaicLiveView({
  camera,
  isMuted = true,
}: MosaicLiveViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [connectionState, setConnectionState] = useState("idle");

  // --- 1. NEW: State to trigger a reconnect ---
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!camera) {
      setConnectionState("idle");
      return;
    }

    // Clear any pending retry timeouts
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
        const pc = new RTCPeerConnection();
        peerConnectionRef.current = pc;

        // --- 2. UPDATED: Add auto-reconnect logic ---
        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          setConnectionState(state);

          // If it fails or disconnects, schedule a retry
          if (
            state === "failed" ||
            state === "disconnected" ||
            state === "closed"
          ) {
            // Only retry if we're not already trying
            if (!retryTimeoutRef.current) {
              retryTimeoutRef.current = setTimeout(() => {
                setRetryAttempt((prev) => prev + 1); // Trigger the useEffect
              }, 3000); // Wait 3 seconds before retrying
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

        const whepEndpoint = `${MEDIAMTX_URL}/${camera.path}/whep`;
        const credentials = btoa("viewer:secret");

        const response = await fetch(whepEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/sdp",
            Authorization: `Basic ${credentials}`,
          },
          body: pc.localDescription?.sdp,
        });

        if (!response.ok) {
          throw new Error(
            `Failed to connect to WHEP: ${response.status} ${response.statusText}`
          );
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
      // Clear timeouts and close connections on unmount
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [camera, retryAttempt]); // <-- 3. Add retryAttempt to dependency array

  const ConnectionStatus = () => {
    let icon, text;
    switch (connectionState) {
      case "connecting":
      case "new":
        // No spinner, just a black box
        return null;

      case "connected":
        return null;

      case "failed":
      case "disconnected":
      case "closed":
        icon = <AlertTriangle className="h-12 w-12 text-red-400" />;
        text = "Connection Failed";
        break;

      default:
        icon = <Video className="h-12 w-12 text-gray-400" />;
        text = "Select a camera to view";
    }

    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/60">
        {icon}
        <p className="mt-2 text-lg font-medium text-white">{text}</p>
      </div>
    );
  };

  return (
    // This div fills its parent
    <div className="relative w-full h-full rounded-lg bg-black shadow-lg group">
      <video
        ref={videoRef}
        autoPlay
        muted={isMuted}
        playsInline
        className={`h-full w-full rounded-lg ${
          !isMuted ? "object-contain" : "object-cover"
        }`}
      />
      <ConnectionStatus />
    </div>
  );
}
