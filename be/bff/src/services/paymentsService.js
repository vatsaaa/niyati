// Minimal payments helper (wraps in-memory orders)
const orders = new Map();

function saveOrder(order) {
  orders.set(order.id, order);
}

function getOrder(id) {
  return orders.get(id);
}

module.exports = { saveOrder, getOrder };
