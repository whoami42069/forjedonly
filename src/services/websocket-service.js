import { WebSocketServer } from 'ws';
import { readFile } from 'fs/promises';
import { IPAnalyzer } from './analyze-ips.js';

export class WebSocketService {
    constructor(server) {
        this.wss = new WebSocketServer({ server });
        this.analyzer = new IPAnalyzer();
        this.setupWebSocket();
    }

    setupWebSocket() {
        this.wss.on('connection', async (ws) => {
            console.log('Client connected');
            await this.sendInitialData(ws);
            
            ws.on('close', () => {
                console.log('Client disconnected');
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });
        });
    }

    async sendInitialData(ws) {
        try {
            const data = await this.readDataFile();
            if (data) {
                await this.analyzer.analyze(data);
                this.sendAnalysis(ws);
            }
        } catch (error) {
            console.error('Error sending initial data:', error);
        }
    }

    async readDataFile() {
        try {
            const data = await readFile('data/solana_data.json', 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading data file:', error);
            return null;
        }
    }

    async broadcastUpdate() {
        const data = await this.readDataFile();
        if (data) {
            await this.analyzer.analyze(data);
            this.wss.clients.forEach(client => {
                if (client.readyState === client.OPEN) {
                    this.sendAnalysis(client);
                }
            });
        }
    }

    sendAnalysis(ws) {
        const analysis = this.analyzer.getAnalysisData();
        ws.send(JSON.stringify(analysis));
    }
}