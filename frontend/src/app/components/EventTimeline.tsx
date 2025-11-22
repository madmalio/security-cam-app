"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { Loader } from "lucide-react";
import { format } from "date-fns";

// --- Types ---
interface EventSummary {
  id: number;
  start_time: string;
  end_time: string | null;
  camera_id: number;
}

interface RecordingSegment {
  start_time: string;
  end_time: string;
  filename: string;
}

interface EventTimelineProps {
  date: string;
  cameraId: number | null;
  onEventClick: (eventId: number) => void;
  // --- FIX: Re-added this missing prop ---
  onSegmentClick?: (filename: string, offsetSeconds: number) => void;
}

// --- Robust Math Helper ---
const getPositionAndWidth = (
  startStr: string,
  endStr: string | null,
  baseDateStr: string
) => {
  try {
    const baseTime = new Date(baseDateStr + "T00:00:00").getTime();
    const startTime = new Date(startStr).getTime();

    if (isNaN(baseTime) || isNaN(startTime)) return null;

    const startDiffSec = (startTime - baseTime) / 1000;
    const startPerc = (startDiffSec / 86400) * 100;

    let widthPerc = 0.2;
    if (endStr) {
      const endTime = new Date(endStr).getTime();
      if (!isNaN(endTime) && endTime > startTime) {
        const durationSec = (endTime - startTime) / 1000;
        widthPerc = (durationSec / 86400) * 100;
      }
    }

    if (startPerc > 100 || startPerc + widthPerc < 0) return null;

    return {
      left: `${Math.max(0, startPerc)}%`,
      width: `${Math.min(widthPerc, 100)}%`,
    };
  } catch (e) {
    return null;
  }
};

export default function EventTimeline({
  date,
  cameraId,
  onEventClick,
  onSegmentClick, // <-- FIX: Destructure this
}: EventTimelineProps) {
  const { api } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [continuousSegments, setContinuousSegments] = useState<
    RecordingSegment[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  // Scrubber State
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [hoverTimeStr, setHoverTimeStr] = useState<string | null>(null);

  const displayDate = new Date(date + "T00:00:00");

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const localStart = new Date(date + "T00:00:00").toISOString();
        const localEnd = new Date(date + "T23:59:59.999").toISOString();

        // 1. Fetch Motion Events
        const eventParams = new URLSearchParams({
          start_ts: localStart,
          end_ts: localEnd,
        });
        if (cameraId) eventParams.append("camera_id", cameraId.toString());

        const eventRes = await api(`/api/events/summary?${eventParams}`);
        if (isMounted && eventRes?.ok) {
          setEvents(await eventRes.json());
        }

        // 2. Fetch 24/7 Recordings
        if (cameraId) {
          const contRes = await api(
            `/api/cameras/${cameraId}/recordings/timeline?date_str=${date}`
          );
          if (isMounted && contRes?.ok) {
            const data = await contRes.json();
            if (Array.isArray(data)) {
              setContinuousSegments(data);
            } else {
              setContinuousSegments([]);
            }
          }
        } else {
          setContinuousSegments([]);
        }
      } catch (err) {
        console.error("Timeline error:", err);
        if (isMounted) {
          setEvents([]);
          setContinuousSegments([]);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [api, date, cameraId]);

  // --- Scrubber & Click Logic ---
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (offsetX / rect.width) * 100));

    setHoverPercent(percent);

    const secondsInDay = (percent / 100) * 86400;
    const totalMinutes = Math.floor(secondsInDay / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    setHoverTimeStr(`${displayHours}:${displayMinutes} ${ampm}`);
  };

  const handleMouseLeave = () => {
    setHoverPercent(null);
    setHoverTimeStr(null);
  };

  // --- FIX: Added Click Handler ---
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hoverPercent || !onSegmentClick) return;

    // 1. Calculate clicked timestamp
    const secondsInDay = (hoverPercent / 100) * 86400;
    const clickedMs =
      new Date(date + "T00:00:00").getTime() + secondsInDay * 1000;

    // 2. Check if we clicked a Continuous Segment
    const segment = continuousSegments.find((seg) => {
      const start = new Date(seg.start_time).getTime();
      const end = new Date(seg.end_time).getTime();
      return clickedMs >= start && clickedMs <= end;
    });

    if (segment) {
      const start = new Date(segment.start_time).getTime();
      const offsetSeconds = (clickedMs - start) / 1000;
      onSegmentClick(segment.filename, offsetSeconds);
    }
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
          Timeline for {format(displayDate, "MMMM d, yyyy")}
        </label>
      </div>

      <div
        ref={containerRef}
        className="relative w-full h-12 rounded-lg bg-gray-100 border border-gray-200 dark:bg-zinc-900 dark:border-zinc-700 overflow-hidden cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick} // <-- Wired up!
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-50 bg-white/50 dark:bg-black/50">
            <Loader className="h-4 w-4 animate-spin text-zinc-500" />
          </div>
        )}

        {/* LAYER 1: 24/7 Coverage (Gray Bars) */}
        {continuousSegments.map((seg, idx) => {
          const style = getPositionAndWidth(seg.start_time, seg.end_time, date);
          if (!style) return null;

          return (
            <div
              key={`cov-${idx}`}
              className="absolute h-full bg-zinc-300 dark:bg-zinc-700 opacity-50"
              style={{ ...style, zIndex: 1 }}
              title={`Recorded: ${format(new Date(seg.start_time), "h:mm a")}`}
            />
          );
        })}

        {/* LAYER 2: Motion Events (Blue Bars) */}
        {events.map((event) => {
          const style = getPositionAndWidth(
            event.start_time,
            event.end_time,
            date
          );
          if (!style) return null;

          return (
            <button
              key={event.id}
              className="absolute h-full bg-blue-500 hover:bg-blue-400 opacity-75 hover:opacity-100 transition-all z-10"
              style={{
                ...style,
                minWidth: "4px",
              }}
              title={`Event at ${format(new Date(event.start_time), "h:mm a")}`}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick(event.id);
              }}
            />
          );
        })}

        {/* LAYER 3: Scrubber Line */}
        {hoverPercent !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none"
            style={{ left: `${hoverPercent}%` }}
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
              {hoverTimeStr}
            </div>
          </div>
        )}
      </div>

      {/* Time Markers */}
      <div className="hidden md:flex w-full justify-between text-xs text-gray-500 dark:text-zinc-400">
        <span>12 AM</span>
        <span>3 AM</span>
        <span>6 AM</span>
        <span>9 AM</span>
        <span>12 PM</span>
        <span>3 PM</span>
        <span>6 PM</span>
        <span>9 PM</span>
        <span className="text-right">12 AM</span>
      </div>
    </div>
  );
}
