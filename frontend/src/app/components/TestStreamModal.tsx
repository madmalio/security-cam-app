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
      setTestCamera({
        id: 9999,
        name: "Test Stream",
        path: testStreamPath,
        rtsp_url: "",
        display_order: 0,
        motion_type: "off",
        rtsp_substream_url: null,
        motion_roi: null,
        motion_sensitivity: 50,
        continuous_recording: false,
        ai_classes: "",
      });
    } else {
      setTestCamera(null);
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
          <div className="fixed inset-0 bg-black/80" />
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
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-zinc-900">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900 dark:text-white"
                  >
                    Connection Test
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-gray-500 dark:text-zinc-400">
                    Attempting to stream from the provided URL...
                  </p>

                  {/* --- FIX: Enforce height/aspect ratio wrapper --- */}
                  <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-inner border border-gray-200 dark:border-zinc-700">
                    {testCamera ? (
                      <LiveCameraView
                        camera={testCamera}
                        isMuted={false}
                        fill={true}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-500">
                        Loading stream configuration...
                      </div>
                    )}
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
