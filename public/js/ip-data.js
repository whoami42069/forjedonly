// WebSocket connection
let ws;
let countryChart;

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            updatePage(data);
        } catch (error) {
            console.error('Error parsing data:', error);
        }
    };

    ws.onclose = function() {
        setTimeout(initializeWebSocket, 1000);
    };
}

function initializeCharts() {
    const ctx = document.getElementById('countryPieChart').getContext('2d');
    countryChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: []
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const percentage = context.dataset.percentages[context.dataIndex];
                            return `${label}: ${value} IPs (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function updateCountryDistribution(geoLocations) {
    const countryCount = {};
    let total = 0;

    geoLocations.forEach(loc => {
        const country = loc.country || 'Unknown';
        countryCount[country] = (countryCount[country] || 0) + 1;
        total++;
    });

    const countryData = Object.entries(countryCount)
        .map(([country, count]) => ({
            country,
            count,
            percentage: (count / total * 100).toFixed(2)
        }))
        .sort((a, b) => b.count - a.count);

    // Update chart
    const colors = generateColors(countryData.length);
    countryChart.data = {
        labels: countryData.map(d => d.country),
        datasets: [{
            data: countryData.map(d => d.count),
            backgroundColor: colors,
            percentages: countryData.map(d => d.percentage)
        }]
    };
    countryChart.update();

    // Update table
    const tbody = document.getElementById('countryTable');
    tbody.innerHTML = countryData
        .map(d => `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">${d.country}</td>
                <td class="px-6 py-4 whitespace-nowrap">${d.count}</td>
                <td class="px-6 py-4 whitespace-nowrap">${d.percentage}%</td>
            </tr>
        `)
        .join('');
}

function generateColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        const hue = (i * 137.508) % 360; // Golden angle approximation
        colors.push(`hsl(${hue}, 70%, 60%)`);
    }
    return colors;
}

function setupDownloadButtons(data) {
    document.getElementById('downloadJSON').onclick = () => {
        const jsonStr = JSON.stringify(data.geoLocations, null, 2);
        downloadFile(jsonStr, 'solana_ips.json', 'application/json');
    };

    document.getElementById('downloadCSV').onclick = () => {
        const csvContent = [
            ['IP', 'Country', 'City', 'Provider', 'Organization'].join(','),
            ...data.geoLocations.map(loc => [
                loc.ip,
                loc.country || 'Unknown',
                loc.city || 'Unknown',
                loc.provider || 'Unknown',
                (loc.org || 'Unknown').replace(/,/g, ';')
            ].join(','))
        ].join('\n');
        downloadFile(csvContent, 'solana_ips.csv', 'text/csv');
    };
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

function updatePage(data) {
    updateCountryDistribution(data.geoLocations);
    setupDownloadButtons(data);
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    initializeCharts();
    initializeWebSocket();
});