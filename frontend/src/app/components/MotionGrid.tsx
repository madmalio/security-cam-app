"use client";

import React, { useState, useEffect } from "react";

interface MotionGridProps {
  roi: string; // Comma-separated string, e.g., "0,1,2,10"
  onChange: (roi: string) => void;
  disabled: boolean;
}

const GRID_SIZE = 10; // 10x10 grid

export default function MotionGrid({
  roi,
  onChange,
  disabled,
}: MotionGridProps) {
  const [selectedCells, setSelectedCells] = useState(
    () => new Set(roi.split(",").filter(Boolean).map(Number))
  );

  useEffect(() => {
    const newRoiString = Array.from(selectedCells).join(",");
    onChange(newRoiString);
  }, [selectedCells, onChange]);

  useEffect(() => {
    setSelectedCells(new Set(roi.split(",").filter(Boolean).map(Number)));
  }, [roi]);

  const toggleCell = (index: number) => {
    if (disabled) return;

    setSelectedCells((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  return (
    <div
      className={`absolute inset-0 grid grid-cols-10 grid-rows-10 ${
        disabled ? "cursor-not-allowed bg-black/30" : "cursor-pointer"
      } 
      `} // <-- FIX: Removed backdrop-blur-sm
      title={
        disabled
          ? 'Enable "In-App" detection to edit this grid'
          : "Click to select motion zones"
      }
    >
      {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
        const isSelected = selectedCells.has(index);
        return (
          <div
            key={index}
            onClick={() => toggleCell(index)}
            className={`border-[0.5px] border-white/20 transition-colors ${
              isSelected
                ? "bg-blue-500/40" // <-- FIX: Changed from 70% to 40%
                : "bg-transparent hover:bg-white/20"
            }`}
          />
        );
      })}
    </div>
  );
}
