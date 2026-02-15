const express = require('express');
const router = express.Router();
const commons = require('@niyati/commons');
const { logger, sanitize, ErrorCodes } = commons;

// Auth middleware for all payment routes
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
// POST /payments/submit
// Submit UPI payment details for verification.
// Body: { phoneNumber, upiId, transactionId, amount, currency? }
// ============================================================================
router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const { phoneNumber, upiId, transactionId, amount, currency } = req.body || {};

    // Validation
    if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }
    if (!upiId || typeof upiId !== 'string' || !upiId.trim()) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_upi_id');
    }
    // UPI ID basic validation: must contain @
    if (!/@/.test(upiId)) {
      return res.sendError(ErrorCodes.INVALID_INPUT, 'invalid_upi_id');
    }
    if (!transactionId || typeof transactionId !== 'string' || !/^\d{12}$/.test(transactionId.trim())) {
      return res.sendError(ErrorCodes.INVALID_INPUT, 'invalid_transaction_id');
    }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      return res.sendError(ErrorCodes.INVALID_INPUT, 'invalid_amount');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Resolve user_id
    const userId = await resolveUserId(db, phoneNumber.trim());
    if (!userId) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
    }

    // Calculate credits from amount (same logic as add-credits)
    // Default: 1 credit per ₹10
    const credits = Math.floor(amountNum / 10);

    const insertSql = `
      INSERT INTO payment_verifications (
        user_id, upi_id, transaction_id, amount, currency, credits, status, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', now())
      RETURNING verification_id, user_id, upi_id, transaction_id, amount, currency, credits, status, submitted_at
    `;

    const result = await db.query(insertSql, [
      userId,
      upiId.trim(),
      transactionId.trim(),
      amountNum,
      (currency || 'INR').toUpperCase(),
      credits
    ]);

    const row = result.rows[0];
    logger.info({ msg: 'payment.submit.success', userId, txnId: transactionId, amount: amountNum });

    return res.sendSuccess({
      verificationId: row.verification_id,
      status: row.status,
      credits: row.credits,
      amount: row.amount,
      estimatedTime: '2-5 minutes',
      message: 'Payment verification in progress'
    });
  } catch (err) {
    // Handle unique constraint violation (duplicate transaction_id)
    if (err && err.code === '23505') {
      return res.status(409).json({
        status: 'error',
        error: { code: 'DUPLICATE_TRANSACTION', message: 'This transaction ID has already been submitted' }
      });
    }
    logger.error(sanitize({ msg: 'payment.submit.error', err: err && err.message, stack: err && err.stack }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'payment_submit_failed');
  }
});

// ============================================================================
// GET /payments/status/:verificationId
// Check payment verification status.
// ============================================================================
router.get('/status/:verificationId', authMiddleware, async (req, res) => {
  try {
    const { verificationId } = req.params;
    if (!verificationId) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_verification_id');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const result = await db.query(
      `SELECT verification_id, status, credits, amount, currency, submitted_at, verified_at
       FROM payment_verifications
       WHERE verification_id = $1`,
      [verificationId]
    );

    if (!result || !result.rows || result.rows.length === 0) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'verification_not_found');
    }

    const row = result.rows[0];
    return res.sendSuccess({
      verificationId: row.verification_id,
      status: row.status,
      credits: row.credits,
      amount: row.amount,
      currency: row.currency,
      submittedAt: row.submitted_at,
      verifiedAt: row.verified_at
    });
  } catch (err) {
    logger.error(sanitize({ msg: 'payment.status.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'payment_status_failed');
  }
});

// ============================================================================
// POST /payments/verify
// Admin/manual verification trigger. Marks payment as verified and provisions credits.
// Body: { verificationId }
// ============================================================================
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { verificationId } = req.body || {};
    if (!verificationId) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_verification_id');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Look up the verification record
    const lookupResult = await db.query(
      `SELECT verification_id, user_id, amount, credits, status
       FROM payment_verifications
       WHERE verification_id = $1`,
      [verificationId]
    );

    if (!lookupResult || !lookupResult.rows || lookupResult.rows.length === 0) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'verification_not_found');
    }

    const record = lookupResult.rows[0];

    // Prevent re-verification
    if (record.status === 'verified') {
      return res.status(409).json({
        status: 'error',
        error: { code: 'ALREADY_VERIFIED', message: 'This payment has already been verified' }
      });
    }

    // Mark as verified
    await db.query(
      `UPDATE payment_verifications
       SET status = 'verified', verified_at = now(), verification_method = 'manual'
       WHERE verification_id = $1`,
      [verificationId]
    );

    // Add credits to user account
    const creditResult = await db.query(
      `UPDATE user_credits
       SET credits = credits + $2,
           is_paid = TRUE,
           total_paid_amount = COALESCE(total_paid_amount, 0) + $3,
           last_payment_amount = $3,
           last_payment_verified = TRUE,
           updated_at = now()
       WHERE user_id = $1
       RETURNING user_id, credits`,
      [record.user_id, record.credits, record.amount]
    );

    const newBalance = creditResult && creditResult.rows && creditResult.rows[0]
      ? creditResult.rows[0].credits
      : null;

    // Record the credit addition as a charge_transaction for audit
    await db.query(
      `INSERT INTO charge_transactions (request_id, phone_number, credits_charged, query_type, status, metadata, created_at)
       VALUES ($1, '', $2, 'payment', 'completed', $3, now())`,
      [
        `payment_${verificationId}`,
        record.credits,
        JSON.stringify({ verificationId, amount: record.amount })
      ]
    );

    logger.info({
      msg: 'payment.verify.success',
      verificationId,
      userId: record.user_id,
      creditsAdded: record.credits,
      newBalance
    });

    return res.sendSuccess({
      verificationId,
      status: 'verified',
      creditsAdded: record.credits,
      newBalance
    });
  } catch (err) {
    logger.error(sanitize({ msg: 'payment.verify.error', err: err && err.message, stack: err && err.stack }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'payment_verify_failed');
  }
});

module.exports = router;
