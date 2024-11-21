import express from 'express';
import { createServer } from 'http';
import compression from 'compression';
import cors from 'cors';
import { WebSocketService } from './src/services/websocket-service.js';
import { DataCollector } from './src/services/data-collector.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(compression());
app.use(cors());
app.use(express.static('public'));

const server = createServer(app);
const wsService = new WebSocketService(server);

// Initialize data collector
const HELIUS_RPC = "https://rpc.helius.xyz/?api-key=76fa63b2-c60a-45a1-b382-14cf433acd47";
const collector = new DataCollector(HELIUS_RPC);

// Listen for data updates and broadcast to all clients
collector.on('dataCollected', async () => {
    await wsService.broadcastUpdate();
});

// Start data collection
collector.start();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});