"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { toast } from "sonner";
import { Loader } from "lucide-react";
import { format } from "date-fns";

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
  onSegmentClick?: (filename: string, offsetSeconds: number) => void; // <-- New Prop
}

// Helper to calculate position and width percentage
const getPositionAndWidth = (
  startStr: string,
  endStr: string | null,
  baseDateStr: string
) => {
  const startDate = new Date(startStr);
  const startOfDayMs = new Date(baseDateStr + "T00:00:00").getTime();
  const eventMs = startDate.getTime();

  const diffSeconds = (eventMs - startOfDayMs) / 1000;
  let startPercent = (diffSeconds / 86400) * 100;

  let widthPercent = 0.1;
  if (endStr) {
    const endDate = new Date(endStr);
    const durationSeconds = (endDate.getTime() - startDate.getTime()) / 1000;
    widthPercent = (durationSeconds / 86400) * 100;
  } else {
    widthPercent = 0.2;
  }

  return { start: startPercent, width: widthPercent };
};

export default function EventTimeline({
  date,
  cameraId,
  onEventClick,
  onSegmentClick,
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
    const fetchData = async () => {
      setIsLoading(true);
      const localStart = new Date(date + "T00:00:00");
      const localEnd = new Date(date + "T23:59:59.999");
      const params = new URLSearchParams();
      params.append("start_ts", localStart.toISOString());
      params.append("end_ts", localEnd.toISOString());

      if (cameraId) {
        params.append("camera_id", cameraId.toString());
      }

      try {
        const eventRes = await api(`/api/events/summary?${params.toString()}`);
        if (eventRes && eventRes.ok) {
          const data: EventSummary[] = await eventRes.json();
          setEvents(data);
        }

        if (cameraId) {
          const coverageRes = await api(
            `/api/cameras/${cameraId}/recordings/timeline?date_str=${date}`
          );
          if (coverageRes && coverageRes.ok) {
            const coverageData: RecordingSegment[] = await coverageRes.json();
            setContinuousSegments(coverageData);
          }
        } else {
          setContinuousSegments([]);
        }
      } catch (err: any) {
        console.error(err);
        toast.error("Failed to load timeline data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [api, date, cameraId]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (offsetX / rect.width) * 100));

    setHoverPercent(percent);

    // Calculate time string
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

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hoverPercent) return;

    // 1. Calculate clicked timestamp
    const secondsInDay = (hoverPercent / 100) * 86400;
    const clickedMs =
      new Date(date + "T00:00:00").getTime() + secondsInDay * 1000;
    const clickedDate = new Date(clickedMs);

    // 2. Find if we clicked an Event (Blue bar) - logic handled by button onClick
    // but we also want to handle "Empty" clicks on continuous segments

    if (!onSegmentClick) return;

    // 3. Check if we clicked a Continuous Segment
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
      <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
        Timeline for {format(displayDate, "MMMM d, yyyy")}
      </label>

      <div
        ref={containerRef}
        className="relative w-full h-16 rounded-lg bg-gray-100 border border-gray-200 dark:bg-zinc-900 dark:border-zinc-700 overflow-hidden cursor-crosshair select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-50 bg-white/50 dark:bg-black/50">
            <Loader className="h-4 w-4 animate-spin text-zinc-500" />
          </div>
        )}

        {/* LAYER 1: 24/7 Coverage (Gray Bars) */}
        {continuousSegments.map((seg, idx) => {
          const { start, width } = getPositionAndWidth(
            seg.start_time,
            seg.end_time,
            date
          );
          if (start < 0 || start > 100) return null;

          return (
            <div
              key={`cov-${idx}`}
              className="absolute h-full bg-gray-300 dark:bg-zinc-700"
              style={{ left: `${start}%`, width: `${width}%`, zIndex: 1 }}
            />
          );
        })}

        {/* LAYER 2: Motion Events (Blue Bars) */}
        {events.map((event) => {
          const { start, width } = getPositionAndWidth(
            event.start_time,
            event.end_time,
            date
          );
          if (start < 0 || start > 100) return null;

          return (
            <button
              key={event.id}
              className="absolute top-2 bottom-2 rounded-sm bg-blue-500 hover:bg-blue-400 z-10 shadow-sm transition-all"
              style={{
                left: `${start}%`,
                width: `${Math.max(width, 0.4)}%`,
              }}
              onClick={(e) => {
                e.stopPropagation(); // Prevent triggering timeline click
                onEventClick(event.id);
              }}
            />
          );
        })}

        {/* LAYER 3: Scrubber (Red Line) */}
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
