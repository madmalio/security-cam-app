"use client";

import React, { useState, useEffect, Fragment } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useSettings } from "@/app/contexts/SettingsContext";
import { Event, Camera } from "@/app/types";
import { toast } from "sonner";
import {
  Loader,
  Video,
  PlayCircle,
  Trash2,
  LayoutGrid,
  List,
  Camera as CameraIcon,
  CheckSquare,
  Square,
} from "lucide-react";
import { format, differenceInSeconds } from "date-fns";
import EventPlayerModal from "./EventPlayerModal";
import ConfirmModal from "./ConfirmModal";
import EventTimeline from "./EventTimeline";
import ContinuousPlaybackModal from "./ContinuousPlaybackModal";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const getDurationString = (start: string, end: string | null) => {
  if (!end) return "Live";
  const diff = differenceInSeconds(new Date(end), new Date(start));
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
};

interface EventItemProps {
  event: Event;
  onPlay: (event: Event) => void;
  onDelete: (event: Event) => void;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
}

const EventCard = ({
  event,
  onPlay,
  onDelete,
  isSelected,
  onToggleSelect,
}: EventItemProps) => {
  const [thumbError, setThumbError] = useState(false);
  const thumbnailUrl =
    event.thumbnail_path && !thumbError
      ? `${API_URL}/${event.thumbnail_path}`
      : null;
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-lg border shadow-sm transition-all hover:shadow-md dark:bg-zinc-800 ${
        isSelected
          ? "border-blue-500 ring-1 ring-blue-500"
          : "border-gray-200 dark:border-zinc-700"
      }`}
    >
      <div className="absolute top-2 left-2 z-20">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(event.id)}
          className="h-5 w-5 rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500 shadow-sm cursor-pointer"
        />
      </div>

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
        <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
          {getDurationString(event.start_time, event.end_time)}
        </div>
      </div>
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {format(new Date(event.start_time), "h:mm:ss a")}
            </h3>
            {/* FIX: Safe Access to Camera Name */}
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              {event.camera?.name || "Unknown Camera"}
            </p>
          </div>
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            {event.reason}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-zinc-700">
        <button
          onClick={() => onPlay(event)}
          className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <PlayCircle className="h-4 w-4" />
          Play
        </button>
        <button
          onClick={() => onDelete(event)}
          className="text-gray-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const EventListItem = ({
  event,
  onPlay,
  onDelete,
  isSelected,
  onToggleSelect,
}: EventItemProps) => {
  const [thumbError, setThumbError] = useState(false);
  const thumbnailUrl =
    event.thumbnail_path && !thumbError
      ? `${API_URL}/${event.thumbnail_path}`
      : null;
  return (
    <div
      className={`group flex items-center gap-4 rounded-lg border p-3 shadow-sm transition-all hover:bg-gray-50 dark:bg-zinc-800 dark:hover:bg-zinc-700/50 ${
        isSelected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10"
          : "border-gray-200 dark:border-zinc-700"
      }`}
    >
      <div className="flex items-center justify-center px-1">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(event.id)}
          className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
      </div>

      <div className="relative h-20 w-36 flex-shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-zinc-700">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt="Thumbnail"
            className="h-full w-full object-cover"
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Video className="h-8 w-8 text-gray-400" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        {/* FIX: Safe Access to Camera Name */}
        <h4 className="truncate text-base font-semibold text-gray-900 dark:text-white">
          {event.camera?.name || "Unknown Camera"}
        </h4>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-flex items-center rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
            {event.reason}
          </span>
          <span className="inline-flex items-center rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
            {getDurationString(event.start_time, event.end_time)}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {format(new Date(event.start_time), "h:mm a")}
        </span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => onPlay(event)}
            className="rounded p-1.5 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/30"
            title="Play"
          >
            <PlayCircle className="h-5 w-5" />
          </button>
          <button
            onClick={() => onDelete(event)}
            className="rounded p-1.5 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:text-zinc-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const getTodayString = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const adjustedToday = new Date(today.getTime() - offset * 60 * 1000);
  return adjustedToday.toISOString().split("T")[0];
};

interface EventsPageProps {
  cameras: Camera[];
  initialCameraId?: number | null;
}

export default function EventsPage({
  cameras,
  initialCameraId,
}: EventsPageProps) {
  const { api } = useAuth();
  const { eventsView, setEventsView } = useSettings();

  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(
    initialCameraId || null
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(
    getTodayString()
  );

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // Player & Playback State
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [tempPlaybackCam, setTempPlaybackCam] = useState<Camera | null>(null);

  // --- FIX: State for timeline click playback ---
  const [tempPlaybackFile, setTempPlaybackFile] = useState<string | null>(null);
  // --------------------------------------------

  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync initialCameraId prop to state if it changes
  useEffect(() => {
    if (initialCameraId) setSelectedCameraId(initialCameraId);
  }, [initialCameraId]);

  useEffect(() => {
    if (!selectedDate) {
      setEvents([]);
      setIsLoading(false);
      return;
    }
    setEvents([]);
    setSelectedIds(new Set());

    const fetchEvents = async () => {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (selectedCameraId) {
        params.append("camera_id", selectedCameraId.toString());
      }
      params.append("date_str", selectedDate);

      const localStart = new Date(selectedDate + "T00:00:00");
      const localEnd = new Date(selectedDate + "T23:59:59.999");
      params.append("start_ts", localStart.toISOString());
      params.append("end_ts", localEnd.toISOString());

      try {
        const response = await api(`/api/events?${params.toString()}`);
        if (!response) return;
        if (!response.ok) throw new Error("Failed to fetch events");
        const data: Event[] = await response.json();
        setEvents(data);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvents();
  }, [api, selectedCameraId, selectedDate]);

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === events.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(events.map((e) => e.id)));
    }
  };

  const handleBatchDelete = async () => {
    setIsBatchDeleting(true);
    try {
      const response = await api("/api/events/batch-delete", {
        method: "POST",
        body: JSON.stringify({ event_ids: Array.from(selectedIds) }),
      });

      if (!response || !response.ok) throw new Error("Batch delete failed");

      toast.success(`Deleted ${selectedIds.size} events.`);
      setEvents((prev) => prev.filter((e) => !selectedIds.has(e.id)));
      setSelectedIds(new Set());
      setIsBatchDeleteOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsBatchDeleting(false);
    }
  };

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

  // Clicking a BLUE event bar
  const handleTimelineEventClick = (eventId: number) => {
    const eventToPlay = events.find((e) => e.id === eventId);
    if (eventToPlay) handlePlayClick(eventToPlay);
    else toast.error("Could not find event.");
  };

  // Clicking a GRAY continuous bar
  const handleSegmentClick = (filename: string, offsetSeconds: number) => {
    if (!selectedCameraId) return;
    const cam = cameras.find((c) => c.id === selectedCameraId);
    if (cam) {
      setTempPlaybackFile(filename); // 1. Save filename
      setTempPlaybackCam(cam); // 2. Open modal
    }
  };

  const renderContent = () => {
    if (events.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-gray-100 p-4 dark:bg-zinc-800">
            <Video className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            No events found
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
            Try selecting a different camera or date.
          </p>
        </div>
      );
    }

    const ItemComponent = eventsView === "grid" ? EventCard : EventListItem;
    const containerClass =
      eventsView === "grid"
        ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        : "flex flex-col gap-2";

    return (
      <div className={containerClass}>
        {events.map((event) => (
          <ItemComponent
            key={event.id}
            event={event}
            onPlay={handlePlayClick}
            onDelete={openDeleteModal}
            isSelected={selectedIds.has(event.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col md:flex-row gap-6">
      {/* LEFT SIDEBAR */}
      <aside className="w-full md:w-64 flex-shrink-0 space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400">
            Cameras
          </h2>
          <div className="space-y-1">
            <button
              onClick={() => setSelectedCameraId(null)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                selectedCameraId === null
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              All Events
            </button>
            {cameras.map((camera) => (
              <button
                key={camera.id}
                onClick={() => setSelectedCameraId(camera.id)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  selectedCameraId === camera.id
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                <CameraIcon className="h-4 w-4" />
                {camera.name}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSelectAll}
              className="text-gray-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400"
              title="Select All"
            >
              {events.length > 0 && selectedIds.size === events.length ? (
                <CheckSquare className="h-6 w-6" />
              ) : (
                <Square className="h-6 w-6" />
              )}
            </button>

            {selectedIds.size > 0 ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={() => setIsBatchDeleteOpen(true)}
                  className="flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            ) : (
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selectedCameraId
                    ? cameras.find((c) => c.id === selectedCameraId)?.name ||
                      "Camera Events"
                    : "All Events"}
                </h1>
                <p className="text-sm text-gray-500 dark:text-zinc-400">
                  {format(new Date(selectedDate || ""), "MMMM d, yyyy")}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-zinc-700 dark:bg-zinc-900">
              <button
                onClick={() => setEventsView("grid")}
                className={`rounded p-1.5 transition-colors ${
                  eventsView === "grid"
                    ? "bg-white shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
                title="Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setEventsView("list")}
                className={`rounded p-1.5 transition-colors ${
                  eventsView === "list"
                    ? "bg-white shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
                title="List View"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <input
              type="date"
              value={selectedDate || ""}
              onChange={(e) => setSelectedDate(e.target.value || null)}
              className="rounded-md border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
            />
            {selectedDate !== getTodayString() && (
              <button
                onClick={() => setSelectedDate(getTodayString())}
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* Timeline - Only show if a specific camera is selected */}
        {selectedDate && selectedCameraId && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
            <EventTimeline
              date={selectedDate}
              cameraId={selectedCameraId}
              onEventClick={handleTimelineEventClick}
              onSegmentClick={handleSegmentClick} // Wired up!
            />
          </div>
        )}

        {/* Events Content */}
        <div>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader className="h-8 w-8 animate-spin text-zinc-500" />
            </div>
          ) : (
            renderContent()
          )}
        </div>
      </div>

      <EventPlayerModal
        isOpen={isPlayerOpen}
        onClose={handleClosePlayer}
        event={selectedEvent}
        onEventDeleted={(id) => {
          setEvents((prev) => prev.filter((e) => e.id !== id));
        }}
      />

      {/* --- FIX: Wired up Continuous Modal with props --- */}
      <ContinuousPlaybackModal
        isOpen={!!tempPlaybackCam}
        onClose={() => {
          setTempPlaybackCam(null);
          setTempPlaybackFile(null);
        }}
        camera={tempPlaybackCam}
        initialDate={selectedDate}
        initialFile={tempPlaybackFile}
      />

      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteEvent}
        title="Delete Event"
        confirmText="Delete"
        cameraName="this event recording"
        isLoading={isDeleting}
      />
      <ConfirmModal
        isOpen={isBatchDeleteOpen}
        onClose={() => setIsBatchDeleteOpen(false)}
        onConfirm={handleBatchDelete}
        title={`Delete ${selectedIds.size} Events?`}
        confirmText="Delete All"
        message={
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Are you sure you want to delete <strong>{selectedIds.size}</strong>{" "}
            events? This cannot be undone.
          </p>
        }
        isLoading={isBatchDeleting}
      />
    </div>
  );
}
