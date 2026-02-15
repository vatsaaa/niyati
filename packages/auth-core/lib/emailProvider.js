const nodemailer = require('nodemailer');

// Default logger — uses console. Callers can inject a custom logger via
// createEmailProvider({ logger }) for structured logging (e.g. pino).
const defaultLogger = {
  info: (...args) => console.info('[auth-core:email]', ...args),
  error: (...args) => console.error('[auth-core:email]', ...args),
  warn: (...args) => console.warn('[auth-core:email]', ...args)
};

function getTransport() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }
  return null;
}

/**
 * Factory: create an email provider with an optional custom logger.
 *
 *   const provider = createEmailProvider({ logger: pinoLogger });
 *   await provider.sendMail({ to, subject, text });
 */
function createEmailProvider({ logger } = {}) {
  const log = logger || defaultLogger;

  async function sendMail({ to, subject, text, html }) {
    const transport = getTransport();
    if (!transport) {
      log.info({ msg: 'email_send_stub', to, subject });
      return { accepted: [to], messageId: `dev-${Date.now()}` };
    }

    const from = process.env.EMAIL_FROM;
    if (!from) {
      log.error({ msg: 'EMAIL_FROM not configured' });
      throw new Error('EMAIL_FROM environment variable is required');
    }

    const info = await transport.sendMail({ from, to, subject, text, html });
    log.info({ msg: 'email_sent', to, subject, messageId: info.messageId });
    return info;
  }

  return { sendMail };
}

// Convenience: default instance using console logger
const { sendMail } = createEmailProvider();

module.exports = { sendMail, createEmailProvider };
