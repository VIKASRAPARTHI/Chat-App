const express = require('express');
const { pool } = require('../../database/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/create', authenticateToken, async (req, res) => {
    try {
        const { type, name, participants } = req.body;
        const createdBy = req.user.userId;


        if (!type || !participants || !Array.isArray(participants)) {
            return res.status(400).json({ error: 'Invalid conversation data' });
        }

        if (type === 'direct' && participants.length === 1) {
            const otherUserId = participants[0];
            const [existing] = await pool.execute(`
                SELECT c.id 
                FROM conversations c
                JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
                JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
                WHERE c.type = 'direct' 
                AND cp1.user_id = ? 
                AND cp2.user_id = ?
                AND (
                    SELECT COUNT(*) 
                    FROM conversation_participants 
                    WHERE conversation_id = c.id
                ) = 2
            `, [createdBy, otherUserId]);

            if (existing.length > 0) {

                return res.json({ 
                    conversationId: existing[0].id,
                    message: 'Conversation already exists'
                });
            }
        }

        const [result] = await pool.execute(
            'INSERT INTO conversations (name, type, created_by) VALUES (?, ?, ?)',
            [name || null, type, createdBy]
        );

        const conversationId = result.insertId;


        await pool.execute(
            'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
            [conversationId, createdBy]
        );

        for (const participantId of participants) {
            if (participantId !== createdBy) {
                await pool.execute(
                    'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
                    [conversationId, participantId]
                );
            }
        }


        res.status(201).json({
            conversationId,
            message: 'Conversation created successfully'
        });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:id/messages', authenticateToken, async (req, res) => {
    try {
        const conversationId = req.params.id;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const [participants] = await pool.execute(
            'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, req.user.userId]
        );

        if (participants.length === 0) {
            return res.status(403).json({ error: 'Not a participant in this conversation' });
        }

        const [messages] = await pool.execute(`
            SELECT 
                m.id,
                m.content,
                m.message_type,
                m.sent_at as created_at,
                m.edited_at,
                u.username as sender_username,
                u.id as sender_id,
                m.conversation_id
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.conversation_id = ? AND m.is_deleted = false
            ORDER BY m.sent_at DESC
            LIMIT ? OFFSET ?
        `, [conversationId, limit, offset]);

        res.json({ messages: messages.reverse() });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const conversationId = req.params.id;

        const [participants] = await pool.execute(
            'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, req.user.userId]
        );

        if (participants.length === 0) {
            return res.status(403).json({ error: 'Not a participant in this conversation' });
        }

        const [conversations] = await pool.execute(`
            SELECT 
                c.id,
                c.name,
                c.type,
                c.created_at,
                c.created_by,
                u.username as created_by_username
            FROM conversations c
            JOIN users u ON c.created_by = u.id
            WHERE c.id = ?
        `, [conversationId]);

        if (conversations.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const conversation = conversations[0];

        const [allParticipants] = await pool.execute(`
            SELECT 
                u.id,
                u.username,
                u.email,
                cp.joined_at
            FROM conversation_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.conversation_id = ?
        `, [conversationId]);

        conversation.participants = allParticipants;

        res.json({ conversation });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const conversationId = req.params.id;

        const [conversations] = await pool.execute(`
            SELECT c.type, c.created_by 
            FROM conversations c
            JOIN conversation_participants cp ON c.id = cp.conversation_id
            WHERE c.id = ? AND cp.user_id = ?
        `, [conversationId, req.user.userId]);

        if (conversations.length === 0) {
            return res.status(404).json({ error: 'Conversation not found or access denied' });
        }

        const conversation = conversations[0];

        if (conversation.type !== 'group') {
            return res.status(400).json({ error: 'Only group conversations can be deleted' });
        }

        if (conversation.created_by !== req.user.userId) {
            return res.status(403).json({ error: 'Only the group creator can delete the group' });
        }

        await pool.execute('DELETE FROM message_status WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?)', [conversationId]);
        await pool.execute('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
        await pool.execute('DELETE FROM conversation_participants WHERE conversation_id = ?', [conversationId]);
        await pool.execute('DELETE FROM conversations WHERE id = ?', [conversationId]);

        res.json({ message: 'Group deleted successfully' });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/:id/leave', authenticateToken, async (req, res) => {
    try {
        const conversationId = req.params.id;

        const [participants] = await pool.execute(`
            SELECT c.type, c.created_by 
            FROM conversations c
            JOIN conversation_participants cp ON c.id = cp.conversation_id
            WHERE c.id = ? AND cp.user_id = ?
        `, [conversationId, req.user.userId]);

        if (participants.length === 0) {
            return res.status(404).json({ error: 'Conversation not found or you are not a participant' });
        }

        const conversation = participants[0];

        if (conversation.type !== 'group') {
            return res.status(400).json({ error: 'You can only leave group conversations' });
        }

        if (conversation.created_by === req.user.userId) {
            return res.status(400).json({ error: 'Group creator cannot leave. Delete the group instead.' });
        }

        await pool.execute('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [conversationId, req.user.userId]);

        res.json({ message: 'Left group successfully' });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
