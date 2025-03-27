import { Database } from 'bun:sqlite';

const db = new Database('discord_bot.db');

db.run(`
  CREATE TABLE IF NOT EXISTS user_histories (
    user_id TEXT PRIMARY KEY,
    history TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_filesystems (
    user_id TEXT PRIMARY KEY,
    filesystem TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_network_configs (
    user_id TEXT PRIMARY KEY,
    config TEXT
  )
`);

console.log("Database initialized successfully.");