import { describe, test, expect, beforeEach, vi } from 'vitest';
import { extractProfileFields } from './profileExtractor';
import { parseNaturalDate, parseNaturalTime } from './dateParser';

// Mock dependencies
vi.mock('./dateParser', () => ({
    parseNaturalDate: vi.fn(),
    parseNaturalTime: vi.fn()
}));

describe('profileExtractor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Name Extraction', () => {
        test('extracts name correctly from compound sentence', async () => {
            const text = "My name is Ankur and I was born in Delhi";
            const result = await extractProfileFields(text);
            expect(result.name).toBe('Ankur');
        });
    });

    describe('Place Extraction', () => {
        test('extracts place from "born in Place"', async () => {
            const text = "I was born in New Delhi";
            const result = await extractProfileFields(text);
            expect(result.placeOfBirth).toBe('New Delhi');
        });

        test('extracts place from "from Place"', async () => {
            const text = "I am from London";
            const result = await extractProfileFields(text);
            expect(result.placeOfBirth).toBe('London');
        });

        test('extracts place with "born in Place on Date" (Date at end)', async () => {
            const text = "I was born in New Delhi on 19 May 1979";
            const result = await extractProfileFields(text);
            expect(result.placeOfBirth).toBe('New Delhi');
            expect(result.dob).toBe('1979-05-19');
        });

        test('extracts place with "born on Date in Place" (Date in middle)', async () => {
            const text = "I was born on 19 May 1979 in New Delhi";
            const result = await extractProfileFields(text);
            expect(result.placeOfBirth).toBe('New Delhi');
            expect(result.dob).toBe('1979-05-19');
        });

        test('extracts place with "born at Time in Place"', async () => {
            const text = "I was born at 11:30 am in Mumbai";
            const result = await extractProfileFields(text);
            expect(result.placeOfBirth).toBe('Mumbai');
            expect(result.timeOfBirth).toBe('11:30 am');
        });

        test('extracts place with "born in Place at Time"', async () => {
            const text = "I was born in Mumbai at 11:30 am";
            const result = await extractProfileFields(text);
            expect(result.placeOfBirth).toBe('Mumbai');
            expect(result.timeOfBirth).toBe('11:30 am');
        });
    });

    describe('Date Extraction', () => {
        test('extracts ISO date', async () => {
            const result = await extractProfileFields("My dob is 1990-01-01");
            expect(result.dob).toBe('1990-01-01');
        });

        test('extracts text date', async () => {
            const result = await extractProfileFields("Born on 12 Jan 1990");
            expect(result.dob).toBe('1990-01-12');
        });

        test('does not extract today date from time-only input', async () => {
            // Mock natural date to return today
            const today = new Date().toISOString().split('T')[0];
            parseNaturalDate.mockResolvedValue({ date: today, confidence: 0.9 });

            const result = await extractProfileFields("I was born at 7 am");
            expect(result.dob).toBeUndefined();
            expect(result.timeOfBirth).toBe("7 am"); // Time regex should catch it
        });
    });

    describe('Time Extraction', () => {
        test('extracts simple AM/PM time', async () => {
            const result = await extractProfileFields("Born at 5:30 pm");
            expect(result.timeOfBirth).toBe('5:30 pm');
        });

        test('extracts 24h time', async () => {
            const result = await extractProfileFields("Born at 17:30");
            expect(result.timeOfBirth).toBe('17:30');
        });
    });
});
