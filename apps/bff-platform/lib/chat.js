const express = require('express');
const router = express.Router();
const { logger } = require('@niyati/commons');
const { getQueryCreditCost, getQueryType, isCasualConversation } = require('./queryClassifier');

// POST /chat/classify
// Body: { message }
router.post('/classify', async (req, res) => {
  try {
    const { message } = req.body || {};
    const { ErrorCodes } = require('@niyati/commons');

    if (!message || typeof message !== 'string') {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_message');
    }

    // Load config defaults
    let config = {
      credits_horoscope_cost: 2,
      credits_premium_cost: 4
    };

    const db = req.app.get('db');
    if (db) {
      try {
        const result = await db.query('SELECT key, value FROM app_config WHERE key IN ($1, $2)',
          ['credits_horoscope_cost', 'credits_premium_cost']);
        for (const row of result.rows) {
          config[row.key] = parseInt(row.value, 10) || config[row.key];
        }
      } catch (e) {
        logger.warn({ msg: 'Failed to load app_config for classify', err: e.message });
      }
    }

    const queryType = getQueryType(message);
    const creditCost = getQueryCreditCost(message, config);
    const isBillable = !isCasualConversation(message);

    logger.info({ msg: 'chat_classify', queryType, creditCost, isBillable, messageLength: message.length });

    return res.sendSuccess({
      queryType,
      creditCost,
      isBillable,
      config: {
        credits_horoscope_cost: config.credits_horoscope_cost,
        credits_premium_cost: config.credits_premium_cost
      }
    });
  } catch (err) {
    logger.error({ msg: 'chat_classify_error', err: err && err.stack });
    return res.sendError((require('@niyati/commons') && require('@niyati/commons').ErrorCodes) || 'internal_error', 'classification_failed');
  }
});

module.exports = router;
