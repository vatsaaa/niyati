const nodemailer = require('nodemailer');
const { logger } = require('../commons');

// Minimal email provider wrapper. If SMTP env vars are configured, it uses nodemailer.
// Otherwise falls back to a console log (useful in dev/test).

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

async function sendMail({ to, subject, text, html }) {
  const transport = getTransport();
  if (!transport) {
    logger.info({ msg: 'email_send_stub', to, subject });
    // for dev, return an object resembling nodemailer
    return { accepted: [to], messageId: `dev-${Date.now()}` };
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    logger.error({ msg: 'EMAIL_FROM not configured' });
    throw new Error('EMAIL_FROM environment variable is required');
  }

  const info = await transport.sendMail({ from, to, subject, text, html });
  logger.info({ msg: 'email_sent', to, subject, messageId: info.messageId });
  return info;
}

module.exports = { sendMail };
