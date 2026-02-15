/**
 * Compute age in years from a date of birth
 * @param {string|Date} dob 
 * @returns {number|null}
 */
function computeAge(dob) {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
}

/**
 * Compute if a person meets the minimum age requirement (13+) based on their date of birth
 * @param {string|Date} dob 
 * @returns {boolean|null}
 */
function computeIsAdult(dob) {
    const age = computeAge(dob);
    if (age === null) return null;
    return age >= 13;
}

/**
 * Check if a YYYY-MM-DD string represents a valid calendar date
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {boolean}
 */
function isValidDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    // Construct Date and verify components round-trip correctly
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Check if a date string is in the future
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {boolean}
 */
function isFutureDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d > today;
}

/**
 * Validate a date of birth string, returning structured error info.
 * Returns { valid: true } if the date is acceptable (or not provided).
 * Returns { valid: false, code, message } if invalid/future/underage.
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {{ valid: boolean, code?: string, message?: string }}
 */
function validateDateOfBirth(dateStr) {
    if (!dateStr) return { valid: true };
    if (!isValidDate(dateStr)) {
        return {
            valid: false,
            code: 'PROFILE_002',
            message: `The date "${dateStr}" doesn't exist. Please provide a valid date of birth (e.g., "19 May 1979" or "1979-05-19").`
        };
    }
    if (isFutureDate(dateStr)) {
        return {
            valid: false,
            code: 'PROFILE_002',
            message: `The date you provided (${dateStr}) is in the future. Please share your actual date of birth.`
        };
    }
    const age = computeAge(dateStr);
    if (age !== null && age < 13) {
        return {
            valid: false,
            code: 'PROFILE_003',
            message: 'Niyati is available for users 13 and above.'
        };
    }
    return { valid: true };
}

module.exports = {
    computeAge,
    computeIsAdult,
    isValidDate,
    isFutureDate,
    validateDateOfBirth
};
