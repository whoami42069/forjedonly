import { Connection } from '@solana/web3.js';
import { writeFile, readFile } from 'fs/promises';
import { EventEmitter } from 'events';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export class DataCollector extends EventEmitter {
    constructor(rpcUrl, updateInterval = 30000) {
        super();
        this.connection = new Connection(rpcUrl);
        this.updateInterval = updateInterval;
        this.isRunning = false;
        this.dataPath = './data/solana_data.json';
        this.ensureDataDirectory();
        this.retryAttempts = 3;
        this.retryDelay = 1000;
    }

    async ensureDataDirectory() {
        try {
            await mkdir(dirname(this.dataPath), { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                console.error('Error creating data directory:', error);
            }
        }
    }

    async getData() {
        try {
            const data = await readFile(this.dataPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading data:', error);
            return null;
        }
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        await this.collect();
    }

    stop() {
        this.isRunning = false;
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
    }

    async collect() {
        if (!this.isRunning) return;

        try {
            const [nodes, transactions] = await Promise.all([
                this.getNodes(),
                this.getHighValueTransactionsWithRetry()
            ]);

            const data = {
                timestamp: new Date().toISOString(),
                ips: nodes,
                highValueTxs: transactions
            };

            await this.saveData(data);
            this.emit('dataCollected', data);
        } catch (error) {
            console.error('Error collecting data:', error);
        }

        this.timeout = setTimeout(() => this.collect(), this.updateInterval);
    }

    async getNodes() {
        const nodes = await this.connection.getClusterNodes();
        const uniqueIps = new Set();
        
        nodes.forEach(node => {
            if (node.gossip) {
                const ip = node.gossip.split(':')[0];
                if (!this.isPrivateIP(ip)) {
                    uniqueIps.add(ip);
                }
            }
        });

        return Array.from(uniqueIps);
    }

    isPrivateIP(ip) {
        return ip.startsWith('10.') || 
               ip.startsWith('192.168.') || 
               ip.startsWith('172.');
    }

    async getHighValueTransactionsWithRetry(attempts = this.retryAttempts) {
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                const slot = await this.connection.getSlot();
                const transactions = [];
                let successfulBlocks = 0;

                for (let i = 0; successfulBlocks < 5 && i < 20; i++) {
                    try {
                        const block = await this.connection.getBlock(slot - i, {
                            maxSupportedTransactionVersion: 0
                        });

                        if (block?.transactions) {
                            successfulBlocks++;
                            const highValueTxs = block.transactions
                                .filter(tx => {
                                    const postBalances = tx.meta?.postBalances || [];
                                    const preBalances = tx.meta?.preBalances || [];
                                    return postBalances.some((post, idx) => {
                                        const pre = preBalances[idx] || 0;
                                        return Math.abs(post - pre) >= 100 * 1e9;
                                    });
                                })
                                .map(tx => ({
                                    signature: tx.transaction.signatures[0],
                                    block: slot - i,
                                    value: Math.abs(tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1e9,
                                    timestamp: new Date().toISOString()
                                }));

                            transactions.push(...highValueTxs);
                        }
                    } catch (blockError) {
                        if (!blockError.message.includes('skipped')) {
                            throw blockError;
                        }
                    }
                }

                return transactions.sort((a, b) => b.value - a.value).slice(0, 10);
            } catch (error) {
                if (attempt === attempts) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }
    }

    async saveData(data) {
        try {
            await writeFile(this.dataPath, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving data:', error);
            return false;
        }
    }
}