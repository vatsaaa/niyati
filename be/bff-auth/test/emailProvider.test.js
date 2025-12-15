const ORIGINAL_ENV = process.env;

describe('emailProvider.sendMail', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    // mock commons logger
    global.loggerMock = { info: jest.fn(), error: jest.fn() };
    jest.mock('../commons/lib/logger', () => ({ logger: global.loggerMock }));
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
    delete global.loggerMock;
  });

  test('returns stub when SMTP not configured', async () => {
    const { sendMail } = require('../lib/emailProvider');
    const info = await sendMail({ to: 'a@b.com', subject: 'hi', text: 't' });
    expect(info).toHaveProperty('accepted');
    expect(global.loggerMock.info).toHaveBeenCalled();
  });

  test('throws when transport exists but EMAIL_FROM missing', async () => {
    // Provide SMTP env so getTransport returns a transport; mock nodemailer.createTransport
    process.env.SMTP_HOST = 'smtp.example';
    process.env.SMTP_USER = 'user';
    jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: 'x' }) }) }), { virtual: true });
    const { sendMail } = require('../lib/emailProvider');
    await expect(sendMail({ to: 'a@b.com', subject: 'x' })).rejects.toThrow('EMAIL_FROM');
  });
});
