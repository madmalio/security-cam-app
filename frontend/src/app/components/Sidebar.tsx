"use client";

import React from "react";
import { Camera, User } from "@/app/types";
import { getInitials } from "@/app/lib/utils";
import {
  Video,
  LogOut,
  PlusCircle,
  Trash2,
  ChevronLeft,
  Menu,
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  cameras: Camera[];
  selectedCamera: Camera | null;
  viewMode: "single" | "grid";
  onCameraSelect: (camera: Camera) => void;
  onAddCameraClick: () => void;
  onDeleteCameraClick: (camera: Camera) => void;
  onLogout: () => void;
}

export default function Sidebar({
  isOpen,
  setIsOpen,
  cameras,
  selectedCamera,
  viewMode,
  onCameraSelect,
  onAddCameraClick,
  onDeleteCameraClick,
  onLogout,
}: SidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 z-10 flex h-full flex-col border-r border-gray-200 bg-white transition-all duration-300 dark:border-gray-700 dark:bg-gray-800 ${
        isOpen ? "w-64" : "w-20"
      }`}
    >
      <div
        className={`flex h-16 flex-shrink-0 items-center border-b border-gray-200 px-4 dark:border-gray-700 ${
          isOpen ? "justify-between" : "justify-center"
        }`}
      >
        {isOpen && (
          <div className="flex items-center">
            <Video className="h-8 w-8 text-blue-600 dark:text-blue-500" />
            <span className="ml-3 text-xl font-semibold text-gray-900 dark:text-white">
              CamView
            </span>
          </div>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="rounded-full p-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          title={isOpen ? "Collapse" : "Expand"}
        >
          {isOpen ? (
            <ChevronLeft className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        <span
          className={`px-3 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 ${
            isOpen ? "inline" : "hidden"
          }`}
        >
          Cameras
        </span>
        <ul className="mt-2 space-y-2">
          {cameras.map((cam) => (
            <li key={cam.id} className="group flex items-center">
              <button
                onClick={() => onCameraSelect(cam)}
                title={!isOpen ? cam.name : ""}
                className={`flex flex-1 items-center rounded-md px-3 py-2 text-left text-base font-medium ${
                  isOpen ? "" : "justify-center"
                } ${
                  selectedCamera?.id === cam.id && viewMode === "single"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-white"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {isOpen ? (
                  <Video className="h-6 w-6 flex-shrink-0" />
                ) : (
                  // --- THIS IS THE UPDATED LINE ---
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 text-sm font-medium text-white">
                    {getInitials(cam.name)}
                  </span>
                )}
                <span className={`ml-3 ${isOpen ? "inline" : "hidden"}`}>
                  {cam.name}
                </span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteCameraClick(cam);
                }}
                className={`ml-1 rounded-md p-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900 ${
                  isOpen ? "" : "hidden"
                }`}
                title={`Delete ${cam.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-shrink-0 p-4">
        <button
          onClick={onAddCameraClick}
          className={`group flex w-full items-center rounded-md bg-blue-600 px-3 py-2 text-base font-medium text-white hover:bg-blue-700 ${
            isOpen ? "" : "justify-center"
          }`}
          title={!isOpen ? "Add Camera" : ""}
        >
          <PlusCircle className="h-6 w-6 flex-shrink-0" />
          <span className={`ml-3 ${isOpen ? "inline" : "hidden"}`}>
            Add Camera
          </span>
        </button>
      </div>

      <div className="flex-shrink-0 border-t border-gray-200 p-4 dark:border-gray-700">
        <button
          onClick={onLogout}
          className={`group flex w-full items-center rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700 ${
            isOpen ? "" : "justify-center"
          }`}
          title={!isOpen ? "Logout" : ""}
        >
          <LogOut className="h-6 w-6 flex-shrink-0 text-gray-500 dark:text-gray-400" />
          <span className={`ml-3 ${isOpen ? "inline" : "hidden"}`}>Logout</span>
        </button>
      </div>
    </aside>
  );
}
