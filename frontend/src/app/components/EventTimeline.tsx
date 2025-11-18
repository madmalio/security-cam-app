"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { toast } from "sonner";
import { Loader } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns"; // Ensure startOfDay/endOfDay are imported

interface EventSummary {
  id: number;
  start_time: string;
  end_time: string | null;
  camera_id: number;
}

interface EventTimelineProps {
  date: string;
  cameraId: number | null;
  onEventClick: (eventId: number) => void;
}

const timeToPercentage = (time: string) => {
  const date = new Date(time);
  const hours = date.getUTCHours(); // Backend returns UTC
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return (totalSeconds / 86400) * 100;
};

export default function EventTimeline({
  date,
  cameraId,
  onEventClick,
}: EventTimelineProps) {
  const { api } = useAuth();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Parse the YYYY-MM-DD string as local time
  const displayDate = new Date(date + "T00:00:00");

  useEffect(() => {
    const fetchEventSummary = async () => {
      setIsLoading(true);

      // --- FIX: Calculate UTC range for the *Local* day ---
      const localStart = new Date(date + "T00:00:00");
      const localEnd = new Date(date + "T23:59:59.999");

      const params = new URLSearchParams();
      params.append("start_ts", localStart.toISOString());
      params.append("end_ts", localEnd.toISOString());
      // --- END FIX ---

      if (cameraId) {
        params.append("camera_id", cameraId.toString());
      }

      try {
        const response = await api(`/api/events/summary?${params.toString()}`);
        if (!response) return;
        if (!response.ok) {
          throw new Error("Failed to fetch event summary");
        }
        const data: EventSummary[] = await response.json();
        setEvents(data);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEventSummary();
  }, [api, date, cameraId]);

  return (
    <div className="w-full space-y-2">
      <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
        Event Timeline for {format(displayDate, "MMMM d, yyyy")}
      </label>
      <div className="relative w-full h-8 rounded-full bg-gray-200 dark:bg-zinc-700 overflow-hidden">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader className="h-4 w-4 animate-spin text-zinc-500" />
          </div>
        ) : (
          events.map((event) => {
            // We must adjust the UTC time to Local time percentage for display
            const eventDate = new Date(event.start_time);

            // Calculate seconds from start of *local* day
            const startOfDayMs = new Date(date + "T00:00:00").getTime();
            const eventMs = eventDate.getTime();
            const diffSeconds = (eventMs - startOfDayMs) / 1000;

            const start = (diffSeconds / 86400) * 100;
            const end = event.end_time
              ? start +
                ((new Date(event.end_time).getTime() - eventMs) /
                  1000 /
                  86400) *
                  100
              : start + 0.1;

            const width = Math.max(end - start, 0.2);

            if (start < 0 || start > 100) return null; // Skip if out of bounds (timezone edge case)

            return (
              <button
                key={event.id}
                className="absolute h-full bg-blue-500 hover:bg-blue-400 opacity-75 hover:opacity-100 transition-all"
                style={{
                  left: `${start}%`,
                  width: `${width}%`,
                }}
                title={`Event at ${format(eventDate, "h:mm a")}`}
                onClick={() => onEventClick(event.id)}
              />
            );
          })
        )}
      </div>
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
