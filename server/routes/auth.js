const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../database/connection');

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const [existingUsers] = await pool.execute(
            'SELECT id FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password_hash, status) VALUES (?, ?, ?, ?)',
            [username, email, passwordHash, 'offline']
        );

        const token = jwt.sign(
            { userId: result.insertId, username },
            process.env.JWT_SECRET || 'default_secret',
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: {
                id: result.insertId,
                username,
                email
            }
        });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const [users] = await pool.execute(
            'SELECT id, username, email, password_hash, status FROM users WHERE email = ? OR username = ?',
            [email, email]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        await pool.execute(
            'UPDATE users SET status = ? WHERE id = ?',
            ['online', user.id]
        );

        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET || 'default_secret',
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
                
                await pool.execute(
                    'UPDATE users SET status = ? WHERE id = ?',
                    ['offline', decoded.userId]
                );
            } catch (jwtError) {

            }
        }

        res.json({ message: 'Logout successful' });
    } catch (error) {
        res.json({ message: 'Logout successful' }); // Still return success even if token is invalid
    }
});

module.exports = router;
