// @niyati/auth-core — emailProvider tests
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: 'x' }) })
}), { virtual: true });

const ORIGINAL_ENV = process.env;

describe('emailProvider.sendMail', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  test('returns stub when SMTP not configured', async () => {
    const { sendMail } = require('../lib/emailProvider');
    const info = await sendMail({ to: 'a@b.com', subject: 'hi', text: 't' });
    expect(info).toHaveProperty('accepted');
    expect(info.accepted).toContain('a@b.com');
  });

  test('throws when transport exists but EMAIL_FROM missing', async () => {
    process.env.SMTP_HOST = 'smtp.example';
    process.env.SMTP_USER = 'user';
    delete process.env.EMAIL_FROM;
    jest.mock('nodemailer', () => ({
      createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: 'x' }) })
    }), { virtual: true });
    const { sendMail } = require('../lib/emailProvider');
    await expect(sendMail({ to: 'a@b.com', subject: 'x' })).rejects.toThrow('EMAIL_FROM');
  });

  test('accepts injectable logger', async () => {
    const customLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    const { createEmailProvider } = require('../lib/emailProvider');
    const provider = createEmailProvider({ logger: customLogger });
    await provider.sendMail({ to: 'a@b.com', subject: 'hi', text: 't' });
    expect(customLogger.info).toHaveBeenCalled();
  });
});
