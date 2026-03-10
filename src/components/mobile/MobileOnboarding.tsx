"use client";
import React, { useState } from 'react';
import { Fingerprint, Users, BarChart3, Check, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface OnboardingSlide {
  icon: React.ElementType;
  title: string;
  description: string;
}

const slides: OnboardingSlide[] = [
  {
    icon: Fingerprint,
    title: 'Secure Attendance',
    description: 'Track student attendance with biometric fingerprint integration or manual entry.',
  },
  {
    icon: Users,
    title: 'Student Management',
    description: 'Manage student records, admissions, promotions, and academic history in one place.',
  },
  {
    icon: BarChart3,
    title: 'Reports & Analytics',
    description: 'Generate comprehensive reports for students, classes, exams, and attendance.',
  },
];

export default function MobileOnboarding({ onComplete }: { onComplete: () => void }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const router = useRouter();

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const slide = slides[currentSlide];
  const Icon = slide.icon;

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-indigo-600 to-blue-700 flex flex-col items-center justify-center px-6 py-10">
      {/* Skip button */}
      <button
        onClick={handleSkip}
        className="absolute top-6 right-6 text-white/80 hover:text-white text-sm font-medium"
      >
        Skip
      </button>

      {/* Icon */}
      <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-8">
        <Icon className="w-12 h-12 text-white" />
      </div>

      {/* Title */}
      <h2 className="text-3xl font-extrabold text-white text-center mb-4">{slide.title}</h2>

      {/* Description */}
      <p className="text-lg text-white/90 text-center max-w-md mb-12">{slide.description}</p>

      {/* Dots */}
      <div className="flex gap-2 mb-8">
        {slides.map((_, idx) => (
          <div
            key={idx}
            className={`w-2 h-2 rounded-full transition-colors ${
              idx === currentSlide ? 'bg-white' : 'bg-white/40'
            }`}
          />
        ))}
      </div>

      {/* Button */}
      <button
        onClick={handleNext}
        className="flex items-center gap-2 px-8 py-4 bg-white text-indigo-700 font-bold rounded-xl shadow-lg hover:bg-gray-50 transition-colors"
      >
        {currentSlide < slides.length - 1 ? (
          <>
            Next <ArrowRight className="w-5 h-5" />
          </>
        ) : (
          <>
            Get Started <Check className="w-5 h-5" />
          </>
        )}
      </button>
    </div>
  );
}
