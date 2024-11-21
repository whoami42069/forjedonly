import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

const DATA_DIR = './data';
const DATA_FILE = './data/solana_data.json';

async function setup() {
    try {
        // Create data directory
        await mkdir(DATA_DIR, { recursive: true });
        
        // Create initial data file with empty but valid structure
        const initialData = {
            ips: [],
            highValueTxs: [],
            timestamp: new Date().toISOString(),
            snapshotCount: 0,
            totalIPs: 0,
            trends: []
        };

        await writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('Initial setup completed successfully');
    } catch (error) {
        console.error('Setup error:', error);
        process.exit(1);
    }
}

setup();