"use client";

import React, { useState, useEffect, FormEvent, Fragment } from "react";
import { Camera } from "@/app/types";
import {
  Loader,
  X,
  Save,
  Trash2,
  AlertTriangle,
  HardDrive,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, Transition } from "@headlessui/react";
import { useAuth } from "@/app/contexts/AuthContext";
import ConfirmModal from "./ConfirmModal";
import TestStreamModal from "./TestStreamModal";

interface EditCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  camera: Camera | null;
  onCameraUpdated: () => void;
}

export default function EditCameraModal({
  isOpen,
  onClose,
  camera,
  onCameraUpdated,
}: EditCameraModalProps) {
  const { api } = useAuth();
  const [name, setName] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [substreamUrl, setSubstreamUrl] = useState("");
  const [continuousRecording, setContinuousRecording] = useState(false);
  const [aiClasses, setAiClasses] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [isConfirmWipeOpen, setIsConfirmWipeOpen] = useState(false);

  // Test Logic
  const [isTesting, setIsTesting] = useState(false);
  const [testStreamPath, setTestStreamPath] = useState<string | null>(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  useEffect(() => {
    if (camera && isOpen) {
      setName(camera.name);
      setRtspUrl(camera.rtsp_url);
      setSubstreamUrl(camera.rtsp_substream_url || "");
      setContinuousRecording(camera.continuous_recording);
      setAiClasses(camera.ai_classes || "");
    }
  }, [camera, isOpen]);

  const handleTest = async (urlToTest: string) => {
    if (!urlToTest) {
      toast.error("Please enter a URL to test");
      return;
    }
    setIsTesting(true);
    try {
      const response = await api("/api/cameras/test-connection", {
        method: "POST",
        body: JSON.stringify({ rtsp_url: urlToTest }),
      });
      if (!response || !response.ok) throw new Error("Test failed");

      const data = await response.json();
      setTestStreamPath(data.path);
      setIsTestModalOpen(true);
    } catch (err: any) {
      toast.error("Connection failed: Check URL");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!camera) return;

    setIsLoading(true);
    try {
      const response = await api(`/api/cameras/${camera.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          rtsp_url: rtspUrl,
          rtsp_substream_url: substreamUrl || null,
          continuous_recording: continuousRecording,
          ai_classes: aiClasses,
        }),
      });

      if (!response || !response.ok) throw new Error("Failed to update");

      toast.success("Camera updated successfully");
      onCameraUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWipeRecordings = async () => {
    if (!camera) return;
    setIsWiping(true);
    setIsConfirmWipeOpen(false);
    try {
      const response = await api(`/api/cameras/${camera.id}/recordings`, {
        method: "DELETE",
      });
      if (!response || !response.ok)
        throw new Error("Failed to wipe recordings");
      toast.success(`All recordings for ${camera.name} have been deleted.`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <>
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-medium text-gray-900 dark:text-white"
                    >
                      Edit Camera
                    </Dialog.Title>
                    <button
                      onClick={onClose}
                      className="rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-700"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                        Camera Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full rounded-md border border-gray-300 p-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                        Main RTSP URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={rtspUrl}
                          onChange={(e) => setRtspUrl(e.target.value)}
                          required
                          className="w-full rounded-md border border-gray-300 p-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleTest(rtspUrl)}
                          disabled={isTesting}
                          className="rounded-md bg-gray-100 p-2.5 text-gray-600 hover:bg-gray-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                          title="Test Main Stream"
                        >
                          {isTesting ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wifi className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                        Substream RTSP URL{" "}
                        <span className="text-xs text-gray-500">
                          (Optional)
                        </span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={substreamUrl}
                          onChange={(e) => setSubstreamUrl(e.target.value)}
                          placeholder="Low res for detection"
                          className="w-full rounded-md border border-gray-300 p-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleTest(substreamUrl)}
                          disabled={isTesting || !substreamUrl}
                          className="rounded-md bg-gray-100 p-2.5 text-gray-600 hover:bg-gray-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50"
                          title="Test Substream"
                        >
                          {isTesting ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wifi className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 24/7 Toggle */}
                    <div
                      className={`rounded-lg border p-4 transition-colors ${
                        continuousRecording
                          ? "border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10"
                          : "border-gray-200 dark:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          id="continuous"
                          type="checkbox"
                          checked={continuousRecording}
                          onChange={(e) =>
                            setContinuousRecording(e.target.checked)
                          }
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700"
                        />
                        <label
                          htmlFor="continuous"
                          className="text-sm font-medium text-gray-900 dark:text-white"
                        >
                          Enable 24/7 Recording
                        </label>
                      </div>
                      {continuousRecording && (
                        <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                          <HardDrive className="h-4 w-4 shrink-0 mt-0.5" />
                          <p>
                            <strong>Warning:</strong> Consumes significant
                            storage. Old footage will be deleted based on
                            Retention Policy.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Danger Zone */}
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-zinc-700">
                      <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-3">
                        Danger Zone
                      </h4>
                      <button
                        type="button"
                        onClick={() => setIsConfirmWipeOpen(true)}
                        disabled={isWiping}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        {isWiping ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}{" "}
                        Delete All Recordings
                      </button>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isLoading ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}{" "}
                        Save Changes
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <TestStreamModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        testStreamPath={testStreamPath}
      />

      <ConfirmModal
        isOpen={isConfirmWipeOpen}
        onClose={() => setIsConfirmWipeOpen(false)}
        onConfirm={handleWipeRecordings}
        title="Clear Camera History"
        confirmText="Delete All"
        message={
          <div className="space-y-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to delete <strong>all recordings</strong>{" "}
              for{" "}
              <span className="font-semibold text-gray-900 dark:text-white">
                {camera?.name}
              </span>
              ?
            </p>
            <p className="text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="inline h-4 w-4 mr-1 -mt-0.5" /> This
              will remove all 24/7 history and motion events. This cannot be
              undone.
            </p>
          </div>
        }
        isLoading={isWiping}
      />
    </>
  );
}
