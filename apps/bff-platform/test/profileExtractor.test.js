const { extractProfileFields } = require('../lib/profileExtractor');

describe('extractProfileFields', () => {
  test('extracts all fields from a single message', () => {
    const msg = "Hi Niyati, I am Arun Bhardwaj born in New York on 17 May 1999 at 1:37 am";
    const out = extractProfileFields(msg);
    expect(out).toHaveProperty('name', 'Arun Bhardwaj');
    expect(out).toHaveProperty('dob', '1999-05-17');
    expect(out.timeOfBirth.toLowerCase()).toContain('1:37');
    expect(out).toHaveProperty('placeOfBirth');
    expect(out.placeOfBirth.toLowerCase()).toContain('new york');
  });

  test('name-only message stores name and leaves others empty', () => {
    const msg = 'Hi Niyati, I am Priya Sharma.';
    const out = extractProfileFields(msg);
    expect(out).toHaveProperty('name', 'Priya Sharma');
    expect(out.dob).toBeUndefined();
    expect(out.timeOfBirth).toBeUndefined();
    expect(out.placeOfBirth).toBeUndefined();
  });

  test('progressive merge: place then date/time then saved', () => {
    const p1 = extractProfileFields('I am Vikram Patel, born in Chennai');
    expect(p1.name).toBe('Vikram Patel');
    expect(p1.placeOfBirth && p1.placeOfBirth.toLowerCase()).toContain('chennai');

    const p2 = extractProfileFields('I was born on 20 August 2000');
    expect(p2.dob).toBe('2000-08-20');

    const p3 = extractProfileFields('at 05:15 pm');
    expect(p3.timeOfBirth).toBeDefined();
  });

  test('handles ambiguous short place names gracefully', () => {
    const out = extractProfileFields('I was born in Springfield');
    expect(out.placeOfBirth).toBeDefined();
    expect(out.placeOfBirth).toMatch(/Springfield/i);
  });

  test('handles ISO date format', () => {
    const out = extractProfileFields('My dob is 1999-12-31');
    expect(out.dob).toBe('1999-12-31');
  });

  test('extracts all fields from "I am X, born on D at T in P" format', () => {
    const msg = 'I am Ankur Vatsa, born on 19 May 1979 at 09:30 am in New Delhi';
    const out = extractProfileFields(msg);
    expect(out.name).toBe('Ankur Vatsa');
    expect(out.dob).toBe('1979-05-19');
    expect(out.timeOfBirth).toMatch(/9:30|09:30/i);
    expect(out.placeOfBirth).toMatch(/New Delhi/i);
  });
});
// Endpoint-level tests removed here to avoid duplication.
// Coverage retained via:
// - unit tests above (`extractProfileFields`)
// - integration / NLP-focused tests in `profileExtractor.nlp.test.js`
// - E2E tests in `e2e/tests/profile_extraction.spec.js`
