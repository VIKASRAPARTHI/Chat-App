const express = require('express');
const { pool } = require('../../database/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/:conversationId', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 50;
        const offset = (pageNum - 1) * limitNum;

        const [participants] = await pool.execute(
            'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, req.user.userId]
        );

        if (participants.length === 0) {
            return res.status(403).json({ error: 'Access denied to this conversation' });
        }

        const [messages] = await pool.execute(`
            SELECT 
                m.id,
                m.content,
                m.message_type as type,
                m.file_data,
                m.file_name,
                m.file_size,
                m.file_type,
                m.created_at,
                u.username as sender_username,
                u.id as sender_id
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.conversation_id = ?
            ORDER BY m.created_at DESC
            LIMIT ${limitNum} OFFSET ${offset}
        `, [conversationId]);

        const processedMessages = messages.map(msg => {
            if (msg.type === 'image' && msg.file_data) {
                msg.image_data = msg.file_data;
            }
            return msg;
        }).reverse();

        res.json({
            messages: processedMessages,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: messages.length
            }
        });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', authenticateToken, async (req, res) => {
    try {
        const { 
            conversationId, 
            content, 
            messageType = 'text',
            type = 'text',
            file_data,
            image_data,
            file_name,
            file_size,
            file_type
        } = req.body;
        const senderId = req.user.userId;

        const msgType = type || messageType;
        const fileData = image_data || file_data;

        if (!conversationId || !content) {
            return res.status(400).json({ error: 'Conversation ID and content are required' });
        }

        const [participants] = await pool.execute(
            'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, senderId]
        );

        if (participants.length === 0) {
            return res.status(403).json({ error: 'Access denied to this conversation' });
        }

        const [result] = await pool.execute(`
            INSERT INTO messages (conversation_id, sender_id, content, message_type, file_data, file_name, file_size, file_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [conversationId, senderId, content, msgType, fileData, file_name, file_size, file_type]);

        const [newMessage] = await pool.execute(`
            SELECT 
                m.id,
                m.content,
                m.message_type as type,
                m.file_data,
                m.file_name,
                m.file_size,
                m.file_type,
                m.created_at,
                u.username as sender_username,
                u.id as sender_id,
                m.conversation_id
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.id = ?
        `, [result.insertId]);

        const message = newMessage[0];
        if (message.type === 'image' && message.file_data) {
            message.image_data = message.file_data;
        }

        res.status(201).json({
            message: newMessage[0]
        });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
