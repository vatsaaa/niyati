import React from 'react';
import { Trash2 } from 'lucide-react';

const ProfileHeader = ({ 
  profile, 
  phoneNumber, 
  getUserCountry,
  formatDobForDisplay,
  formatTimeForDisplay,
  getDisplayPlace,
  onReset 
}) => {
  return (
    <div className="flex items-center justify-between p-3 sm:p-4 bg-slate-900/90 border-b border-slate-700 rounded-t-2xl">
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-tr from-purple-600 to-amber-500 flex items-center justify-center shadow-md flex-shrink-0">
          <span className="text-white font-bold text-base sm:text-lg">
            {profile.user_name ? profile.user_name.charAt(0).toUpperCase() : '?'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-slate-100 text-lg sm:text-xl">Niyati</h2>
          <div className="bg-purple-300/40 text-white px-2 py-1.5 rounded-md text-[11px] sm:text-xs">
            {/* 2-row grid: Row 1 = phone, name, dob | Row 2 = place, time */}
            <div className="grid grid-cols-3 gap-x-2 gap-y-1">
              {/* Row 1 */}
              <div className="flex items-center gap-1 truncate">
                <span>{getUserCountry().flag}</span>
                <span className="truncate">{phoneNumber.split('-')[1] || phoneNumber}</span>
              </div>
              <div className="truncate">{profile.user_name || '—'}</div>
              <div className="truncate">{formatDobForDisplay(profile.user_dob, getUserCountry().code) || '—'}</div>
              
              {/* Row 2 */}
              <div className="col-span-2 truncate" title={profile.user_placeOfBirth || ''}>{getDisplayPlace(profile)}</div>
              <div className="truncate">{formatTimeForDisplay(profile.user_timeOfBirth) || '—'}</div>
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
