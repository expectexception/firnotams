import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import apiRouter from './routes';
import { connectDB } from './db';
import { startAutoSync } from './autoSync';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Connect to MongoDB
connectDB();
startAutoSync();

// Middleware
app.use(cors({
    origin: '*', // Allow all origins for network testing
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
}));
app.use(express.json());

// Routes
app.use('/api', apiRouter);

// Root
app.get('/', (_req, res) => {
    res.json({
        name: 'NOTAM Situational Awareness API',
        version: '1.0.0',
        endpoints: [
            'GET /api/notams/bulk?locations=OMAA,OMDB,...',
            'GET /api/notams/bulk?locations=OMAA,OMDB&forceRefresh=true',
            'GET /api/firs/bulk?locations=OMAE,OSTT,...',
            'GET /api/firs/bulk?locations=OMAE,OSTT&forceRefresh=true',
            'GET /api/notams/cache/bulk?locations=OMAA,OMDB',
            'GET /api/health',
            'GET /api/sync/status',
        ],
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ NOTAM API server running on http://localhost:${PORT} and network interfaces`);
    console.log(`   Endpoints:`);
    console.log(`   - GET /api/notams/bulk?locations=OMAA,OMDB,...`);
    console.log(`   - GET /api/notams/bulk?locations=OMAA,OMDB&forceRefresh=true`);
    console.log(`   - GET /api/firs/bulk?locations=OMAE,OSTT,...`);
    console.log(`   - GET /api/firs/bulk?locations=OMAE,OSTT&forceRefresh=true`);
    console.log(`   - GET /api/notams/cache/bulk?locations=OMAA,OMDB`);
    console.log(`   - GET /api/health`);
    console.log(`   - GET /api/sync/status`);
});

export default app;
