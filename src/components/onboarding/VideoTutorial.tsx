"use client";
/**
 * PHASE 25 — MICRO VIDEO TUTORIALS
 * Collapsible panel that embeds a short YouTube tutorial.
 * Shows at top of supported module pages.
 *
 * Usage:
 *   <VideoTutorial
 *     title="How Attendance Works"
 *     videoId="YOUR_YOUTUBE_ID"   // or leave null for placeholder
 *     description="Watch this 2-minute walkthrough before using the attendance module."
 *   />
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, ChevronDown, ChevronUp, Youtube } from 'lucide-react';

interface VideoTutorialProps {
  title: string;
  description?: string;
  videoId?: string | null;   // YouTube video ID — null shows placeholder
  defaultOpen?: boolean;
}

export default function VideoTutorial({
  title,
  description,
  videoId = null,
  defaultOpen = false,
}: VideoTutorialProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-6 rounded-2xl border border-blue-200 dark:border-blue-900 overflow-hidden bg-blue-50/50 dark:bg-blue-950/20">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
      >
        <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <Youtube className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
          {description && !open && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{description}</p>
          )}
        </div>
        <div className="text-gray-400 dark:text-gray-500">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Video panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
              {description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{description}</p>
              )}

              {videoId ? (
                /* Real YouTube embed */
                <div className="aspect-video rounded-xl overflow-hidden shadow-lg">
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
                    title={title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
              ) : (
                /* Placeholder until real video is added */
                <div className="aspect-video rounded-xl bg-gray-900 flex flex-col items-center justify-center gap-4 shadow-lg border border-gray-700">
                  <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                    <Play className="w-8 h-8 text-white ml-1" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-sm">{title}</p>
                    <p className="text-gray-400 text-xs mt-1">Tutorial video — coming soon</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
