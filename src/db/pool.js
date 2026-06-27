require("dotenv").config();

// Pool = a manager for reusable postgres connections (from the 'pg' library)
const { Pool } = require("pg");

// creates ONE shared pool for the whole app, using the connection string
// why a pool and not a fresh connection per query: opening a connection
// (handshake + auth) is slow, and postgres caps total connections — so we
// open a small set once and reuse them, instead of paying that cost on
// every single query.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// IMPORTANT: without this listener, an idle connection dying unexpectedly
// (db restart, network blip) would crash the whole node process as an
// unhandled error. this just logs it — pool quietly replaces the dead
// connection next time it's needed.
pool.on("error", (err) => {
  console.error("Unexpected Postgres pool error:", err);
});

// export the SAME pool instance every time this file is required (node
// caches modules)
module.exports = pool;
