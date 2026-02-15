const express = require('express');
const router = express.Router();
const commons = require('@niyati/commons');
const { logger, sanitize, ErrorCodes } = commons;

// Auth middleware
const authMiddleware = commons.authenticateOrReject || ((req, res, next) => next());

// Helper: resolve user_id from phoneNumber via user_profiles
async function resolveUserId(db, phoneNumber) {
  const result = await db.query(
    `SELECT user_id FROM user_profiles
     WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
     LIMIT 1`,
    [phoneNumber]
  );
  return result && result.rows && result.rows[0] ? result.rows[0].user_id : null;
}

// ============================================================================
// POST /chat/message
// Save a chat message (user or assistant) for persistence.
// Body: { phoneNumber, role, content, queryType?, creditCost?, metadata? }
// ============================================================================
router.post('/message', authMiddleware, async (req, res) => {
  try {
    const { phoneNumber, role, content, queryType, creditCost, metadata } = req.body || {};

    // Validation
    if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }
    if (!role || !['user', 'assistant'].includes(role)) {
      return res.sendError(ErrorCodes.INVALID_INPUT, 'invalid_role');
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_content');
    }
    if (content.length > 5000) {
      return res.sendError(ErrorCodes.INVALID_INPUT, 'content_too_long');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Resolve user_id
    const userId = await resolveUserId(db, phoneNumber.trim());
    if (!userId) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
    }

    const insertSql = `
      INSERT INTO chat_messages (user_id, role, content, query_type, credit_cost, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, now())
      RETURNING message_id, user_id, role, created_at
    `;

    const result = await db.query(insertSql, [
      userId,
      role,
      content.trim(),
      queryType || null,
      parseInt(creditCost, 10) || 0,
      metadata ? JSON.stringify(metadata) : null
    ]);

    const row = result.rows[0];
    logger.info({ msg: 'chat.message.saved', userId, role, messageId: row.message_id });

    return res.sendSuccess({
      messageId: row.message_id,
      role: row.role,
      createdAt: row.created_at
    });
  } catch (err) {
    logger.error(sanitize({ msg: 'chat.message.error', err: err && err.message, stack: err && err.stack }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'chat_message_save_failed');
  }
});

// ============================================================================
// GET /chat/history
// Retrieve chat history for a user.
// Query params: phoneNumber (required), limit (optional, default 50)
// ============================================================================
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const phoneNumber = (req.query.phoneNumber || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    if (!phoneNumber) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Resolve user_id
    const userId = await resolveUserId(db, phoneNumber);
    if (!userId) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
    }

    const result = await db.query(
      `SELECT message_id, role, content, query_type, credit_cost, metadata, created_at
       FROM chat_messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    const messages = (result && result.rows) || [];

    logger.info({ msg: 'chat.history.fetched', userId, count: messages.length });

    return res.sendSuccess({ messages });
  } catch (err) {
    logger.error(sanitize({ msg: 'chat.history.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'chat_history_failed');
  }
});

module.exports = router;
