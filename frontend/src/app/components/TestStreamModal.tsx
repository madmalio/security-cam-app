"use client";

import React, { Fragment, useState, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { X } from "lucide-react";
import LiveCameraView from "./LiveCameraView";
import { Camera } from "@/app/types";

interface TestStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  testStreamPath: string | null;
}

export default function TestStreamModal({
  isOpen,
  onClose,
  testStreamPath,
}: TestStreamModalProps) {
  const [testCamera, setTestCamera] = useState<Camera | null>(null);

  useEffect(() => {
    if (isOpen && testStreamPath) {
      // Create a temporary "Camera" object for the LiveCameraView component
      setTestCamera({
        id: 9999, // Fake ID
        name: "Test Stream",
        path: testStreamPath,
        rtsp_url: "", // Not needed by the player
        display_order: 0, // <-- THIS IS THE FIX
      });
    } else {
      setTestCamera(null); // Clear camera when modal closes
    }
  }, [isOpen, testStreamPath]);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-gray-800">
                <Dialog.Title
                  as="h3"
                  className="flex justify-between items-center text-lg font-medium leading-6 text-gray-900 dark:text-white"
                >
                  Testing Connection...
                  <button
                    onClick={onClose}
                    className="rounded-full p-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </Dialog.Title>
                <div className="mt-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    The video player below will attempt to connect to your
                    stream. If you see a "Connection Failed" error, please check
                    your RTSP URL and credentials.
                  </p>

                  {/* Render the player only when the camera object is set */}
                  {testCamera && (
                    <LiveCameraView camera={testCamera} isMuted={false} />
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
