"use client";

import React, { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { X } from "lucide-react";
import EventPlayer from "./EventPlayer";
import { Event } from "@/app/types";
import { format } from "date-fns";

interface EventPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event | null;
}

export default function EventPlayerModal({
  isOpen,
  onClose,
  event,
}: EventPlayerModalProps) {
  if (!event) return null;

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
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-zinc-800">
                <Dialog.Title
                  as="h3"
                  className="flex justify-between items-center text-lg font-medium leading-6 text-gray-900 dark:text-white"
                >
                  Event: {event.camera.name}
                  <button
                    onClick={onClose}
                    className="rounded-full p-1 text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </Dialog.Title>
                <div className="mt-2">
                  <p className="text-sm text-gray-500 dark:text-zinc-400">
                    Recorded on:{" "}
                    {format(
                      new Date(event.start_time),
                      "MMMM d, yyyy 'at' h:mm:ss a"
                    )}
                  </p>
                </div>
                <div className="mt-4">
                  <EventPlayer videoSrc={event.video_path} />
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
