"use strict";
/**
 * api/lib/neon.js
 * Lazy-initialized Neon serverless SQL client.
 *
 * Usage:
 *   const { getSql } = require('./neon');
 *   const sql = getSql();
 *   const rows = await sql`SELECT * FROM production_sheets`;
 */

const { neon } = require("@neondatabase/serverless");

let _sqlClient = null;

/**
 * Returns a memoised Neon SQL tagged-template function.
 * Throws clearly if DATABASE_URL is not configured.
 */
function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "[neon] DATABASE_URL environment variable is missing. " +
      "Add it to your Vercel project settings and to .env.local for local dev."
    );
  }

  if (!_sqlClient) {
    _sqlClient = neon(process.env.DATABASE_URL);
  }

  return _sqlClient;
}

/**
 * Lightweight connectivity check for a health-check endpoint.
 */
async function ping() {
  const sql = getSql();
  await sql`SELECT 1`;
  return true;
}

module.exports = { getSql, ping };
