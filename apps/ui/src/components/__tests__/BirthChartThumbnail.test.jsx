import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the config module to provide CACHE_CONFIG
vi.mock('../../config', () => ({ CACHE_CONFIG: { astrologyTtlDays: 7 } }));

import BirthChartThumbnail from '../BirthChartThumbnail';
import { simpleHash } from '../../utils/hash';

function makeCacheKey(profile) {
  const profileKey = JSON.stringify({
    name: profile.name || null,
    dob: profile.birthDate,
    place: profile.placeOfBirth,
    tob: profile.timeOfBirth || null,
  });
  return `astrology:${simpleHash(profileKey)}`;
}

describe('BirthChartThumbnail', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test('renders nothing when no SVG data is cached', () => {
    const { container } = render(<BirthChartThumbnail profile={{}} />);
    expect(container.innerHTML).toBe('');
  });

  test('renders the horoscope SVG when cached data exists', () => {
    const profile = { name: 'Ankur', birthDate: '1979-05-19', placeOfBirth: 'New Delhi', timeOfBirth: '09:30' };
    const cacheKey = makeCacheKey(profile);

    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="80" fill="gold"/></svg>';
    localStorage.setItem(cacheKey, JSON.stringify({
      __ts: Date.now(),
      results: { horoscopeSvg: svgContent, planets: {} }
    }));

    const { container } = render(<BirthChartThumbnail profile={profile} />);

    // Should render the SVG content
    const svgWrapper = container.querySelector('[data-testid="birth-chart-thumbnail"]');
    expect(svgWrapper).toBeTruthy();
    expect(svgWrapper.innerHTML).toContain('<svg');
  });

  test('renders nothing when cache is expired', () => {
    const profile = { name: 'Ankur', birthDate: '1979-05-19', placeOfBirth: 'New Delhi', timeOfBirth: '09:30' };
    const cacheKey = makeCacheKey(profile);

    // Set __ts to > 7 days ago (expired)
    localStorage.setItem(cacheKey, JSON.stringify({
      __ts: Date.now() - (8 * 24 * 60 * 60 * 1000),
      results: { horoscopeSvg: '<svg></svg>', planets: {} }
    }));

    const { container } = render(<BirthChartThumbnail profile={profile} />);
    expect(container.innerHTML).toBe('');
  });

  test('renders nothing when profile has incomplete birth details', () => {
    const { container } = render(
      <BirthChartThumbnail profile={{ name: 'Ankur' }} />
    );
    expect(container.innerHTML).toBe('');
  });
});
