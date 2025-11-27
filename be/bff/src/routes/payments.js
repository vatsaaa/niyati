const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const creditsService = require('../services/creditsService');
const crypto = require('crypto');

// Optional Razorpay integration
let Razorpay;
try { Razorpay = require('razorpay'); } catch (e) { Razorpay = null; }

// In-memory orders store (id -> order)
const orders = new Map();

const PLAN_MAP = {
  plan_5: { credits: 5, amountInPaise: 30000 },
  plan_10: { credits: 10, amountInPaise: 50000 }
};

// Helper: find order by providerOrderId
function findOrderByProviderId(providerOrderId) {
  for (const [, ord] of orders.entries()) {
    if (ord.providerOrderId === providerOrderId) return ord;
  }
  return null;
}

// POST /api/payments/create-order
// Creates an in-memory order and (if Razorpay keys present) a Razorpay Order
router.post('/create-order', async (req, res) => {
  const { phone, planId } = req.body || {};
  if (!phone || !planId || !PLAN_MAP[planId]) return res.status(400).json({ status: 'error', reason: 'invalid_input' });

  const orderId = uuidv4();
  const { credits, amountInPaise } = PLAN_MAP[planId];
  const order = {
    id: orderId,
    phone,
    planId,
    credits,
    amountInPaise,
    currency: 'INR',
    status: 'created',
    createdAt: new Date().toISOString()
  };
  orders.set(orderId, order);

  // If Razorpay keys present, create a Razorpay Order and return provider details
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (Razorpay && keyId && keySecret) {
    try {
      const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const rOrder = await rzp.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: orderId,
        payment_capture: 1
      });
      order.providerOrderId = rOrder.id;
      orders.set(orderId, order);
      return res.json({ status: 'ok', orderId, providerOrderId: rOrder.id, amountInPaise, currency: 'INR', planId, credits, keyId });
    } catch (err) {
      console.error('Razorpay create order failed', err && err.message);
      // fall through to return local order info
    }
  }

  // Fallback: return our local order data and a test keyId for UI
  return res.json({ status: 'ok', orderId, amountInPaise, currency: 'INR', planId, credits, keyId: keyId || 'rzp_test_key' });
});

// POST /api/payments/verify
// Verify client-provided Razorpay checkout signature (best-effort quick verify)
router.post('/verify', (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) return res.status(400).json({ status: 'error', reason: 'missing_parameters' });

  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!keySecret) return res.status(400).json({ status: 'error', reason: 'no_key_secret' });

  const generated = crypto.createHmac('sha256', keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  if (generated === razorpay_signature) {
    // Map provider order id -> our order and credit
    const ourOrder = findOrderByProviderId(razorpay_order_id);
    if (ourOrder && ourOrder.status !== 'captured') {
      creditsService.addCredits(ourOrder.phone, ourOrder.credits);
      ourOrder.status = 'captured';
      ourOrder.providerPaymentId = razorpay_payment_id;
      ourOrder.updatedAt = new Date().toISOString();
      orders.set(ourOrder.id, ourOrder);
    }
    return res.json({ status: 'ok', orderId: (ourOrder && ourOrder.id) || null });
  }
  return res.status(400).json({ status: 'error', reason: 'invalid_signature' });
});

// GET /api/payments/status?orderId=
router.get('/status', (req, res) => {
  const orderId = req.query.orderId;
  if (!orderId) return res.status(400).json({ status: 'error', reason: 'missing_orderId' });
  const order = orders.get(orderId);
  if (!order) return res.status(404).json({ status: 'error', reason: 'not_found' });
  const creditsRemaining = creditsService.getCredits(order.phone);
  return res.json({ status: 'ok', order: { ...order }, creditsRemaining });
});

// POST /api/payments/webhook
// Verifies Razorpay webhook signature if present using RAZORPAY_WEBHOOK_SECRET, otherwise supports a simple test payload
router.post('/webhook', (req, res) => {
  const body = req.body || {};
  const razorSig = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // If Razorpay signature present and secret configured, verify using rawBody
  if (razorSig && webhookSecret && req.rawBody) {
    const expected = crypto.createHmac('sha256', webhookSecret).update(req.rawBody).digest('hex');
    if (expected !== razorSig) {
      console.warn('Webhook signature mismatch');
      return res.status(400).json({ status: 'error', reason: 'invalid_signature' });
    }

    // Process Razorpay webhook payload
    const event = body.event || body.type;
    // Example: payment.captured -> payload.payment.entity
    if (event === 'payment.captured' || (body.payload && body.payload.payment && body.payload.payment.entity && body.payload.payment.entity.status === 'captured')) {
      const providerPayment = (body.payload && body.payload.payment && body.payload.payment.entity) || {};
      const providerOrderId = providerPayment.order_id || providerPayment.receipt;
      const providerPaymentId = providerPayment.id;
      const order = findOrderByProviderId(providerOrderId);
      if (!order) {
        console.warn('Webhook: order not found for providerOrderId', providerOrderId);
        return res.json({ status: 'ignored' });
      }
      if (order.status === 'captured') return res.json({ status: 'ok', reason: 'already_processed' });
      creditsService.addCredits(order.phone, order.credits);
      order.status = 'captured';
      order.providerPaymentId = providerPaymentId;
      order.updatedAt = new Date().toISOString();
      orders.set(order.id, order);
      console.log(`Webhook: Razorpay credited ${order.credits} to ${order.phone}`);
      return res.json({ status: 'ok' });
    }
    // Unknown Razorpay event
    console.log('Webhook received Razorpay event', event);
    return res.json({ status: 'ignored' });
  }

  // Fallback: Basic simulation payload for local testing
  const event = body.event || body.type || 'unknown';
  const orderId = body.orderId || body.payload?.orderId;
  const phone = body.phone || (orderId && orders.get(orderId) && orders.get(orderId).phone);

  if (event === 'payment.captured' && orderId && phone) {
    const order = orders.get(orderId);
    if (!order) return res.status(404).json({ status: 'error', reason: 'order_not_found' });
    if (order.status === 'captured') return res.json({ status: 'ok', reason: 'already_processed' });

    // Credit user's account
    creditsService.addCredits(phone, order.credits);
    order.status = 'captured';
    order.providerPaymentId = body.providerPaymentId || uuidv4();
    order.updatedAt = new Date().toISOString();
    orders.set(orderId, order);

    console.log(`Webhook: credited ${order.credits} to ${phone}`);
    return res.json({ status: 'ok' });
  }

  console.log('Webhook received unknown event', body);
  return res.json({ status: 'ignored' });
});

module.exports = router;