// lib/sqlite.ts

import Database from "better-sqlite3";

const db = new Database("data/app.db");

export default db;