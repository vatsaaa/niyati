import React from 'react';
import { Moon, Star } from 'lucide-react';

const BackgroundStars = () => {
  return (
    <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
      <div className="absolute top-10 left-10 text-purple-500/20 animate-pulse">
        <Moon size={120} />
      </div>
      <div className="absolute bottom-20 right-20 text-amber-500/20 animate-pulse duration-1000">
        <Star size={80} />
      </div>
    </div>
  );
};

export default BackgroundStars;
