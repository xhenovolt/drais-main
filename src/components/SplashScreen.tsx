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
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0A2463] transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Logo with pulse animation */}
      <div className="animate-splash-logo mb-6">
        <Image
          src="/drais.png"
          alt="DRAIS"
          width={180}
          height={135}
          priority
          className="drop-shadow-2xl"
        />
      </div>

      {/* App name */}
      <h1 className="text-white text-3xl font-bold tracking-widest mb-1 opacity-0 animate-splash-text">
        DRAIS
      </h1>

      {/* Tagline */}
      <p className="text-blue-200/70 text-xs tracking-wider opacity-0 animate-splash-text-delay">
        Digital Registry &amp; Academic Information System
      </p>

      {/* Loading dots */}
      <div className="mt-10 flex gap-1.5">
        <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce [animation-delay:300ms]" />
      </div>

      {/* Bottom branding — like WhatsApp's "from Meta" */}
      <div className="absolute bottom-10 flex flex-col items-center gap-1">
        <p className="text-blue-300/50 text-[10px] uppercase tracking-[0.2em]">
          from
        </p>
        <p className="text-white/80 text-sm font-semibold tracking-wider">
          xhenvolt
        </p>
      </div>
    </div>
  );
}
