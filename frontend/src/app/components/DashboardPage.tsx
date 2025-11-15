"use client";

import React, { useState, useEffect, Fragment, useCallback } from "react";
import { Camera, User } from "@/app/types";
import { toast } from "sonner";
import {
  Grid,
  Monitor,
  PlusCircle,
  User as UserIcon,
  Video,
  Layout,
  Fullscreen,
  AppWindow,
  LogOut,
  ChevronDown,
  Settings,
  ArrowLeft,
  Film,
} from "lucide-react";
import { Menu as HeadlessMenu, Transition } from "@headlessui/react";
import { useSettings } from "@/app/contexts/SettingsContext";
import { useAuth } from "@/app/contexts/AuthContext";

import LiveCameraView from "./LiveCameraView";
import CameraGridView from "./CameraGridView";
import FocusView from "./FocusView";
import MosaicView from "./MosaicView";
import FullscreenGridView from "./FullscreenGridView";
import AddCameraModal from "./AddCameraModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import SettingsPage from "./SettingsPage";
import EventsPage from "./EventsPage";

type CurrentView = "dashboard" | "settings" | "events";

const getInitialViewFromHash = (): CurrentView => {
  if (typeof window === "undefined") return "dashboard";
  const hash = window.location.hash; // e.g., "#events"
  if (hash === "#events") return "events";
  if (hash === "#settings") return "settings";
  return "dashboard"; // Default
};

