import React from 'react';
import { Trash2, Coins } from 'lucide-react';

const ProfileHeader = ({ 
  profile, 
  phoneNumber, 
  getUserCountry,
  formatDobForDisplay,
  formatTimeForDisplay,
  getDisplayPlace,
  onReset 
}) => {
  const credits = profile.credits ?? 10;
  const isLowCredits = credits <= 4;
  
  return (
    <div className="flex items-center justify-between p-3 sm:p-4 bg-slate-900/90 border-b border-slate-700 rounded-t-2xl">
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-tr from-purple-600 to-amber-500 flex items-center justify-center shadow-md flex-shrink-0">
          <span className="text-white font-bold text-base sm:text-lg">
            {profile.name ? profile.name.charAt(0).toUpperCase() : '?'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-100 text-lg sm:text-xl">Niyati</h2>
            {/* Credits display */}
            <div 
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                isLowCredits 
                  ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
              title={`${credits} credits remaining. Daily horoscope: 2 credits. Premium questions: 4 credits.`}
            >
              <Coins size={12} />
              <span>{credits}</span>
            </div>
          </div>
          <div className="bg-purple-300/40 text-white px-2 py-1.5 rounded-md text-[11px] sm:text-xs">
            {/* 2-row grid: Row 1 = phone, name, dob | Row 2 = place, time */}
            <div className="grid grid-cols-3 gap-x-2 gap-y-1">
              {/* Row 1 */}
              <div className="flex items-center gap-1 truncate">
                <span>{getUserCountry().flag}</span>
                <span className="truncate">{phoneNumber.split('-')[1] || phoneNumber}</span>
              </div>
                <div className="truncate">{profile.name || '—'}</div>
              <div className="truncate">{formatDobForDisplay(profile.birthDate, getUserCountry().code) || '—'}</div>
              
              {/* Row 2 */}
              <div className="col-span-2 truncate" title={profile.placeOfBirth || ''}>{getDisplayPlace(profile)}</div>
              <div className="truncate">{formatTimeForDisplay(profile.timeOfBirth) || '—'}</div>
            </div>
          </div>
        </div>
      </div>
      <button 
        onClick={onReset} 
        className="text-slate-500 hover:text-red-400 ml-2 flex-shrink-0" 
        title="Logout / Reset"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
};

export default ProfileHeader;
