const { test, expect } = require('@playwright/test');

test.describe('Profile extraction API progressive flow', () => {
  test('progressive extraction merges fields across messages', async ({ request, baseURL }) => {
    const bff = baseURL || 'http://localhost:4000';

    // Step 1: user provides name
    let resp = await request.post(`${bff}/api/v1/profile/extract`, { data: { text: 'Hi Niyati, I am Arun Bhardwaj.' } });
    expect(resp.ok()).toBeTruthy();
    let json = await resp.json();
    expect(json.status).toBe('ok');
    expect(json.data.name).toBe('Arun Bhardwaj');

    // Step 2: user provides place only
    resp = await request.post(`${bff}/api/v1/profile/extract`, { data: { text: 'I was born in New York.' } });
    expect(resp.ok()).toBeTruthy();
    json = await resp.json();
    expect(json.status).toBe('ok');
    expect(json.data.placeOfBirth.toLowerCase()).toContain('new york');

    // Step 3: date and time complete the profile
    resp = await request.post(`${bff}/api/v1/profile/extract`, { data: { text: 'I was born on 17 May 1999 at 1:37 am' } });
    expect(resp.ok()).toBeTruthy();
    json = await resp.json();
    expect(json.data.dob).toBe('1999-05-17');
    expect(json.data.timeOfBirth).toBeDefined();
  });
});
