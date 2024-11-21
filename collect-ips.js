import { Connection } from '@solana/web3.js';
import { writeFile } from 'fs/promises';

const HELIUS_RPC = "https://rpc.helius.xyz/?api-key=76fa63b2-c60a-45a1-b382-14cf433acd47";
const DURATION_MS = 600 * 60 * 1000; // 600 minutes
const INTERVAL_MS = 30000; // 30 seconds
const SOL_THRESHOLD = 100; // 100 SOL threshold

async function getActiveNodes(connection) {
    try {
        const nodes = await connection.getClusterNodes();
        const uniqueIps = new Set();
        
        for (const node of nodes) {
            if (node.gossip) {
                const ip = node.gossip.split(':')[0];
                if (!ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('172.')) {
                    uniqueIps.add(ip);
                }
            }
        }
        return Array.from(uniqueIps);
    } catch (error) {
        console.error('Error getting nodes:', error);
        return [];
    }
}

async function getLatestBlocks(connection) {
    try {
        const slot = await connection.getSlot();
        const allHighValueTxs = [];
        
        for (let i = 0; i < 10; i++) {
            try {
                const block = await connection.getBlock(slot - i, {
                    maxSupportedTransactionVersion: 0,
                    commitment: 'confirmed'
                });
                
                if (block && block.transactions) {
                    const highValueTxs = block.transactions
                        .filter(tx => {
                            const postBalances = tx.meta?.postBalances || [];
                            const preBalances = tx.meta?.preBalances || [];
                            return postBalances.some((post, idx) => {
                                const pre = preBalances[idx] || 0;
                                return Math.abs(post - pre) >= SOL_THRESHOLD * 1000000000;
                            });
                        })
                        .slice(0, 10);

                    if (highValueTxs.length > 0) {
                        const blockTxs = highValueTxs.map(tx => ({
                            signature: tx.transaction.signatures[0],
                            value: Math.abs(tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1000000000,
                            timestamp: new Date().toISOString(),
                            block: slot - i
                        }));
                        allHighValueTxs.push(...blockTxs);
                    }
                }
            } catch (error) {
                console.error(`Error fetching block ${slot - i}:`, error);
            }
        }

        return allHighValueTxs.sort((a, b) => b.value - a.value).slice(0, 10);
    } catch (error) {
        console.error('Error getting latest blocks:', error);
        return [];
    }
}

async function saveData(data) {
    try {
        await writeFile('solana_data.json', JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving data:', error);
        return false;
    }
}

async function main() {
    console.log('Starting Solana Node IP and High-Value Transaction collection...');
    
    const connection = new Connection(HELIUS_RPC);
    const startTime = Date.now();
    let snapshotCount = 1;
    let allIPs = new Set();
    
    while (Date.now() - startTime < DURATION_MS) {
        console.log(`\nSnapshot ${snapshotCount} - Time elapsed: ${((Date.now() - startTime) / 1000).toFixed(3)}s`);
        
        try {
            const [ips, transactions] = await Promise.all([
                getActiveNodes(connection),
                getLatestBlocks(connection)
            ]);
            
            ips.forEach(ip => allIPs.add(ip));
            
            const data = {
                timestamp: new Date().toISOString(),
                ips,
                snapshotCount,
                totalIPs: allIPs.size,
                totalSnapshots: snapshotCount,
                highValueTxs: transactions,
                trends: [{ snapshot: snapshotCount, count: ips.length }]
            };
            
            const saved = await saveData(data);
            if (saved) {
                console.log(`Found ${ips.length} unique IPs`);
                console.log(`Found ${transactions.length} high-value transactions (>${SOL_THRESHOLD} SOL)`);
            }
        } catch (error) {
            console.error('Error in snapshot:', error);
        }
        
        await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
        snapshotCount++;
    }
}

main().catch(console.error);