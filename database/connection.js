const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 25060,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
        ca: undefined, // Aiven handles CA certificates automatically
    },
    charset: 'utf8mb4',
    timezone: '+00:00',
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true
};

const pool = mysql.createPool(dbConfig);

async function testConnection() {
    try {
        const connection = await pool.getConnection();
        
        const [rows] = await connection.execute('SELECT 1 as test');
        
        connection.release();
        return true;
    } catch (error) {
        
        return false;
    }
}

async function initializeDatabase() {
    try {

        const connection = await pool.getConnection();
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                status ENUM('online', 'offline', 'away') DEFAULT 'offline',
                avatar_url VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_username (username),
                INDEX idx_email (email),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS conversations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) DEFAULT NULL,
                type ENUM('direct', 'group') DEFAULT 'direct',
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_type (type),
                INDEX idx_created_by (created_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS conversation_participants (
                id INT AUTO_INCREMENT PRIMARY KEY,
                conversation_id INT NOT NULL,
                user_id INT NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_participant (conversation_id, user_id),
                INDEX idx_conversation (conversation_id),
                INDEX idx_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                conversation_id INT NOT NULL,
                sender_id INT NOT NULL,
                content TEXT NOT NULL,
                message_type ENUM('text', 'image', 'document') DEFAULT 'text',
                file_data LONGTEXT NULL,
                file_name VARCHAR(255) NULL,
                file_size INT NULL,
                file_type VARCHAR(100) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_conversation (conversation_id),
                INDEX idx_sender (sender_id),
                INDEX idx_created_at (created_at),
                INDEX idx_conversation_time (conversation_id, created_at),
                INDEX idx_message_type (message_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS message_status (
                id INT AUTO_INCREMENT PRIMARY KEY,
                message_id INT NOT NULL,
                user_id INT NOT NULL,
                status ENUM('sent', 'delivered', 'read') DEFAULT 'sent',
                status_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_status (message_id, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        try {
            await connection.execute(`
                ALTER TABLE messages 
                ADD COLUMN file_data LONGTEXT NULL,
                ADD COLUMN file_name VARCHAR(255) NULL,
                ADD COLUMN file_size INT NULL,
                ADD COLUMN file_type VARCHAR(100) NULL,
                ADD INDEX idx_message_type (message_type)
            `);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') {

            }
        }

        try {
            await connection.execute(`
                ALTER TABLE messages 
                MODIFY COLUMN message_type ENUM('text', 'image', 'document') DEFAULT 'text'
            `);
        } catch (error) {

        }
        
        connection.release();
        return true;
    } catch (error) {
        throw error;
    }
}

async function closePool() {
    try {
        await pool.end();
    } catch (error) {
    }
}

process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);

module.exports = {
    pool,
    testConnection,
    initializeDatabase,
    closePool
};
