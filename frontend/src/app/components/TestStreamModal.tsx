"use client";

import React, { Fragment, useState, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { X } from "lucide-react";
import LiveCameraView from "./LiveCameraView";
import { Camera } from "@/app/types";
// No useAuth needed here

interface TestStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  testStreamPath: string | null;
  // No token prop
}

export default function TestStreamModal({
  isOpen,
  onClose,
  testStreamPath,
}: TestStreamModalProps) {
  const [testCamera, setTestCamera] = useState<Camera | null>(null);
  // Removed testToken state

  useEffect(() => {
    // This effect now *only* sets up the temporary camera object
    if (isOpen && testStreamPath) {
      setTestCamera({
        id: 9999,
        name: "Test Stream",
        path: testStreamPath,
        rtsp_url: "",
        display_order: 0,
      });
    } else {
      setTestCamera(null);
    }
  }, [isOpen, testStreamPath]); // Removed api and testToken dependencies

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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-zinc-800">
                <Dialog.Title
                  as="h3"
                  className="flex justify-between items-center text-lg font-medium leading-6 text-gray-900 dark:text-white"
                >
                  Testing Connection...
                  <button
                    onClick={onClose}
                    className="rounded-full p-1 text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </Dialog.Title>
                <div className="mt-4">
                  <p className="text-sm text-gray-500 dark:text-zinc-400 mb-4">
                    The video player below will attempt to connect to your
                    stream. If you see a "Connection Failed" error, please check
                    your RTSP URL and credentials.
                  </p>

                  {/* Render only when camera is set. No token is needed. */}
                  {testCamera && (
                    <LiveCameraView
                      camera={testCamera}
                      isMuted={false}
                      // token={testToken} <-- FIX: REMOVED THIS LINE
                    />
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
