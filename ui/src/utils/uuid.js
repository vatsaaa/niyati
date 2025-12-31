/**
 * Creates a UUID v4.
 * @returns {string} The UUID.
 */
export function createUUIDv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Gets a session-level request ID, creating one if it doesn't exist.
 * @returns {string} The session request ID.
 */
export function getSessionReqId() {
  try {
    let id = localStorage.getItem('niyati_x_request_id');
    if (!id) {
      id = createUUIDv4();
      try {
        localStorage.setItem('niyati_x_request_id', id);
      } catch (e) {
        // ignore
      }
    }
    return id;
  } catch (e) {
    return createUUIDv4();
  }
}
