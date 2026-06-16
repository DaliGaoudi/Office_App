const db = require('../db');

/**
 * Logs an activity to the audit_logs table.
 * @param {Object} user - The user object from req.user (needs id, username)
 * @param {String} action - CREATE, UPDATE, DELETE, VIEW, PRINT, etc.
 * @param {String} entity - RECORD, ACTION, EVENT, USER, BILL, etc.
 * @param {String} details - Human-readable description
 */
async function logActivity(user, action, entity, details) {
  if (!user || !user.id) return; // Silent fail if no user (e.g. unauthenticated somehow)
  
  // Explicit RETURNING id keeps db.run from auto-appending its generic
  // "RETURNING id_r, id_cn, ..." clause, whose columns don't exist on
  // audit_logs and would make every insert fail silently.
  const query = `
    INSERT INTO audit_logs (user_id, username, action, entity, details)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `;
  
  try {
    await db.run(query, [user.id, user.username, action, entity, details]);
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
}

module.exports = { logActivity };
