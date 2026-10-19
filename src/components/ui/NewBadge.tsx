"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

interface NewBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'gradient' | 'solid' | 'outline';
  animated?: boolean;
  showIcon?: boolean;
  className?: string;
}

const NewBadge: React.FC<NewBadgeProps> = ({
  size = 'sm',
  variant = 'gradient',
  animated = true,
  showIcon = false,
  className = ''
}) => {
  const { t } = useI18n();
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base'
  };

  const variantClasses = {
    gradient: 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg',
    solid: 'bg-emerald-500 text-white',
    outline: 'border border-emerald-500 text-emerald-600 bg-emerald-50'
  };

  const BadgeContent = () => (
    <span className={`
      inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide
      ${sizeClasses[size]} ${variantClasses[variant]} ${className}
    `}>
      {showIcon && <Sparkles className="w-3 h-3" />}
      {t('staffPages.overview.newBadge', 'NEW')}
    </span>
  );

  if (!animated) {
    return <BadgeContent />;
  }

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ 
        scale: 1, 
        opacity: 1,
      }}
      transition={{ 
        type: "spring", 
        stiffness: 500, 
        damping: 20,
        delay: 0.1
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        animate={variant === 'gradient' ? {
          boxShadow: [
            '0 0 20px rgb(16 185 129 / 0.3)',
            '0 0 30px rgb(59 130 246 / 0.4)',
            '0 0 20px rgb(16 185 129 / 0.3)',
          ]
        } : {}}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: [0.42, 0, 0.58, 1] as [number, number, number, number]
        }}
      >
        <BadgeContent />
      </motion.div>
    </motion.div>
  );
};

// New Ribbon SVG Component for larger areas
export const NewRibbon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <motion.div
    initial={{ rotate: -45, scale: 0 }}
    animate={{ rotate: 0, scale: 1 }}
    transition={{ type: "spring", stiffness: 300, damping: 15 }}
    className={`absolute top-2 right-2 ${className}`}
  >
    <svg
      width="60"
      height="60"
      viewBox="0 0 60 60"
      className="drop-shadow-lg"
    >
      <defs>
        <linearGradient id="ribbonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <path
        d="M0 0 L60 0 L60 45 L45 60 L0 15 Z"
        fill="url(#ribbonGradient)"
      />
      <text
        x="30"
        y="20"
        textAnchor="middle"
        className="fill-white text-xs font-bold"
        transform="rotate(45 30 20)"
      >
        NEW
      </text>
    </svg>
  </motion.div>
);

export default NewBadge;
