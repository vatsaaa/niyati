import { describe, it, expect } from 'vitest';
import { formatTimeForDisplay, formatDobForDisplay, formatCurrentLocationForDisplay, formatPlaceFromLocation, getDisplayPlace } from '../formatters';

describe('formatters', () => {
  it('formatTimeForDisplay converts 24h to AM/PM', () => {
    expect(formatTimeForDisplay('00:00')).toBe('12:00:00 AM');
    expect(formatTimeForDisplay('13:05')).toBe('01:05:00 PM');
    expect(formatTimeForDisplay('12:30:45')).toBe('12:30:45 PM');
    expect(formatTimeForDisplay('')).toBeNull();
  });

  it('formatDobForDisplay handles ISO and returns DD-MMM-YYYY', () => {
    expect(formatDobForDisplay('1990-01-02')).toBe('02-Jan-1990');
    expect(formatDobForDisplay(null)).toBeNull();
  });

  it('formatCurrentLocationForDisplay handles strings and objects', () => {
    expect(formatCurrentLocationForDisplay('Mumbai')).toBe('Mumbai');
    expect(formatCurrentLocationForDisplay({ city: 'Pune', state: 'MH', country: 'India' })).toBe('Pune, MH, India');
    expect(formatCurrentLocationForDisplay(null)).toBeNull();
  });

  it('formatPlaceFromLocation builds place string', () => {
    const loc = { city: 'Pune', state: 'MH', country: 'India' };
    expect(formatPlaceFromLocation(loc)).toBe('Pune, MH, India');
  });

  it('getDisplayPlace prefers placeOfBirth', () => {
    expect(getDisplayPlace(null)).toBe('—');
    expect(getDisplayPlace({ placeOfBirth: 'Bengaluru' })).toBe('Bengaluru');
    expect(getDisplayPlace({ placeOfBirth_raw: 'Some Place, भारत' })).toBe('Some Place');
  });
});