export default function DashboardPage() {
  const { user, logout, api } = useAuth();
  if (!user) return null;

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [cameraToDelete, setCameraToDelete] = useState<Camera | null>(null);

  const [currentView, setCurrentView] = useState<CurrentView>(
    getInitialViewFromHash
  );

  const { defaultView, gridColumns } = useSettings();

  const [viewMode, setViewMode] = useState<"single" | "grid" | "focus">(
    defaultView
  );
  const [lastMultiView, setLastMultiView] = useState<"grid" | "focus">(
    defaultView
  );

  const [isMosaicFullscreen, setIsMosaicFullscreen] = useState(false);
  const [isGridFullscreen, setIsGridFullscreen] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentView(getInitialViewFromHash());
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    const newHash = currentView === "dashboard" ? "" : `#${currentView}`;
    if (newHash === "") {
      window.history.replaceState(null, "", " ");
    } else {
      window.history.replaceState(null, "", newHash);
    }
  }, [currentView]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsMosaicFullscreen(false);
        setIsGridFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const fetchCameras = useCallback(async () => {
    try {
      setError(null);
      const response = await api("/api/cameras");
      if (!response) return;

      if (!response.ok) {
        throw new Error("Failed to fetch cameras");
      }
      const data: Camera[] = await response.json();
      setCameras(data.sort((a, b) => a.display_order - b.display_order));
      if (data.length > 0 && !selectedCamera) {
        setSelectedCamera(data[0]);
      }
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    }
  }, [api, selectedCamera]);

  // --- THIS IS THE FIX ---
  useEffect(() => {
    // Fetch cameras if we are on the dashboard OR the settings page,
    // as both need the full camera list.
    if (currentView === "dashboard" || currentView === "settings") {
      fetchCameras();
    }
  }, [currentView, fetchCameras]);
  // --- END FIX ---

  const toggleMosaicFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsMosaicFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsMosaicFullscreen(false);
      }
    }
  };
  const toggleGridFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsGridFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsGridFullscreen(false);
      }
    }
  };
  const handleCameraAdded = (newCamera: Camera) => {
    setCameras((prevCameras) =>
      [...prevCameras, newCamera].sort(
        (a, b) => a.display_order - b.display_order
      )
    );
    toast.success(`"${newCamera.name}" was added successfully!`);
  };
  const handleSelectAndGoToSingle = (camera: Camera) => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    setSelectedCamera(camera);
    setViewMode("single");
  };
  const handleSelectForFocus = (camera: Camera) => {
    setSelectedCamera(camera);
  };

  const handleDeleteCamera = async (cameraToDelete: Camera) => {
    const originalCameras = [...cameras];
    const originalSelected = selectedCamera;

    const newCameras = cameras.filter((cam) => cam.id !== cameraToDelete.id);
    setCameras(newCameras);

    if (selectedCamera?.id === cameraToDelete.id) {
      if (newCameras.length > 0) {
        const newSelection =
          newCameras.find((c) => c.id !== cameraToDelete.id) || newCameras[0];
        setSelectedCamera(newSelection);
        setViewMode(viewMode === "single" ? lastMultiView : viewMode);
      } else {
        setSelectedCamera(null);
        setViewMode("grid");
      }
    }

    try {
      const response = await api(`/api/cameras/${cameraToDelete.id}`, {
        method: "DELETE",
      });
      if (!response) return;

      if (!response.ok) {
        setCameras(originalCameras);
        setSelectedCamera(originalSelected);
        toast.error(`Failed to delete ${cameraToDelete.name}`);
      } else {
        toast.success(`"${cameraToDelete.name}" was deleted.`);
      }
    } catch (err) {
      setCameras(originalCameras);
      setSelectedCamera(originalSelected);
      toast.error(`Failed to delete ${cameraToDelete.name}`);
    }
  };
  const openDeleteModal = (camera: Camera) => {
    setCameraToDelete(camera);
    setIsConfirmOpen(true);
  };

  const renderMainContent = () => {
    switch (currentView) {
      case "dashboard":
        return renderDashboardContent();
      case "settings":
        return (
          <SettingsPage cameras={cameras} onCamerasUpdate={fetchCameras} />
        );
      case "events":
        return <EventsPage />;
      default:
        return null;
    }
  };

  const renderDashboardContent = () => {
    if (cameras.length === 0) {
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex aspect-video flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center text-gray-400 transition-all hover:border-blue-500 hover:text-blue-500 dark:border-zinc-700 dark:hover:border-blue-500"
          >
            <PlusCircle className="h-12 w-12" />
            <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Add Camera
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
              Click to add your first camera
            </p>
          </button>
        </div>
      );
    }

    if (viewMode === "single") {
      return <LiveCameraView camera={selectedCamera} isMuted={false} />;
    }

    if (viewMode === "focus") {
      return (
        <FocusView
          cameras={cameras}
          selectedCamera={selectedCamera || cameras[0]}
          onSelectCamera={handleSelectForFocus}
          onFocusClick={handleSelectAndGoToSingle}
        />
      );
    }

    return (
      <CameraGridView
        cameras={cameras}
        onCameraSelect={handleSelectAndGoToSingle}
        onAddCameraClick={() => setIsAddModalOpen(true)}
        gridColumns={gridColumns}
      />
    );
  };

  const getHeaderText = () => {
    if (currentView === "settings") return "Settings";
    if (currentView === "events") return "Event Recordings";
    if (viewMode === "single" && selectedCamera) return selectedCamera.name;
    return "Dashboard";
  };

  return (
    <div className="flex h-screen w-full bg-gray-100 dark:bg-zinc-900">
      <div className={`relative flex flex-1 flex-col overflow-hidden`}>
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8 dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex items-center gap-4">
            <Video className="h-8 w-8 text-blue-600 dark:text-blue-500" />
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {getHeaderText()}
            </h1>
          </div>
          <div className="flex items-center">
            {currentView === "dashboard" &&
              viewMode !== "single" &&
              cameras.length > 0 && (
                <>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`mr-2 rounded-full p-2 ${
                      viewMode === "grid" ? "bg-gray-200 dark:bg-zinc-700" : ""
                    } text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700`}
                    title="Grid View"
                  >
                    <Grid className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setViewMode("focus")}
                    className={`mr-2 rounded-full p-2 ${
                      viewMode === "focus" ? "bg-gray-200 dark:bg-zinc-700" : ""
                    } text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700`}
                    title="Focus View"
                  >
                    <Layout className="h-5 w-5" />
                  </button>
                  <button
                    onClick={toggleMosaicFullscreen}
                    className="mr-2 rounded-full p-2 text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    title="Fullscreen Mosaic View"
                  >
                    <Fullscreen className="h-5 w-5" />
                  </button>
                  <button
                    onClick={toggleGridFullscreen}
                    className="mr-4 rounded-full p-2 text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    title="Fullscreen Grid View"
                  >
                    <AppWindow className="h-5 w-5" />
                  </button>
                </>
              )}
            {currentView === "dashboard" &&
              viewMode === "single" &&
              cameras.length > 0 && (
                <button
                  onClick={() => setViewMode(lastMultiView)}
                  className="mr-4 rounded-full p-2 text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  title={`Back to ${lastMultiView} View`}
                >
                  {lastMultiView === "grid" ? (
                    <Grid className="h-5 w-5" />
                  ) : (
                    <Layout className="h-5 w-5" />
                  )}
                </button>
              )}
            {currentView !== "dashboard" && (
              <button
                onClick={() => setCurrentView("dashboard")}
                className="mr-4 flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                title="Back to Dashboard"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}

            <UserIcon className="h-8 w-8 rounded-full bg-gray-200 p-1 text-gray-600 dark:bg-zinc-700 dark:text-zinc-300" />
            <HeadlessMenu as="div" className="relative ml-1">
              <HeadlessMenu.Button className="flex rounded-full p-1 text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700">
                <ChevronDown className="h-5 w-5" />
              </HeadlessMenu.Button>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-110"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <HeadlessMenu.Items className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-zinc-800 dark:ring-zinc-700">
                  <div className="border-b border-gray-200 px-4 py-2 dark:border-zinc-700">
                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                      Signed in as
                    </p>
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {user.email}
                    </p>
                  </div>
                  <HeadlessMenu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => setIsAddModalOpen(true)}
                        className={`${
                          active ? "bg-gray-100 dark:bg-zinc-700" : ""
                        } mt-1 flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-zinc-200`}
                      >
                        <PlusCircle className="mr-2 h-5 w-5" />
                        Add Camera
                      </button>
                    )}
                  </HeadlessMenu.Item>
                  <HeadlessMenu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => setCurrentView("events")}
                        className={`${
                          active ? "bg-gray-100 dark:bg-zinc-700" : ""
                        } flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-zinc-200`}
                      >
                        <Film className="mr-2 h-5 w-5" />
                        Events
                      </button>
                    )}
                  </HeadlessMenu.Item>
                  <HeadlessMenu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => setCurrentView("settings")}
                        className={`${
                          active ? "bg-gray-100 dark:bg-zinc-700" : ""
                        } flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-zinc-200`}
                      >
                        <Settings className="mr-2 h-5 w-5" />
                        Settings
                      </button>
                    )}
                  </HeadlessMenu.Item>
                  <div>
                    <HeadlessMenu.Item>
                      {({ active }) => (
                        <button
                          onClick={logout}
                          className={`${
                            active ? "bg-gray-100 dark:bg-zinc-700" : ""
                          } flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-zinc-200`}
                        >
                          <LogOut className="mr-2 h-5 w-5" />
                          Logout
                        </button>
                      )}
                    </HeadlessMenu.Item>
                  </div>
                </HeadlessMenu.Items>
              </Transition>
            </HeadlessMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 h-full">
          {renderMainContent()}
        </main>
      </div>

      {isMosaicFullscreen && cameras.length > 0 && (
        <MosaicView
          cameras={cameras}
          onExitFullscreen={toggleMosaicFullscreen}
        />
      )}

      {isGridFullscreen && cameras.length > 0 && (
        <FullscreenGridView
          cameras={cameras}
          onExitFullscreen={toggleGridFullscreen}
          gridColumns={gridColumns}
        />
      )}

      {isAddModalOpen && (
        <AddCameraModal
          onClose={() => setIsAddModalOpen(false)}
          onCameraAdded={handleCameraAdded}
        />
      )}
      <ConfirmDeleteModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        cameraName={cameraToDelete?.name || ""}
        onConfirm={() => {
          if (cameraToDelete) {
            handleDeleteCamera(cameraToDelete);
          }
          setIsConfirmOpen(false);
          setCameraToDelete(null);
        }}
      />
    </div>
  );
}
