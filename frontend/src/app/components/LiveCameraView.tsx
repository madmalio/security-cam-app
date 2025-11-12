"use client";

import React, { useState, useEffect, useRef } from "react";
import { Camera } from "@/app/types";
import { Loader, AlertTriangle, Video, Maximize, Minimize } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext"; // <-- 1. IMPORT

const MEDIAMTX_URL =
  process.env.NEXT_PUBLIC_WHEP_URL || "http://localhost:8888";

interface LiveCameraViewProps {
  camera: Camera | null;
  isMuted?: boolean;
  // 2. No more token prop
}

export default function LiveCameraView({
  camera,
  isMuted = true,
}: LiveCameraViewProps) {
  const { api } = useAuth(); // <-- 3. Get api hook
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
        const pc = new RTCPeerConnection();
        peerConnectionRef.current = pc;

        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          setConnectionState(state);

          if (
            state === "failed" ||
            state === "disconnected" ||
            state === "closed"
          ) {
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

        // 4. Fetch credentials securely using 'api' hook
        const credsResponse = await api("/api/webrtc-creds");
        if (!credsResponse) return; // Logout already handled

        if (!credsResponse.ok) {
          throw new Error("Failed to fetch stream credentials");
        }
        const creds = await credsResponse.json();
        const credentials = btoa(`${creds.user}:${creds.pass}`);

        const whepEndpoint = `${MEDIAMTX_URL}/${camera.path}/whep`;

        const response = await fetch(whepEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/sdp",
            Authorization: `Basic ${credentials}`, // 5. Now uses secure creds
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
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [camera, retryAttempt, api]); // 6. Add 'api' to dependency array

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (isFullscreen) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    } else {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    }
  };

  const ConnectionStatus = () => {
    let icon, text;
    switch (connectionState) {
      case "connecting":
      case "new":
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
    <div
      ref={containerRef}
      className="relative aspect-video w-full rounded-lg bg-black shadow-lg group"
    >
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

      {connectionState === "connected" && !isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="absolute bottom-2 right-2 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
          title="Enter Fullscreen"
        >
          <Maximize className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
