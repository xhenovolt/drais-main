'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

export default function SplashScreen({ onFinished }: { onFinished: () => void }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 1800);
    const removeTimer = setTimeout(() => onFinished(), 2400);
    return () => {
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, [onFinished]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Logo (includes the DRAIS wordmark) with pulse animation */}
      <div className="animate-splash-logo mb-4">
        <Image
          src="/drais.png"
          alt="DRAIS"
          width={260}
          height={260}
          priority
          className="drop-shadow-xl"
        />
      </div>

      {/* Tagline */}
      <p className="text-slate-500 text-xs tracking-wider opacity-0 animate-splash-text-delay">
        School Operational Intelligence Infrastructure
      </p>

      {/* Loading dots (brand colours) */}
      <div className="mt-10 flex gap-1.5">
        <span className="w-2 h-2 rounded-full bg-[#0A2463]/70 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-[#16A394]/80 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-[#0A2463]/70 animate-bounce [animation-delay:300ms]" />
      </div>

      {/* Bottom branding — like WhatsApp's "from Meta" */}
      <div className="absolute bottom-10 flex flex-col items-center gap-1">
        <p className="text-slate-400 text-[10px] uppercase tracking-[0.2em]">
          from
        </p>
        <p className="text-[#0A2463] text-sm font-semibold tracking-wider">
          xhenvolt
        </p>
      </div>
    </div>
  );
}
