/**
 * Checks if a user profile has all the required fields for astrology calculations.
 * @param {object} p - The user profile object.
 * @returns {boolean} True if the profile is complete, false otherwise.
 */
export function hasAllRequiredFields(p) {
  return !!(p.user_name && p.user_dob && p.user_placeOfBirth && p.user_timeOfBirth);
}

/**
 * Identifies which required fields are missing from a user profile.
 * @param {object} p - The user profile object.
 * @returns {string[]} An array of the names of the missing fields.
 */
export function missingProfileFields(p) {
  const missing = [];
  if (!p.user_name) missing.push('name');
  if (!p.user_dob) missing.push('date of birth');
  if (!p.user_placeOfBirth) missing.push('place of birth');
  if (!p.user_timeOfBirth) missing.push('time of birth');
  return missing;
}
