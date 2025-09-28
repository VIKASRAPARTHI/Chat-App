const express = require('express');
const { pool } = require('../../database/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const [conversations] = await pool.execute(`
            SELECT 
                c.id,
                c.name,
                c.type,
                c.created_at,
                (
                    SELECT content 
                    FROM messages 
                    WHERE conversation_id = c.id 
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) as last_message,
                (
                    SELECT created_at 
                    FROM messages 
                    WHERE conversation_id = c.id 
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) as last_message_time,
                (
                    SELECT COUNT(*) 
                    FROM conversation_participants 
                    WHERE conversation_id = c.id
                ) as participant_count,
                c.type as conversation_type,
                (
                    SELECT u.username 
                    FROM conversation_participants cp2 
                    JOIN users u ON cp2.user_id = u.id 
                    WHERE cp2.conversation_id = c.id AND cp2.user_id != ? AND c.type = 'direct'
                    LIMIT 1
                ) as other_username
            FROM conversations c
            JOIN conversation_participants cp ON c.id = cp.conversation_id
            WHERE cp.user_id = ?
            ORDER BY COALESCE(last_message_time, c.created_at) DESC
        `, [req.user.userId, req.user.userId]);

        res.json({ conversations });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/online', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute(`
            SELECT id, username, status, updated_at as last_seen 
            FROM users 
            WHERE status = 'online' AND id != ?
            ORDER BY username ASC
        `, [req.user.userId]);

        res.json({ users });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute(`
            SELECT id, username, status, created_at, updated_at as last_seen 
            FROM users 
            WHERE id != ?
            ORDER BY 
                CASE WHEN status = 'online' THEN 0 ELSE 1 END,
                username ASC
        `, [req.user.userId]);

        res.json({ users });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/all', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute(`
            SELECT id, username, status, created_at, updated_at as last_seen 
            FROM users 
            ORDER BY 
                CASE WHEN status = 'online' THEN 0 ELSE 1 END,
                username ASC
        `);

        res.json({ users });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT id, username, email, status, created_at FROM users WHERE id = ?',
            [req.user.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: users[0] });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
