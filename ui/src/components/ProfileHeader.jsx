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
    <div className="flex items-center justify-between p-4 bg-slate-900/90 border-b border-slate-700 rounded-t-2xl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-amber-500 flex items-center justify-center shadow-md">
          <span className="text-white font-bold text-lg">
            {profile.user_name ? profile.user_name.charAt(0).toUpperCase() : '?'}
          </span>
        </div>
        <div>
          <h2 className="font-semibold text-slate-100 text-xl">Niyati</h2>
          <div className="flex flex-row gap-1 text-xs text-slate-400 items-center">
            <div className="flex flex-col gap-0.5 text-xs text-slate-400">
              <div aria-live="polite" className="bg-purple-300/40 text-white px-2 py-2 rounded-md w-94 max-w-full min-w-0 overflow-hidden">
                <div className="min-w-0 text-[clamp(11px,1.1vw,13px)]">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 items-start">
                    {/* Row 1 */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex-shrink-0 mr-1.5 flex items-center gap-1.5">
                        <span className="text-base">{getUserCountry().flag}</span>
                        <span>{phoneNumber.split('-')[1] || phoneNumber}</span>
                      </div>
                    </div>
                    <div className="min-w-0 truncate ">{profile.user_name || '—'}</div>
                    <div className="min-w-0 truncate">{formatDobForDisplay(profile.user_dob, getUserCountry().code) || '—'}</div>
                    
                    {/* Row 2: place directly under flag/phone (col 1), optional center column left blank, time under DOB (col 3) */}
                    <div title={profile.user_placeOfBirth || profile.placeOfBirth_raw || ''} className="min-w-0 truncate sm:col-span-2">{getDisplayPlace(profile)}</div>
                    <div className="min-w-0 truncate">{formatTimeForDisplay(profile.user_timeOfBirth) || '—'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <button 
        onClick={onReset} 
        className="text-slate-500 hover:text-red-400 self-start relative right-4 top-1" 
        title="Logout / Reset"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
};

export default ProfileHeader;
