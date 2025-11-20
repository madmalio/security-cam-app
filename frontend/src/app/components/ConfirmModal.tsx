"use client";

import React, { Fragment, ReactNode } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Loader } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean; // Renamed from isDeleting to be more generic

  // Customization props
  title?: string;
  confirmText?: string;
  confirmColor?: "red" | "blue"; // Added color option
  message?: ReactNode;
  // Legacy support (optional, can be removed if you update all calls)
  cameraName?: string;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  title = "Confirm Action",
  confirmText = "Confirm",
  confirmColor = "red",
  cameraName,
  message,
}: ConfirmModalProps) {
  // Default content if no message is passed (Legacy behavior)
  const content = message ? (
    message
  ) : (
    <p className="text-sm text-gray-500 dark:text-gray-400">
      Are you sure you want to delete{" "}
      <strong className="text-red-600 dark:text-red-400">{cameraName}</strong>?
      This action cannot be undone.
    </p>
  );

  const buttonColorClass =
    confirmColor === "red"
      ? "bg-red-600 hover:bg-red-700"
      : "bg-blue-600 hover:bg-blue-700";

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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-gray-800">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 dark:text-white"
                >
                  {title}
                </Dialog.Title>
                <div className="mt-2">{content}</div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                    onClick={onClose}
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`flex w-24 items-center justify-center rounded-lg px-5 py-2.5 text-center text-sm font-medium text-white disabled:opacity-50 ${buttonColorClass}`}
                    onClick={onConfirm}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader className="h-5 w-5 animate-spin" />
                    ) : (
                      confirmText
                    )}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
