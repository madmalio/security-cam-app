"use client";

import { PlusCircle } from "lucide-react";

interface AddCameraBoxProps {
  onClick: () => void;
}

export default function AddCameraBox({ onClick }: AddCameraBoxProps) {
  return (
    <button
      onClick={onClick}
      className="flex aspect-video flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center text-gray-400 transition-all hover:border-blue-500 hover:text-blue-500 dark:border-zinc-700 dark:hover:border-blue-500"
      title="Add a new camera"
    >
      <PlusCircle className="h-12 w-12" />
      <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
        Add Camera
      </h3>
    </button>
  );
}
