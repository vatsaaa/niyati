// Simple in-memory credits store for local testing
const credits = new Map();

function getCredits(phone) {
  return credits.get(phone) || 0;
}

function addCredits(phone, amount) {
  const current = getCredits(phone);
  credits.set(phone, current + amount);
  return credits.get(phone);
}

function consumeCredits(phone, amount) {
  const current = getCredits(phone);
  if (current < amount) return false;
  credits.set(phone, current - amount);
  return true;
}

module.exports = { getCredits, addCredits, consumeCredits };
