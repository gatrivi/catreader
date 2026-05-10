import React from 'react';
import { motion } from 'motion/react';

export const SadMonkIcon: React.FC<{ size?: number; className?: string }> = ({ size = 64, className }) => {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ 
        opacity: [0.4, 0.8, 0.4],
        scale: [1, 1.05, 1],
        filter: ["drop-shadow(0 0 2px #f59e0b)", "drop-shadow(0 0 10px #f59e0b)", "drop-shadow(0 0 2px #f59e0b)"]
      }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Hooded Head */}
      <path 
        d="M12 4C8 4 6 7 6 10C6 13 8 15 12 15C16 15 18 13 18 10C18 7 16 4 12 4Z" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      {/* Closed/Sad Eyes */}
      <path d="M9 10L10 11M15 10L14 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Downward Mouth */}
      <path d="M11 13C11 13 11.5 12.5 12 12.5C12.5 12.5 13 13 13 13" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      {/* Robe/Shoulders */}
      <path 
        d="M5 20C5 18 7 16 12 16C17 16 19 18 19 20" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
      />
      {/* Halo/Glow ring */}
      <circle cx="12" cy="10" r="8" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" className="opacity-30" />
    </motion.svg>
  );
};
