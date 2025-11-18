"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { toast } from "sonner";
import { Loader } from "lucide-react";
import { format } from "date-fns";

// This is the new lightweight type for our summary
interface EventSummary {
  id: number;
  start_time: string;
  end_time: string | null;
  camera_id: number;
}

interface EventTimelineProps {
  date: string; // The selected date in "yyyy-MM-dd" format
  cameraId: number | null; // The selected camera ID or null for "All"
  onEventClick: (eventId: number) => void;
}

// Helper function to get the percentage of the day for a given time
const timeToPercentage = (time: string) => {
  const date = new Date(time);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return (totalSeconds / 86400) * 100; // 86400 seconds in a day
};

export default function EventTimeline({
  date,
  cameraId,
  onEventClick,
}: EventTimelineProps) {
  const { api } = useAuth();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEventSummary = async () => {
      setIsLoading(true);

      const params = new URLSearchParams();

      // --- THIS IS THE FIX ---
      // The backend endpoint is expecting 'date_str', not 'date'
      params.append("date_str", date);
      // --- END OF FIX ---

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
  }, [api, date, cameraId]); // Re-fetch when date or camera changes

  return (
    <div className="w-full space-y-2">
      <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
        Event Timeline for {format(new Date(date), "MMMM d, yyyy")}
      </label>
      <div className="relative w-full h-8 rounded-full bg-gray-200 dark:bg-zinc-700 overflow-hidden">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader className="h-4 w-4 animate-spin text-zinc-500" />
          </div>
        ) : (
          events.map((event) => {
            const start = timeToPercentage(event.start_time);
            // Use end time if it exists, otherwise default to 10 seconds
            const end = event.end_time
              ? timeToPercentage(event.end_time)
              : start + 0.1; // (10 / 86400 * 100) ~ 0.01%

            const width = Math.max(end - start, 0.2); // Ensure a minimum visible width

            return (
              <button
                key={event.id}
                className="absolute h-full bg-blue-500 hover:bg-blue-400 opacity-75 hover:opacity-100 transition-all"
                style={{
                  left: `${start}%`,
                  width: `${width}%`,
                }}
                title={`Event at ${format(
                  new Date(event.start_time),
                  "h:mm a"
                )}`}
                onClick={() => onEventClick(event.id)}
              />
            );
          })
        )}
      </div>
      {/* Hour labels */}
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
