import { describe, it, expect } from 'vitest';
import { formatDobForDisplay, formatPlaceFromLocation, formatCurrentLocationForDisplay } from '../formatters';

describe('Synthesized profile message composition', () => {
  it('composes a readable English sentence from profile fields', () => {
    const profile = {
      name: 'Asha Rao',
      date_of_birth: '1990-05-12',
      time_of_birth: '09:30',
      place_of_birth: 'Mumbai, India',
      currentLocation: { city: 'Pune', state: 'MH', country: 'India' }
    };

    const dob = formatDobForDisplay(profile.date_of_birth);
    const place = formatPlaceFromLocation({ city: 'Mumbai', state: null, country: 'India' });
    const current = formatCurrentLocationForDisplay(profile.currentLocation);

    const sentence = `My name is ${profile.name}. I was born on ${dob} in ${place}. I currently live in ${current}.`;

    expect(sentence).toMatch(/Asha Rao/);
    expect(sentence).toMatch(/1990/);
    expect(sentence).toMatch(/Mumbai/);
    expect(sentence).toMatch(/Pune/);
  });
});
