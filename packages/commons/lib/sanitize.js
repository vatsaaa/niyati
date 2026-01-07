/**
 * Shared sanitization utility for redacting sensitive information from logs and API responses.
 * 
 * This module provides a centralized function to sanitize objects by redacting:
 * - Sensitive keys (phone numbers, emails, API keys, passwords, etc.)
 * - Email addresses and long numeric strings
 * - JWT tokens and Base64-encoded data
 * - Authentication headers
 * 
 * @module sanitize
 */

/**
 * Sanitizes an object by redacting sensitive information.
 * 
 * This function recursively traverses the input object and redacts values that match
 * sensitive patterns. It handles:
 * - Key-based redaction: Keys matching common sensitive patterns (phone, email, password, etc.)
 * - Value-based redaction: Values that look like emails, tokens, long numbers, etc.
 * - Header-specific redaction: Authorization and API key headers
 * 
 * @param {*} obj - The object to sanitize. Can be any type; non-objects are returned as-is.
 * @returns {*} A deep clone of the input with sensitive data redacted as '[REDACTED]'
 * 
 * @example
 * const data = {
 *   user: { name: 'John', email: 'john@example.com', phone: '1234567890' },
 *   headers: { authorization: 'Bearer token123' }
 * };
 * const clean = sanitize(data);
 * // { user: { name: 'John', email: '[REDACTED]', phone: '[REDACTED]' },
 * //   headers: { authorization: '[REDACTED]' } }
 */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  // Protect against prototype pollution
  if (Object.prototype.toString.call(obj) !== '[object Object]' && !Array.isArray(obj)) {
    return obj;
  }
  
  try {
    // Create a safe clone that prevents prototype pollution
    const clone = JSON.parse(JSON.stringify(obj));
    
    // Track seen objects to detect circular references
    const seen = new WeakSet();
    
    // Patterns for sensitive key names
    const SENSITIVE_RE = /(?:phone|phonenumber|email|ssn|passport|aadhar|nationalid|api[_-]?key|apikey|token|access[_-]?token|authorization|auth|password|card|cvv|creditcard|bank[_-]?account|account[_-]?number|routing[_-]?number|id(_)?number|\baddress\b|street|zip|zipcode)/i;
    
    // Patterns for sensitive values (JWT tokens, long numbers, Base64)
    const VALUE_SENSITIVE_RE = /^(?:\d{12,19}|[A-Za-z0-9-_]{30,}|[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)$/;
    const BASE64_RE = /^[A-Za-z0-9+/=]{40,}$/;
    
    /**
     * Recursively redacts sensitive data in an object
     * @param {Object} o - Object to redact
     * @param {number} depth - Current recursion depth (prevents infinite loops)
     */
    const redact = (o, depth = 0) => {
      if (!o || typeof o !== 'object' || depth > 12) return;
      
      // Circular reference detection
      if (seen.has(o)) return;
      seen.add(o);
      
      // Handle arrays
      if (Array.isArray(o)) {
        for (let i = 0; i < o.length; i++) {
          const v = o[i];
          if (typeof v === 'object') {
            redact(v, depth + 1);
          } else if (typeof v === 'string') {
            if (v.includes('@') || /^\d{8,}$/.test(v) || VALUE_SENSITIVE_RE.test(v) || BASE64_RE.test(v)) {
              o[i] = '[REDACTED]';
            }
          }
        }
        return;
      }
      
      // Handle objects
      for (const k of Object.keys(o)) {
        // Protect against prototype pollution
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
          delete o[k];
          continue;
        }
        
        try {
          const lk = k.toString().toLowerCase();
          const v = o[k];
          
          // Redact by key name
          if (SENSITIVE_RE.test(lk)) {
            o[k] = '[REDACTED]';
            continue;
          }
          
          // Special handling for headers object
          if (lk === 'headers' && v && typeof v === 'object') {
            if (v.authorization) v.authorization = '[REDACTED]';
            if (v['x-api-key']) v['x-api-key'] = '[REDACTED]';
            if (v.api_key) v.api_key = '[REDACTED]';
            redact(v, depth + 1);
            continue;
          }
          
          // Redact string values
          if (typeof v === 'string') {
            // Email addresses
            if (v.includes('@')) {
              o[k] = '[REDACTED]';
              continue;
            }
            // Long numeric strings (card numbers, account numbers, etc.)
            if (/^\d{8,}$/.test(v)) {
              o[k] = '[REDACTED]';
              continue;
            }
            // JWT tokens, long tokens, Base64
            if (VALUE_SENSITIVE_RE.test(v) || BASE64_RE.test(v)) {
              o[k] = '[REDACTED]';
              continue;
            }
            // Auth-related keys
            if (lk === 'authorization' || lk === 'auth' || lk === 'token' || 
                lk.includes('api_key') || lk.includes('apikey')) {
              o[k] = '[REDACTED]';
              continue;
            }
          } else if (typeof v === 'object') {
            redact(v, depth + 1);
          }
        } catch (e) {
          // Ignore errors while redacting specific keys
        }
      }
    };
    
    redact(clone);
    return clone;
  } catch (e) {
    // If sanitization fails, return original object
    return obj;
  }
}

module.exports = { sanitize };
