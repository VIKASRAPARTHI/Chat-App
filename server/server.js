const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { testConnection, initializeDatabase } = require('../database/connection');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const socketHandler = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

const corsOptions = {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
};

const io = socketIo(server, {
    cors: corsOptions
});

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', require('./routes/conversations'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

socketHandler(io);

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        const dbConnected = await testConnection();
        
        if (dbConnected) {
            await initializeDatabase();
        }
        
        server.listen(PORT, () => {

        });
    } catch (error) {
        process.exit(1);
    }
}

startServer();
