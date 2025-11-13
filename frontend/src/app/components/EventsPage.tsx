"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { Event } from "@/app/types";
import { toast } from "sonner";
import { Loader, Video, Calendar, Tag, PlayCircle } from "lucide-react"; // Import PlayCircle
import { format } from "date-fns";
import EventPlayerModal from "./EventPlayerModal"; // <-- 1. IMPORT MODAL

export default function EventsPage() {
  const { api } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- 2. State for the modal ---
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchEvents = async () => {
      setIsLoading(true);
      try {
        const response = await api("/api/events");
        if (!response) return;

        if (!response.ok) {
          throw new Error("Failed to fetch events");
        }
        const data: Event[] = await response.json();
        setEvents(data);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvents();
  }, [api]);

  // --- 3. Handlers to open/close modal ---
  const handlePlayClick = (event: Event) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedEvent(null);
  };

  return (
    <>
      <div className="space-y-8 max-w-6xl pb-16">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Event Recordings
          </h1>
          <p className="mt-1 text-gray-500 dark:text-zinc-400">
            Browse motion-detected recordings from your cameras.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader className="h-10 w-10 animate-spin text-zinc-500" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 p-12">
            <Video className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              No events recorded
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
              Once your cameras detect motion, recordings will appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Motion Detected on {event.camera.name}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(event.start_time), "MMM d, yyyy")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Tag className="h-4 w-4" />
                      Reason: {event.reason}
                    </span>
                  </div>
                </div>
                {/* --- 4. Wire up the button --- */}
                <button
                  onClick={() => handlePlayClick(event)}
                  className="flex-shrink-0 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <PlayCircle className="h-5 w-5" />
                  Play Recording
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- 5. Add the modal to the page --- */}
      <EventPlayerModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        event={selectedEvent}
      />
    </>
  );
}
