"use client";

import React, { useState, useEffect, useMemo, Fragment } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { Event, Camera } from "@/app/types";
import { toast } from "sonner";
import { Loader, Video, Calendar, Tag, PlayCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import EventPlayerModal from "./EventPlayerModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { Tab } from "@headlessui/react"; // <-- 1. Import Tab component

// --- 2. Get API_URL to build thumbnail paths ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type GroupedEvents = {
  camera: Camera;
  events: Event[];
};

// --- 3. New Event Card component ---
const EventCard = ({
  event,
  onPlay,
  onDelete,
}: {
  event: Event;
  onPlay: (event: Event) => void;
  onDelete: (event: Event) => void;
}) => {
  const [thumbError, setThumbError] = useState(false);
  const thumbnailUrl =
    event.thumbnail_path && !thumbError
      ? `${API_URL}/${event.thumbnail_path}`
      : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      {/* Thumbnail */}
      <div className="relative aspect-video w-full bg-gray-100 dark:bg-zinc-700">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt="Event thumbnail"
            className="h-full w-full object-cover"
            onError={() => setThumbError(true)} // Fallback if image fails
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Video className="h-12 w-12 text-gray-400" />
          </div>
        )}
      </div>

      {/* Event Info */}
      <div className="flex-1 p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Motion Detected
        </h3>
        <div className="mt-2 flex flex-col gap-1 text-sm text-gray-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {format(new Date(event.start_time), "MMM d, 'at' h:mm a")}
          </span>
          <span className="flex items-center gap-1.5">
            <Tag className="h-4 w-4" />
            Reason: {event.reason}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex gap-2 p-4 border-t border-gray-100 dark:border-zinc-700">
        <button
          onClick={() => onPlay(event)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <PlayCircle className="h-5 w-5" />
          Play
        </button>
        <button
          onClick={() => onDelete(event)}
          className="flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-red-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-900/50 dark:hover:text-red-400"
          title="Delete Event"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

// --- 4. Main Page Component ---
export default function EventsPage() {
  const { api } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // --- 5. New logic for tabs ---
  const { cameras, eventsByCameraId } = useMemo(() => {
    const cameras = new Map<number, Camera>();
    const eventsByCameraId = new Map<number, Event[]>();

    for (const event of events) {
      if (!cameras.has(event.camera.id)) {
        cameras.set(event.camera.id, event.camera);
      }
      if (!eventsByCameraId.has(event.camera.id)) {
        eventsByCameraId.set(event.camera.id, []);
      }
      eventsByCameraId.get(event.camera.id)!.push(event);
    }

    // Sort cameras by name for the tab list
    const sortedCameras = Array.from(cameras.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return { cameras: sortedCameras, eventsByCameraId };
  }, [events]);

  // --- Handlers (unchanged) ---
  const handlePlayClick = (event: Event) => {
    setSelectedEvent(event);
    setIsPlayerOpen(true);
  };
  const handleClosePlayer = () => {
    setIsPlayerOpen(false);
    setSelectedEvent(null);
  };
  const openDeleteModal = (event: Event) => {
    setEventToDelete(event);
    setIsDeleteOpen(true);
  };
  const closeDeleteModal = () => {
    setIsDeleteOpen(false);
    setEventToDelete(null);
  };
  const handleDeleteEvent = async () => {
    if (!eventToDelete) return;
    setIsDeleting(true);
    try {
      const response = await api(`/api/events/${eventToDelete.id}`, {
        method: "DELETE",
      });
      if (!response) return;
      if (!response.ok) throw new Error("Failed to delete event");

      toast.success("Event deleted successfully");
      setEvents((prev) => prev.filter((e) => e.id !== eventToDelete.id));
      closeDeleteModal();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const renderEventGrid = (eventList: Event[]) => {
    if (eventList.length === 0) {
      return (
        <div className="flex w-full justify-center">
          <div className="mt-12 w-full max-w-2xl text-center rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 p-12">
            <Video className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              No events recorded
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
              This camera has not recorded any motion events.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {eventList.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onPlay={handlePlayClick}
            onDelete={openDeleteModal}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-8 max-w-6xl pb-16">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Event Recordings
          </h1>
          <p className="mt-1 text-gray-500 dark:text-zinc-400">
            Browse motion-detected recordings, grouped by camera.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader className="h-10 w-10 animate-spin text-zinc-500" />
          </div>
        ) : (
          // --- 6. New Tab Layout ---
          <Tab.Group>
            <Tab.List className="flex space-x-1 rounded-lg bg-gray-200 p-1 dark:bg-zinc-800">
              <Tab as={Fragment}>
                {({ selected }) => (
                  <button
                    className={`
                      w-full rounded-lg py-2.5 text-sm font-medium leading-5
                      ${
                        selected
                          ? "bg-white text-blue-700 shadow dark:bg-zinc-700 dark:text-white"
                          : "text-gray-600 hover:bg-white/50 dark:text-zinc-300 dark:hover:bg-zinc-700/50"
                      }
                      focus:outline-none focus:ring-2 ring-blue-500 ring-opacity-60
                    `}
                  >
                    All Events
                  </button>
                )}
              </Tab>
              {cameras.map((camera) => (
                <Tab as={Fragment} key={camera.id}>
                  {({ selected }) => (
                    <button
                      className={`
                        w-full rounded-lg py-2.5 text-sm font-medium leading-5
                        ${
                          selected
                            ? "bg-white text-blue-700 shadow dark:bg-zinc-700 dark:text-white"
                            : "text-gray-600 hover:bg-white/50 dark:text-zinc-300 dark:hover:bg-zinc-700/50"
                        }
                        focus:outline-none focus:ring-2 ring-blue-500 ring-opacity-60
                      `}
                    >
                      {camera.name}
                    </button>
                  )}
                </Tab>
              ))}
            </Tab.List>

            <Tab.Panels className="mt-6">
              {/* All Events Panel */}
              <Tab.Panel>{renderEventGrid(events)}</Tab.Panel>

              {/* Per-Camera Panels */}
              {cameras.map((camera) => (
                <Tab.Panel key={camera.id}>
                  {renderEventGrid(eventsByCameraId.get(camera.id) || [])}
                </Tab.Panel>
              ))}
            </Tab.Panels>
          </Tab.Group>
        )}
      </div>

      <EventPlayerModal
        isOpen={isPlayerOpen}
        onClose={handleClosePlayer}
        event={selectedEvent}
      />

      <ConfirmDeleteModal
        isOpen={isDeleteOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteEvent}
        cameraName="this event recording"
        isDeleting={isDeleting}
      />
    </>
  );
}
