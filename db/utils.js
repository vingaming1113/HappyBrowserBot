import { Database } from 'bun:sqlite';

export function initDB() {
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
}

export async function loadFromDB(table, userId, defaultValue = {}) {
    const db = new Database('discord_bot.db');
    const query = db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`);
    const row = query.get(userId);
    return row ? JSON.parse(row.history || row.filesystem) : defaultValue;
}

export async function saveToDB(table, userId, data) {
    const db = new Database('discord_bot.db');
    const query = db.prepare(`
        INSERT INTO ${table} (user_id, ${table === 'user_histories' ? 'history' : 'filesystem'})
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET ${table === 'user_histories' ? 'history' : 'filesystem'} = excluded.${table === 'user_histories' ? 'history' : 'filesystem'}
    `);
    query.run(userId, JSON.stringify(data));
}