// Re-export from @niyati/auth-core with niyati-specific logger
const { logger } = require('@niyati/commons/lib/logger');
const { createEmailProvider } = require('@niyati/auth-core/lib/emailProvider');

// Create instance with niyati's structured logger
const { sendMail } = createEmailProvider({ logger });

module.exports = { sendMail, createEmailProvider };
