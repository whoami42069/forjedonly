// WebSocket and initialization
let ws;
let map;
let charts = {};
let markerClusterGroup;

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            updateDashboard(data);
        } catch (error) {
            console.error('Error parsing data:', error);
        }
    };

    ws.onclose = function() {
        console.log('WebSocket connection closed. Reconnecting...');
        setTimeout(initializeWebSocket, 1000);
    };

    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

function initializeMap() {
    if (!map) {
        map = L.map('geoMap').setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        });
        map.addLayer(markerClusterGroup);
    }
}

function initializeCharts() {
    // ISP Chart
    const ispCtx = document.getElementById('ispChart').getContext('2d');
    charts.isp = new Chart(ispCtx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: d3.schemeSet3
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const data = context.dataset.data[context.dataIndex];
                            const label = context.label;
                            const percentage = context.dataset.percentages[context.dataIndex];
                            return `${label}: ${data} nodes (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    // Country Chart
    const countryCtx = document.getElementById('countryChart').getContext('2d');
    charts.country = new Chart(countryCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Countries' }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Number of Nodes' }
                }
            },
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw} nodes`;
                        }
                    }
                }
            }
        }
    });
}

function updateSummaryStats(data) {
    document.getElementById('totalIPs').textContent = data.totalIPs || 0;
    document.getElementById('totalSnapshots').textContent = data.totalSnapshots || 0;
    document.getElementById('highValueTxs').textContent = data.highValueTxs?.length || 0;
    
    const totalVolume = data.highValueTxs?.reduce((sum, tx) => sum + tx.value, 0) || 0;
    document.getElementById('totalVolume').textContent = totalVolume.toFixed(2);
}

function updateGeoDistribution(locations) {
    markerClusterGroup.clearLayers();

    locations.forEach(loc => {
        if (loc.ll && loc.ll.length === 2) {
            const marker = L.marker([loc.ll[0], loc.ll[1]])
                .bindPopup(`
                    <b>IP:</b> ${loc.ip}<br>
                    <b>Country:</b> ${loc.country}<br>
                    <b>City:</b> ${loc.city || 'Unknown'}<br>
                    <b>Provider:</b> ${loc.provider}<br>
                    <b>Organization:</b> ${loc.org || 'Unknown'}
                `);
            markerClusterGroup.addLayer(marker);
        }
    });

    map.fitBounds(markerClusterGroup.getBounds(), { padding: [50, 50] });
}

function updateISPChart(providerStats) {
    const labels = providerStats.map(p => p.provider);
    const data = providerStats.map(p => p.count);
    const percentages = providerStats.map(p => p.percentage);

    charts.isp.data = {
        labels: labels,
        datasets: [{
            data: data,
            backgroundColor: d3.schemeSet3.slice(0, data.length),
            percentages: percentages
        }]
    };
    charts.isp.update();
}

function updateTransactionTable(transactions) {
    const tbody = document.getElementById('txTable');
    tbody.innerHTML = '';

    transactions.forEach(tx => {
        const row = document.createElement('tr');
        row.className = 'transaction-row hover:bg-gray-50';
        
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">${tx.block}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="font-mono text-sm cursor-pointer" title="Click to copy">${tx.signature}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">${tx.value.toFixed(2)}</td>
            <td class="px-6 py-4 whitespace-nowrap">${new Date(tx.timestamp).toLocaleString()}</td>
        `;

        const signatureSpan = row.querySelector('.font-mono');
        signatureSpan.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(tx.signature);
                signatureSpan.textContent = 'Copied!';
                setTimeout(() => {
                    signatureSpan.textContent = tx.signature;
                }, 1000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        });

        tbody.appendChild(row);
    });
}

function calculateStatistics(trends) {
    if (!trends.length) return { min: 0, max: 0, mean: '0.00', median: '0.00', stdDev: '0.00' };

    const counts = trends.map(t => t.count);
    const sum = counts.reduce((a, b) => a + b, 0);
    const mean = sum / counts.length;
    const sortedCounts = [...counts].sort((a, b) => a - b);
    const median = counts.length % 2 === 0
        ? (sortedCounts[counts.length / 2 - 1] + sortedCounts[counts.length / 2]) / 2
        : sortedCounts[Math.floor(counts.length / 2)];
    const variance = counts.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    return {
        min: Math.min(...counts),
        max: Math.max(...counts),
        mean: mean.toFixed(2),
        median: median.toFixed(2),
        stdDev: stdDev.toFixed(2)
    };
}

function updateNetworkStats(trends) {
    const stats = calculateStatistics(trends);
    document.getElementById('minNodes').textContent = stats.min;
    document.getElementById('maxNodes').textContent = stats.max;
    document.getElementById('meanNodes').textContent = stats.mean;
    document.getElementById('medianNodes').textContent = stats.median;
    document.getElementById('stdDevNodes').textContent = stats.stdDev;
}

function updateCountryChart(countryStats) {
    const providers = [...new Set(countryStats.flatMap(c => 
        c.providers.map(p => p.provider)
    ))];

    const datasets = providers.map((provider, index) => ({
        label: provider,
        data: countryStats.map(country => 
            country.providers.find(p => p.provider === provider)?.count || 0
        ),
        backgroundColor: d3.schemeSet3[index % d3.schemeSet3.length]
    }));

    charts.country.data = {
        labels: countryStats.map(c => c.country),
        datasets: datasets
    };
    charts.country.update();
}

function updateDashboard(data) {
    updateSummaryStats(data);
    updateGeoDistribution(data.geoLocations);
    updateISPChart(data.providerStats);
    updateTransactionTable(data.highValueTxs);
    updateNetworkStats(data.trends);
    updateCountryChart(data.countryStats);
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
});

function initializeDashboard() {
    initializeWebSocket();
    initializeMap();
    initializeCharts();
}