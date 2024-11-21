import geoip from 'geoip-lite';
import IPCIDR from 'ip-cidr';

export class IPAnalyzer {
    constructor() {
        this.ips = new Set();
        this.geoData = new Map();
        this.ispData = new Map();
        this.transactions = [];
        this.snapshots = [];
        this.countryISPs = new Map();
    }

    async analyze(data) {
        if (!data || !data.ips) {
            console.error('Invalid data format:', data);
            return;
        }

        // Process IPs
        data.ips.forEach(ip => {
            this.ips.add(ip);
            
            // Get geolocation data
            const geo = geoip.lookup(ip);
            if (geo) {
                this.geoData.set(ip, {
                    country: geo.country,
                    region: geo.region,
                    city: geo.city,
                    ll: geo.ll,
                    org: geo.org || 'Unknown'
                });
                
                // Update ISP data by country
                const country = geo.country || 'Unknown';
                const isp = geo.org || 'Unknown';
                
                if (!this.countryISPs.has(country)) {
                    this.countryISPs.set(country, new Map());
                }
                const countryMap = this.countryISPs.get(country);
                countryMap.set(isp, (countryMap.get(isp) || 0) + 1);
            }
        });

        // Update transactions
        if (data.highValueTxs) {
            this.transactions = data.highValueTxs;
        }

        // Update snapshots
        if (data.timestamp) {
            this.snapshots.push({
                count: data.ips.length,
                timestamp: data.timestamp
            });
        }
    }

    findIPPatterns() {
        const patterns = new Map();
        
        Array.from(this.ips).forEach(ip => {
            const parts = ip.split('.');
            const prefix = `${parts[0]}.${parts[1]}`;
            
            if (!patterns.has(prefix)) {
                patterns.set(prefix, { count: 0, ips: [] });
            }
            
            const pattern = patterns.get(prefix);
            pattern.count++;
            pattern.ips.push(ip);
        });

        return Array.from(patterns.entries())
            .map(([prefix, data]) => ({
                prefix,
                value: data.count,
                ips: data.ips
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }

    getISPsByCountry() {
        const result = {};
        for (const [country, isps] of this.countryISPs.entries()) {
            const sortedISPs = Array.from(isps.entries())
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .reduce((obj, [isp, count]) => {
                    obj[isp] = count;
                    return obj;
                }, {});
            
            if (Object.keys(sortedISPs).length > 0) {
                result[country] = sortedISPs;
            }
        }
        return result;
    }

    getAnalysisData() {
        return {
            totalIPs: this.ips.size,
            ips: Array.from(this.ips),
            totalSnapshots: this.snapshots.length,
            highValueTxs: this.transactions,
            geoDistribution: Object.fromEntries(
                Array.from(this.geoData.values())
                    .reduce((acc, data) => {
                        const country = data.country || 'Unknown';
                        acc.set(country, (acc.get(country) || 0) + 1);
                        return acc;
                    }, new Map())
            ),
            ipPatterns: this.findIPPatterns(),
            geoLocations: Array.from(this.geoData.entries()).map(([ip, data]) => ({
                ip,
                ...data
            })),
            ispsByCountry: this.getISPsByCountry(),
            trends: this.snapshots.map((snapshot, index) => ({
                snapshot: index + 1,
                count: snapshot.count,
                timestamp: snapshot.timestamp
            }))
        };
    }
}