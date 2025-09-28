const jwt = require('jsonwebtoken');
const { pool } = require('../../database/connection');

function socketHandler(io) {
    io.on('connection', (socket) => {


        socket.on('authenticate', async (token) => {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
                socket.userId = decoded.userId;
                socket.username = decoded.username;

                const [conversations] = await pool.execute(`
                    SELECT conversation_id FROM conversation_participants WHERE user_id = ?
                `, [decoded.userId]);

                conversations.forEach(conv => {
                    socket.join(`conversation_${conv.conversation_id}`);
                });

                await pool.execute(
                    'UPDATE users SET status = ? WHERE id = ?',
                    ['online', decoded.userId]
                );

                socket.emit('authenticated', { 
                    userId: decoded.userId, 
                    username: decoded.username 
                });

                socket.broadcast.emit('user_online', {
                    userId: decoded.userId,
                    username: decoded.username
                });



            } catch (error) {
                socket.emit('auth_error', { error: 'Invalid token' });
            }
        });

        socket.on('join_conversation', (conversationId) => {
            socket.join(`conversation_${conversationId}`);

        });

        socket.on('leave_conversation', (conversationId) => {
            socket.leave(`conversation_${conversationId}`);

        });

        socket.on('send_message', async (data) => {
            try {
                const { 
                    conversation_id, 
                    conversationId, 
                    content, 
                    type = 'text',
                    messageType = 'text',
                    image_data,
                    file_data,
                    file_name,
                    file_size,
                    file_type
                } = data;

                const convId = conversation_id || conversationId;
                const msgType = type || messageType;

                if (!socket.userId) {
                    socket.emit('error', { error: 'Not authenticated' });
                    return;
                }

                const [participants] = await pool.execute(
                    'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
                    [convId, socket.userId]
                );

                if (participants.length === 0) {
                    socket.emit('error', { error: 'Access denied to this conversation' });
                    return;
                }

                const fileData = image_data || file_data || null;
                const fileName = file_name || null;
                const fileSize = file_size || null;
                const fileType = file_type || null;
                
                const [result] = await pool.execute(
                    'INSERT INTO messages (conversation_id, sender_id, content, message_type, file_data, file_name, file_size, file_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [convId, socket.userId, content, msgType, fileData, fileName, fileSize, fileType]
                );

                const [messageData] = await pool.execute(`
                    SELECT 
                        m.id,
                        m.conversation_id,
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
                    WHERE m.id = ?
                `, [result.insertId]);

                const message = messageData[0];
                if (message.type === 'image' && message.file_data) {
                    message.image_data = message.file_data;
                }

                io.to(`conversation_${convId}`).emit('new_message', message);



            } catch (error) {
                socket.emit('error', { error: 'Failed to send message' });
            }
        });

        socket.on('typing_start', (conversationId) => {
            socket.to(`conversation_${conversationId}`).emit('user_typing', {
                userId: socket.userId,
                username: socket.username,
                conversationId
            });
        });

        socket.on('typing_stop', (conversationId) => {
            socket.to(`conversation_${conversationId}`).emit('user_stopped_typing', {
                userId: socket.userId,
                username: socket.username,
                conversationId
            });
        });

        socket.on('disconnect', async () => {
            if (socket.userId) {
                try {
                    await pool.execute(
                        'UPDATE users SET status = ? WHERE id = ?',
                        ['offline', socket.userId]
                    );

                    socket.broadcast.emit('user_offline', {
                        userId: socket.userId,
                        username: socket.username
                    });

                } catch (error) {
                }
            }
        });
    });
}

module.exports = socketHandler;
