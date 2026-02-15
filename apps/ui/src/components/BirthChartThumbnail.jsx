import React, { useMemo } from 'react';
import { simpleHash } from '../utils/hash';
import { CACHE_CONFIG } from '../config';

/**
 * BirthChartThumbnail — reads the cached horoscope SVG from localStorage
 * (written by calculateAstrology in services/astrology.js) and renders
 * it as a small thumbnail in the profile header.
 *
 * Returns null when:
 *  - profile lacks birthDate or placeOfBirth
 *  - no cached SVG found
 *  - cache is expired (older than CACHE_CONFIG.astrologyTtlDays)
 */
const BirthChartThumbnail = ({ profile }) => {
  const svgContent = useMemo(() => {
    if (!profile || !profile.birthDate || !profile.placeOfBirth) return null;

    const profileKey = JSON.stringify({
      name: profile.name || null,
      dob: profile.birthDate,
      place: profile.placeOfBirth,
      tob: profile.timeOfBirth || null,
    });
    const cacheKey = `astrology:${simpleHash(profileKey)}`;

    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const age = Date.now() - (parsed.__ts || 0);
      const ttlDays = (CACHE_CONFIG && CACHE_CONFIG.astrologyTtlDays) || 7;
      const TTL = 1000 * 60 * 60 * 24 * ttlDays;

      if (age < 0 || age >= TTL) return null;
      if (!parsed.results || !parsed.results.horoscopeSvg) return null;

      return parsed.results.horoscopeSvg;
    } catch {
      return null;
    }
  }, [profile?.name, profile?.birthDate, profile?.placeOfBirth, profile?.timeOfBirth]);

  if (!svgContent) return null;

  return (
    <div
      data-testid="birth-chart-thumbnail"
      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden border border-amber-500/40 flex-shrink-0 cursor-pointer"
      title="Your birth chart"
      dangerouslySetInnerHTML={{ __html: svgContent }}
      style={{ background: 'rgba(15,23,42,0.8)' }}
    />
  );
};

export default BirthChartThumbnail;
