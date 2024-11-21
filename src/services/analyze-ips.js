import geoip from 'geoip-lite';
import IPCIDR from 'ip-cidr';
import { Netmask } from 'netmask';

const CLOUD_PATTERNS = {
    'AWS': [
        '^3\\.', '^52\\.', '^54\\.', '^35\\.', '^18\\.',
        '^13\\.', '^100\\.', '^204\\.246\\.', '^99\\.84\\.'
    ],
    'Digital Ocean': [
        '^64\\.(?!130)', '^167\\.99\\.', '^137\\.184\\.',
        '^207\\.154\\.'
    ],
    'Google Cloud': [
        '^35\\.184\\.', '^34\\.', '^130\\.211\\.',
        '^172\\.217\\.', '^199\\.36\\.'
    ],
    'OVH': [
        '^51\\.', '^145\\.239\\.', '^137\\.74\\.',
        '^198\\.244\\.192\\.', '^188\\.165\\.'
    ],
    'Hetzner': [
        '^185\\.125\\.188\\.', '^148\\.251\\.',
        '^116\\.203\\.', '^159\\.69\\.', '^194\\.67\\.120\\.'
    ],
    'Linode': [
        '^172\\.104\\.', '^192\\.81\\.208\\.',
        '^139\\.162\\.', '^66\\.228\\.', '^66\\.175\\.208\\.'
    ],
    'Azure': [
        '^13\\.64\\.', '^20\\.38\\.', '^40\\.64\\.',
        '^65\\.52\\.', '^104\\.40\\.'
    ],
    'Vultr': [
        '^108\\.61\\.', '^45\\.32\\.', '^64\\.90\\.60\\.',
        '^66\\.42\\.48\\.', '^169\\.57\\.'
    ]
};

export class IPAnalyzer {
    constructor() {
        this.ips = new Set();
        this.geoData = new Map();
        this.providerPatterns = this.compilePatterns();
        this.countryStats = new Map();
        this.transactions = [];
        this.snapshots = [];
    }

    compilePatterns() {
        const patterns = {};
        for (const [provider, regexes] of Object.entries(CLOUD_PATTERNS)) {
            patterns[provider] = regexes.map(r => new RegExp(r));
        }
        return patterns;
    }

    detectProvider(ip) {
        for (const [provider, patterns] of Object.entries(this.providerPatterns)) {
            if (patterns.some(pattern => pattern.test(ip))) {
                if (provider === 'Digital Ocean' && ip.startsWith('64.130.')) {
                    continue;
                }
                return provider;
            }
        }
        return 'Other';
    }

    async analyze(data) {
        if (!data?.ips?.length) return;

        const providerCounts = {};
        const countryProviders = new Map();
        
        data.ips.forEach(ip => {
            this.ips.add(ip);
            const provider = this.detectProvider(ip);
            providerCounts[provider] = (providerCounts[provider] || 0) + 1;
            
            const geo = geoip.lookup(ip);
            if (geo) {
                const country = geo.country || 'Unknown';
                if (!countryProviders.has(country)) {
                    countryProviders.set(country, new Map());
                }
                
                const countryMap = countryProviders.get(country);
                countryMap.set(provider, (countryMap.get(provider) || 0) + 1);
                
                this.geoData.set(ip, {
                    ip,
                    country,
                    city: geo.city || 'Unknown',
                    ll: geo.ll,
                    provider,
                    org: geo.org || provider
                });
            }
        });

        this.countryStats = countryProviders;
        this.providerStats = Object.entries(providerCounts)
            .map(([provider, count]) => ({
                provider,
                count,
                percentage: (count / data.ips.length * 100).toFixed(1)
            }))
            .sort((a, b) => b.count - a.count);

        if (data.highValueTxs?.length) {
            this.transactions = data.highValueTxs
                .sort((a, b) => b.value - a.value)
                .slice(0, 10);
        }

        if (data.timestamp) {
            this.snapshots.push({
                count: data.ips.length,
                timestamp: data.timestamp
            });
            
            if (this.snapshots.length > 20) {
                this.snapshots.shift();
            }
        }
    }

    getAnalysisData() {
        const countryData = Array.from(this.countryStats.entries())
            .map(([country, providers]) => ({
                country,
                providers: Array.from(providers.entries())
                    .map(([provider, count]) => ({ provider, count }))
                    .sort((a, b) => b.count - a.count)
            }))
            .sort((a, b) => 
                b.providers.reduce((sum, p) => sum + p.count, 0) -
                a.providers.reduce((sum, p) => sum + p.count, 0)
            );

        return {
            totalIPs: this.ips.size,
            totalSnapshots: this.snapshots.length,
            highValueTxs: this.transactions,
            geoLocations: Array.from(this.geoData.values()),
            providerStats: this.providerStats,
            countryStats: countryData,
            trends: this.snapshots.map((s, i) => ({
                snapshot: i + 1,
                count: s.count,
                timestamp: s.timestamp
            }))
        };
    }
}