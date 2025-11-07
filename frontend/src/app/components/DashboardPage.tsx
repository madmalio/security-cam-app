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
} from "lucide-react";

import Sidebar from "./Sidebar";
import CameraView from "./CameraView";
import CameraGridView from "./CameraGridView";
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
  const [error, setError] = useState<string | null>(null); // For fetch errors
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [cameraToDelete, setCameraToDelete] = useState<Camera | null>(null);

  // --- 1. UPDATED: Read from localStorage on initial load ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    // This function runs only on the client, avoiding SSR issues
    if (typeof window !== "undefined") {
      const savedState = localStorage.getItem("sidebarOpen");
      // If a value is saved, parse it. Otherwise, default to true (open).
      return savedState !== null ? JSON.parse(savedState) : true;
    }
    // Default for server-side rendering
    return true;
  });

  const [viewMode, setViewMode] = useState<"single" | "grid">("grid");

  // --- 2. ADDED: Save state to localStorage on change ---
  useEffect(() => {
    localStorage.setItem("sidebarOpen", JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

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

  const handleCameraAdded = (newCamera: Camera) => {
    setCameras((prevCameras) => [...prevCameras, newCamera]);
    setSelectedCamera(newCamera); // Select the new camera
    setViewMode("single"); // Switch to single view to show it
    toast.success(`"${newCamera.name}" was added successfully!`);
  };

  const handleCameraSelect = (camera: Camera) => {
    setSelectedCamera(camera);
    setViewMode("single");
  };

  const handleDeleteCamera = async (cameraToDelete: Camera) => {
    const originalCameras = [...cameras];
    const originalSelected = selectedCamera;

    // Optimistically update UI
    const newCameras = cameras.filter((cam) => cam.id !== cameraToDelete.id);
    setCameras(newCameras);

    if (selectedCamera?.id === cameraToDelete.id) {
      if (newCameras.length > 0) {
        setSelectedCamera(newCameras[0]);
        setViewMode("single"); // Stay in single view, just change camera
      } else {
        setSelectedCamera(null); // No cameras left
        setViewMode("grid"); // Switch to grid view (which will be empty)
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
        // Revert on failure
        setCameras(originalCameras);
        setSelectedCamera(originalSelected);
        toast.error(`Failed to delete ${cameraToDelete.name}`);
      } else {
        toast.success(`"${cameraToDelete.name}" was deleted.`);
      }
    } catch (err) {
      // Revert on failure
      setCameras(originalCameras);
      setSelectedCamera(originalSelected);
      toast.error(`Failed to delete ${cameraToDelete.name}`);
    }
  };

  const openDeleteModal = (camera: Camera) => {
    setCameraToDelete(camera);
    setIsConfirmOpen(true);
  };

  return (
    <div className="flex h-screen w-full bg-gray-100 dark:bg-gray-900">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        cameras={cameras}
        selectedCamera={selectedCamera}
        viewMode={viewMode}
        onCameraSelect={handleCameraSelect}
        onAddCameraClick={() => setIsAddModalOpen(true)}
        onDeleteCameraClick={openDeleteModal}
        onLogout={onLogout}
      />

      {/* --- Main Content --- */}
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
            <button
              onClick={() =>
                setViewMode(viewMode === "single" ? "grid" : "single")
              }
              className="mr-4 rounded-full p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              title={
                viewMode === "single" ? "Show Grid View" : "Show Single View"
              }
            >
              {viewMode === "single" ? (
                <Grid className="h-5 w-5" />
              ) : (
                <Monitor className="h-5 w-5" />
              )}
            </button>
            <span className="mr-3 text-right text-sm font-medium text-gray-900 dark:text-white">
              {user.email}
            </span>
            <UserIcon className="h-8 w-8 rounded-full bg-gray-200 p-1 text-gray-600 dark:bg-gray-700 dark:text-gray-300" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {cameras.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
              <Video className="h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                No cameras found
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Get started by adding your first camera.
              </p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="group mt-6 flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-base font-medium text-white hover:bg-blue-700"
              >
                <PlusCircle className="mr-2 h-5 w-5" />
                Add Camera
              </button>
            </div>
          )}

          {viewMode === "single" && cameras.length > 0 && (
            <CameraView camera={selectedCamera} />
          )}

          {viewMode === "grid" && cameras.length > 0 && (
            <CameraGridView
              cameras={cameras}
              onCameraSelect={handleCameraSelect}
            />
          )}
        </main>
      </div>

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
