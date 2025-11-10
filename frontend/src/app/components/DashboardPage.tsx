"use client";

import React, { useState, useEffect } from "react";
import { Camera, User } from "@/app/types";
import { toast } from "sonner";
import {
  Grid,
  Monitor,
  PlusCircle,
  User as UserIcon,
  Video,
  Fullscreen,
} from "lucide-react";

import Sidebar from "./Sidebar";
import LiveCameraView from "./LiveCameraView";
import CameraGridView from "./CameraGridView";
// FocusView is no longer used
import MosaicView from "./MosaicView";
import AddCameraModal from "./AddCameraModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

// --- Constants ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface DashboardPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export default function DashboardPage({
  token,
  user,
  onLogout,
}: DashboardPageProps) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [cameraToDelete, setCameraToDelete] = useState<Camera | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const savedState = localStorage.getItem("sidebarOpen");
      return savedState !== null ? JSON.parse(savedState) : true;
    }
    return true;
  });

  const [viewMode, setViewMode] = useState<"single" | "grid">("grid");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebarOpen", JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Fetch cameras on mount
  useEffect(() => {
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
        setCameras(data);
        if (data.length > 0) {
          setSelectedCamera(data[0]);
        }
      } catch (err: any) {
        setError(err.message);
        toast.error(err.message);
      }
    };

    fetchCameras();
  }, [token]);

  const toggleBrowserFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const handleCameraAdded = (newCamera: Camera) => {
    setCameras((prevCameras) => [...prevCameras, newCamera]);
    setSelectedCamera(newCamera);
    setViewMode("single");
    toast.success(`"${newCamera.name}" was added successfully!`);
  };

  const handleSelectAndGoToSingle = (camera: Camera) => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    setSelectedCamera(camera);
    setViewMode("single");
  };

  const handleDeleteCamera = async (cameraToDelete: Camera) => {
    // ... (logic unchanged) ...
    const originalCameras = [...cameras];
    const originalSelected = selectedCamera;

    const newCameras = cameras.filter((cam) => cam.id !== cameraToDelete.id);
    setCameras(newCameras);

    if (selectedCamera?.id === cameraToDelete.id) {
      if (newCameras.length > 0) {
        setSelectedCamera(newCameras[0]);
        setViewMode("grid");
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

  const renderMainContent = () => {
    // Show skeleton box if no cameras
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

    // Show single view
    if (viewMode === "single") {
      return <LiveCameraView camera={selectedCamera} isMuted={false} />;
    }

    // Show grid view (default)
    return (
      <CameraGridView
        cameras={cameras}
        onCameraSelect={handleSelectAndGoToSingle}
      />
    );
  };

  return (
    <div className="flex h-screen w-full bg-gray-100 dark:bg-gray-900">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        cameras={cameras}
        selectedCamera={selectedCamera}
        viewMode={viewMode}
        onCameraSelect={handleSelectAndGoToSingle}
        onAddCameraClick={() => setIsAddModalOpen(true)}
        onDeleteCameraClick={openDeleteModal}
        onLogout={onLogout}
      />

      <div
        className={`relative flex flex-1 flex-col overflow-hidden transition-all duration-300 ${
          isSidebarOpen ? "ml-64" : "ml-20"
        }`}
      >
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8 dark:border-gray-700 dark:bg-gray-800">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {viewMode === "single" && selectedCamera
              ? selectedCamera.name
              : "All Cameras"}
          </h1>
          <div className="flex items-center">
            {viewMode === "grid" && cameras.length > 0 && (
              <button
                onClick={toggleBrowserFullscreen}
                className="mr-4 rounded-full p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                title="Fullscreen Mosaic View"
              >
                <Fullscreen className="h-5 w-5" />
              </button>
            )}

            {/* "Back" button when in single view */}
            {viewMode === "single" && cameras.length > 0 && (
              <button
                onClick={() => setViewMode("grid")} // Always go back to grid
                className="mr-4 rounded-full p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                title={"Show Grid View"}
              >
                <Grid className="h-5 w-5" />
              </button>
            )}

            <span className="mr-3 text-right text-sm font-medium text-gray-900 dark:text-white">
              {user.email}
            </span>
            <UserIcon className="h-8 w-8 rounded-full bg-gray-200 p-1 text-gray-600 dark:bg-gray-700 dark:text-gray-300" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {renderMainContent()}
        </main>
      </div>

      {/* --- RENDER FULLSCREEN MOSAIC --- */}
      {isFullscreen && cameras.length > 0 && (
        <MosaicView
          cameras={cameras}
          onExitFullscreen={toggleBrowserFullscreen}
          // The onCameraSelect prop is now GONE
        />
      )}

      {/* --- Modals --- */}
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
