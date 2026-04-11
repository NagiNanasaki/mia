'use client';

import { USER_STAMPS } from '@/lib/stamps';

interface StampPickerProps {
  onSelect: (stampName: string) => void;
  onClose: () => void;
}

export default function StampPicker({ onSelect, onClose }: StampPickerProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30"
        onClick={onClose}
      />
      {/* Picker panel */}
      <div className="absolute bottom-full left-0 right-0 z-40 mb-2 mx-0 rounded-2xl border border-purple-200 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800">
        <div className="p-3">
          <div className="grid grid-cols-7 gap-1">
            {USER_STAMPS.map((stamp) => (
              <button
                key={stamp.name}
                onClick={() => {
                  onSelect(stamp.name);
                  onClose();
                }}
                className="flex flex-col items-center gap-0.5 rounded-xl p-1.5 transition-all hover:bg-purple-50 active:scale-90 dark:hover:bg-gray-700"
                title={stamp.label}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/stamps/${stamp.file}`}
                  alt={stamp.label}
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
