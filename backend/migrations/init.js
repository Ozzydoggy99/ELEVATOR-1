const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function migrate() {
    try {
        // Create users table
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL
            );
        `);

        // Create robots table
        await db.query(`
            CREATE TABLE IF NOT EXISTS robots (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                public_ip VARCHAR(45),
                private_ip VARCHAR(45),
                serial_number VARCHAR(255) UNIQUE NOT NULL,
                secret_key VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'offline',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create templates table
        await db.query(`
            CREATE TABLE IF NOT EXISTS templates (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                color VARCHAR(50) NOT NULL,
                robot JSONB,
                boss_user JSONB,
                stationary BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create maps table (without foreign key constraint for now)
        await db.query(`
            CREATE TABLE IF NOT EXISTS maps (
                id SERIAL PRIMARY KEY,
                robot_serial_number VARCHAR(255) NOT NULL,
                map_name VARCHAR(255) NOT NULL,
                features JSONB NOT NULL,
                uid VARCHAR(255),
                create_time TIMESTAMP,
                map_version VARCHAR(255),
                overlays_version VARCHAR(255),
                thumbnail_url TEXT,
                image_url TEXT,
                url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(robot_serial_number, map_name)
            );
        `);

        // Create task_queue table (without foreign key constraints for now)
        await db.query(`
            CREATE TABLE IF NOT EXISTS task_queue (
                id SERIAL PRIMARY KEY,
                template_id INTEGER,
                robot_serial_number VARCHAR(255),
                type VARCHAR(50) NOT NULL,
                floor INTEGER,
                shelf_point VARCHAR(50),
                status VARCHAR(50) DEFAULT 'queued',
                enriched_data JSONB,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP
            );
        `);

        // Insert admin user
        await db.query(`
            INSERT INTO users (username, password, role)
            VALUES ('Ozzydog', 'Ozzydog', 'admin')
            ON CONFLICT (username) DO NOTHING;
        `);

        console.log('Migration completed successfully');

        // If there's an existing SQLite database, migrate the data
        const sqliteDbPath = path.join(__dirname, '..', 'robots.db');
        if (fs.existsSync(sqliteDbPath)) {
            console.log('Found existing SQLite database. Please run the data migration script.');
        }

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await db.pool.end();
    }
}

migrate(); 