/**
 * Compute if a person is 18+ based on their date of birth
 * @param {string|Date} dob 
 * @returns {boolean|null}
 */
function computeIsAdult(dob) {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 18;
}

module.exports = {
    computeIsAdult
};
