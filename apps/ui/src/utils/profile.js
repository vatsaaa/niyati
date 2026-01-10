/**
 * Checks if a user profile has all the required fields for astrology calculations.
 * @param {object} p - The user profile object.
 * @returns {boolean} True if the profile is complete, false otherwise.
 */
export function hasAllRequiredFields(p) {
  return !!(p.name && p.birthDate && p.placeOfBirth && p.timeOfBirth);
}

/**
 * Identifies which required fields are missing from a user profile.
 * @param {object} p - The user profile object.
 * @returns {string[]} An array of the names of the missing fields.
 */
export function missingProfileFields(p) {
  const missing = [];
  if (!p.name) missing.push('name');
  if (!p.birthDate) missing.push('date of birth');
  if (!p.placeOfBirth) missing.push('place of birth');
  if (!p.timeOfBirth) missing.push('time of birth');
  return missing;
}
