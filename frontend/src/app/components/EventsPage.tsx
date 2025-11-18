"use client";

import React, { useState, useEffect, useCallback, Fragment } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { Event, Camera } from "@/app/types";
import { toast } from "sonner";
import { Loader, Video, Calendar, Tag, PlayCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import EventPlayerModal from "./EventPlayerModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { Tab } from "@headlessui/react";
import EventTimeline from "./EventTimeline";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// --- Helper: Event Card (No Changes) ---
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
      <div className="relative aspect-video w-full bg-gray-100 dark:bg-zinc-700">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt="Event thumbnail"
            className="h-full w-full object-cover"
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Video className="h-12 w-12 text-gray-400" />
          </div>
        )}
      </div>
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

// Helper: Format date for <input type="date">
const getTodayString = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const adjustedToday = new Date(today.getTime() - offset * 60 * 1000);
  return adjustedToday.toISOString().split("T")[0];
};

interface EventsPageProps {
  cameras: Camera[];
}

export default function EventsPage({ cameras }: EventsPageProps) {
  const { api } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  // --- THIS IS THE FIX ---
  // Allow the state to be string OR null
  const [selectedDate, setSelectedDate] = useState<string | null>(
    getTodayString()
  );
  // --- END OF FIX ---

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedCameraId =
    selectedTabIndex === 0 ? null : cameras[selectedTabIndex - 1]?.id;

  useEffect(() => {
    // Don't fetch if no date is selected
    if (!selectedDate) {
      setEvents([]);
      setIsLoading(false);
      return;
    }

    const fetchEvents = async () => {
      setIsLoading(true);

      const params = new URLSearchParams();
      if (selectedCameraId) {
        params.append("camera_id", selectedCameraId.toString());
      }
      params.append("date", selectedDate);

      const query = params.toString();

      try {
        const response = await api(`/api/events?${query}`);
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
  }, [api, selectedCameraId, selectedDate, cameras]);

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

  const handleTimelineEventClick = (eventId: number) => {
    const eventToPlay = events.find((e) => e.id === eventId);
    if (eventToPlay) {
      handlePlayClick(eventToPlay);
    } else {
      toast.error("Could not find event. It may be on a different day.");
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
              No events found matching your selected filters.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="inline-grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            Browse motion-detected recordings.
          </p>
        </div>

        {/* --- Filter Controls --- */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-zinc-300">
              Filter by Camera
            </label>
            <Tab.Group
              selectedIndex={selectedTabIndex}
              onChange={setSelectedTabIndex}
            >
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
            </Tab.Group>
          </div>
          <div className="w-full md:w-48">
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-zinc-300">
              Filter by Date
            </label>
            <input
              type="date"
              value={selectedDate || ""}
              // The 'onChange' handler is now valid because the state is <string | null>
              onChange={(e) => setSelectedDate(e.target.value || null)}
              className="block w-full p-2.5 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
            />
            {selectedDate !== getTodayString() && (
              <button
                onClick={() => setSelectedDate(getTodayString())}
                className="w-full text-left text-sm text-blue-600 hover:underline dark:text-blue-400 mt-1"
              >
                Jump to Today
              </button>
            )}
          </div>
        </div>

        {/* --- ADD THE TIMELINE COMPONENT --- */}
        <div className="pt-4">
          {selectedDate && (
            <EventTimeline
              date={selectedDate}
              cameraId={selectedCameraId}
              onEventClick={handleTimelineEventClick}
            />
          )}
        </div>
        {/* --- END OF TIMELINE SECTION --- */}

        {/* --- Content Area (with centering fix) --- */}
        <div className="mt-6 flex justify-center">
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader className="h-10 w-10 animate-spin text-zinc-500" />
            </div>
          ) : (
            renderEventGrid(events)
          )}
        </div>
      </div>

      {/* Modals (unchanged) */}
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
