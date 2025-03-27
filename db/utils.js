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
    db.run(`
        CREATE TABLE IF NOT EXISTS user_network_configs (
            user_id TEXT PRIMARY KEY,
            config TEXT
        )
    `);
}

export async function loadFromDB(table, userId, defaultValue = {}) {
    const db = new Database('discord_bot.db');
    const query = db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`);
    const row = query.get(userId);
    
    if (!row) return defaultValue;
    
    // Handle different table columns
    if (table === 'user_histories') {
        return JSON.parse(row.history || '[]');
    } else if (table === 'user_filesystems') {
        return JSON.parse(row.filesystem || '{}');
    } else if (table === 'user_network_configs') {
        return JSON.parse(row.config || '{}');
    }
    
    return defaultValue;
}

export async function saveToDB(table, userId, data) {
    const db = new Database('discord_bot.db');
    let columnName, valueToSave;
    
    if (table === 'user_histories') {
        columnName = 'history';
    } else if (table === 'user_filesystems') {
        columnName = 'filesystem';
    } else if (table === 'user_network_configs') {
        columnName = 'config';
    } else {
        throw new Error(`Unknown table: ${table}`);
    }
    
    const query = db.prepare(`
        INSERT INTO ${table} (user_id, ${columnName})
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET ${columnName} = excluded.${columnName}
    `);
    
    query.run(userId, JSON.stringify(data));
}