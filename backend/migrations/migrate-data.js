const sqlite3 = require('sqlite3').verbose();
const db = require('../config/database');
const path = require('path');

async function migrateData() {
    const sqliteDbPath = path.join(__dirname, '..', 'robots.db');
    const sqliteDb = new sqlite3.Database(sqliteDbPath);

    try {
        // Check if the robots table exists in SQLite
        const tableExists = await new Promise((resolve, reject) => {
            sqliteDb.get(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='robots'",
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });

        if (!tableExists) {
            console.log('Robots table does not exist in SQLite database. Creating table and sample data...');
            
            // Create the robots table in SQLite
            await new Promise((resolve, reject) => {
                sqliteDb.run(`
                    CREATE TABLE robots (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        publicIP TEXT,
                        privateIP TEXT,
                        serialNumber TEXT UNIQUE NOT NULL,
                        secretKey TEXT NOT NULL
                    )
                `, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Insert sample robot data
            await new Promise((resolve, reject) => {
                sqliteDb.run(`
                    INSERT INTO robots (name, publicIP, privateIP, serialNumber, secretKey)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    'Victorville Service Elevator',
                    '192.168.1.95',
                    '192.168.1.95',
                    'Victorville1',
                    'sample-secret-key-123'
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log('Sample robot data created in SQLite database.');
        }

        // Get all robots from SQLite
        const robots = await new Promise((resolve, reject) => {
            sqliteDb.all('SELECT * FROM robots', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log(`Found ${robots.length} robots to migrate`);

        if (robots.length === 0) {
            console.log('No robots found to migrate. Migration completed.');
            return;
        }

        // Insert each robot into PostgreSQL
        for (const robot of robots) {
            await db.query(
                `INSERT INTO robots (name, public_ip, private_ip, serial_number, secret_key)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (serial_number) DO NOTHING`,
                [robot.name, robot.publicIP, robot.privateIP, robot.serialNumber, robot.secretKey]
            );
        }

        console.log('Data migration completed successfully');

    } catch (err) {
        console.error('Data migration failed:', err);
    } finally {
        sqliteDb.close();
        await db.pool.end();
    }
}

migrateData(); 