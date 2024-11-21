let providersChart;
let ispChart;
let trendsChart;
let bubbleMap;

function createProvidersChart(data) {
    const ctx = document.getElementById('providersChart').getContext('2d');
    if (providersChart) {
        providersChart.destroy();
    }
    
    providersChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data.providers),
            datasets: [{
                data: Object.values(data.providers),
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#9966FF',
                    '#FF9F40',
                    '#E7E9ED'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

function createISPChart(data) {
    const ctx = document.getElementById('ispChart').getContext('2d');
    if (ispChart) {
        ispChart.destroy();
    }

    // Get top 10 ISPs by count
    const sortedISPs = Object.entries(data.isps)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

    ispChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedISPs.map(([isp]) => isp),
            datasets: [{
                label: 'Number of IPs',
                data: sortedISPs.map(([,count]) => count),
                backgroundColor: '#4BC0C0'
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function createBubbleMap(data) {
    const width = document.getElementById('bubbleMap').clientWidth;
    const height = 400;

    // Clear previous visualization
    d3.select('#bubbleMap').html('');

    const svg = d3.select('#bubbleMap')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    const bubble = d3.pack()
        .size([width, height])
        .padding(1);

    const root = d3.hierarchy({ children: data.bubbleMap })
        .sum(d => d.value);

    const nodes = bubble(root).descendants().slice(1);

    const node = svg.selectAll('g')
        .data(nodes)
        .join('g')
        .attr('transform', d => `translate(${d.x},${d.y})`);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    node.append('circle')
        .attr('r', d => d.r)
        .style('fill', (d, i) => color(i))
        .style('opacity', 0.7)
        .on('mouseover', function(event, d) {
            d3.select(this).style('opacity', 1);
            tooltip.style('opacity', 1)
                .html(`Prefix: ${d.data.prefix}<br/>Count: ${d.data.value}`)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this).style('opacity', 0.7);
            tooltip.style('opacity', 0);
        });

    node.append('text')
        .text(d => d.data.prefix)
        .style('font-size', '10px')
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'middle')
        .style('fill', 'white');

    const tooltip = d3.select('body')
        .append('div')
        .style('position', 'absolute')
        .style('background', 'white')
        .style('padding', '5px')
        .style('border', '1px solid #ddd')
        .style('border-radius', '3px')
        .style('opacity', 0);
}

function createTrendsChart(data) {
    const ctx = document.getElementById('trendsChart').getContext('2d');
    if (trendsChart) {
        trendsChart.destroy();
    }

    trendsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.trends.map(t => `Snapshot ${t.snapshot}`),
            datasets: [{
                label: 'IPs per Snapshot',
                data: data.trends.map(t => t.count),
                borderColor: '#36A2EB',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function updateSummaryStats(data) {
    document.getElementById('totalIPs').textContent = data.totalIPs;
    document.getElementById('totalSnapshots').textContent = data.totalSnapshots;
}

function updateDashboard(data) {
    createProvidersChart(data);
    createISPChart(data);
    createTrendsChart(data);
    createBubbleMap(data);
    updateSummaryStats(data);
}

// Load sample data for the static deployment
fetch('/data.json')
    .then(response => response.json())
    .then(data => {
        updateDashboard(data);
    })
    .catch(error => {
        console.error('Error loading data:', error);
    });