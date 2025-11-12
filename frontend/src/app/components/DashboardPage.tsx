"use client";

import React, { useState, useEffect, Fragment } from "react";
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
} from "lucide-react";
import { Menu as HeadlessMenu, Transition } from "@headlessui/react";
import { useSettings } from "@/app/contexts/SettingsContext"; // <-- 1. IMPORT

// ... (other imports)
import LiveCameraView from "./LiveCameraView";
import CameraGridView from "./CameraGridView";
import FocusView from "./FocusView";
import MosaicView from "./MosaicView";
import FullscreenGridView from "./FullscreenGridView";
import AddCameraModal from "./AddCameraModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import SettingsPage from "./SettingsPage";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface DashboardPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  onUserUpdate: (user: User) => void;
}

export default function DashboardPage({
  token,
  user,
  onLogout,
  onUserUpdate,
}: DashboardPageProps) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [cameraToDelete, setCameraToDelete] = useState<Camera | null>(null);
  const [currentView, setCurrentView] = useState<"dashboard" | "settings">(
    "dashboard"
  );

  // --- 2. USE SETTINGS ---
  const { defaultView, gridColumns } = useSettings();

  const [viewMode, setViewMode] = useState<"single" | "grid" | "focus">(
    defaultView
  );
  const [lastMultiView, setLastMultiView] = useState<"grid" | "focus">(
    defaultView
  );

  const [isMosaicFullscreen, setIsMosaicFullscreen] = useState(false);
  const [isGridFullscreen, setIsGridFullscreen] = useState(false);

  // --- 3. Sync state with context if it changes ---
  useEffect(() => {
    setViewMode(defaultView);
    setLastMultiView(defaultView);
  }, [defaultView]);

  // ... (other useEffects are unchanged) ...
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

  const fetchCameras = async () => {
    try {
      setError(null);
      const response = await fetch(`${API_URL}/api/cameras`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
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
  };

  useEffect(() => {
    if (currentView === "dashboard") {
      fetchCameras();
    }
  }, [token, currentView]);

  // ... (toggle fullscreen and handler functions are unchanged) ...
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
      const response = await fetch(
        `${API_URL}/api/cameras/${cameraToDelete.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
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

  const renderDashboardContent = () => {
    if (cameras.length === 0) {
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex aspect-video flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center text-gray-400 transition-all hover:border-blue-500 hover:text-blue-500 dark:border-gray-700"
          >
            <PlusCircle className="h-12 w-12" />
            <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Add Camera
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
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
        gridColumns={gridColumns} // <-- 4. PASS PROPS
      />
    );
  };

  return (
    <div className="flex h-screen w-full bg-gray-100 dark:bg-gray-900">
      <div className={`relative flex flex-1 flex-col overflow-hidden`}>
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8 dark:border-gray-700 dark:bg-gray-800">
          {/* ... (Header logic unchanged) ... */}
          <div className="flex items-center gap-4">
            <Video className="h-8 w-8 text-blue-600 dark:text-blue-500" />
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {currentView === "settings"
                ? "Settings"
                : viewMode === "single" && selectedCamera
                ? selectedCamera.name
                : "Dashboard"}
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
                      viewMode === "grid" ? "bg-gray-200 dark:bg-gray-700" : ""
                    } text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700`}
                    title="Grid View"
                  >
                    <Grid className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setViewMode("focus")}
                    className={`mr-2 rounded-full p-2 ${
                      viewMode === "focus" ? "bg-gray-200 dark:bg-gray-700" : ""
                    } text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700`}
                    title="Focus View"
                  >
                    <Layout className="h-5 w-5" />
                  </button>
                  <button
                    onClick={toggleMosaicFullscreen}
                    className="mr-2 rounded-full p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                    title="Fullscreen Mosaic View"
                  >
                    <Fullscreen className="h-5 w-5" />
                  </button>
                  <button
                    onClick={toggleGridFullscreen}
                    className="mr-4 rounded-full p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
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
                  className="mr-4 rounded-full p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  title={`Back to ${lastMultiView} View`}
                >
                  {lastMultiView === "grid" ? (
                    <Grid className="h-5 w-5" />
                  ) : (
                    <Layout className="h-5 w-5" />
                  )}
                </button>
              )}
            {currentView === "settings" && (
              <button
                onClick={() => setCurrentView("dashboard")}
                className="mr-4 flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                title="Back to Dashboard"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
            <UserIcon className="h-8 w-8 rounded-full bg-gray-200 p-1 text-gray-600 dark:bg-gray-700 dark:text-gray-300" />
            <HeadlessMenu as="div" className="relative ml-1">
              <HeadlessMenu.Button className="flex rounded-full p-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
                <ChevronDown className="h-5 w-5" />
              </HeadlessMenu.Button>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <HeadlessMenu.Items className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800 dark:ring-gray-700">
                  <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
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
                          active ? "bg-gray-100 dark:bg-gray-700" : ""
                        } mt-1 flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200`}
                      >
                        <PlusCircle className="mr-2 h-5 w-5" />
                        Add Camera
                      </button>
                    )}
                  </HeadlessMenu.Item>
                  <HeadlessMenu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => setCurrentView("settings")}
                        className={`${
                          active ? "bg-gray-100 dark:bg-gray-700" : ""
                        } flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200`}
                      >
                        <Settings className="mr-2 h-5 w-5" />
                        Settings
                      </button>
                    )}
                  </HeadlessMenu.Item>
                  <HeadlessMenu.Item>
                    {({ active }) => (
                      <button
                        onClick={onLogout}
                        className={`${
                          active ? "bg-gray-100 dark:bg-gray-700" : ""
                        } flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200`}
                      >
                        <LogOut className="mr-2 h-5 w-5" />
                        Logout
                      </button>
                    )}
                  </HeadlessMenu.Item>
                </HeadlessMenu.Items>
              </Transition>
            </HeadlessMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 h-full">
          {currentView === "dashboard" ? (
            renderDashboardContent()
          ) : (
            <SettingsPage
              token={token}
              user={user}
              onLogout={onLogout}
              onUserUpdate={onUserUpdate}
              cameras={cameras}
              onCamerasUpdate={fetchCameras}
            />
          )}
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
          gridColumns={gridColumns} // <-- 5. PASS PROPS
        />
      )}

      {isAddModalOpen && (
        <AddCameraModal
          token={token}
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
