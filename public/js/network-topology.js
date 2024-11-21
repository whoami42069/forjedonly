// WebSocket connection
let ws;
let svg;
let tooltip;
let currentData = null;
let width;
let height;

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            currentData = data;
            updateVisualization();
        } catch (error) {
            console.error('Error parsing data:', error);
        }
    };

    ws.onclose = function() {
        setTimeout(initializeWebSocket, 1000);
    };
}

function initializeBubbleMap() {
    const container = document.getElementById('bubble-container');
    width = container.clientWidth;
    height = container.clientHeight;

    // Clear any existing SVG
    d3.select('#bubble-container svg').remove();

    // Create new SVG
    svg = d3.select('#bubble-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    // Add tooltip
    tooltip = d3.select('body')
        .append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);

    // Add zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.5, 5])
        .on('zoom', (event) => {
            svg.selectAll('g').attr('transform', event.transform);
        });

    svg.call(zoom);
}

function createSubnetClusters(ips) {
    const clusters = new Map();
    
    ips.forEach(ip => {
        const subnet = ip.split('.').slice(0, 3).join('.'); // /24 subnet
        if (!clusters.has(subnet)) {
            clusters.set(subnet, []);
        }
        clusters.get(subnet).push(ip);
    });

    return Array.from(clusters.entries())
        .filter(([, ips]) => ips.length >= parseInt(document.getElementById('minClusterSize').value))
        .map(([subnet, ips]) => ({
            id: subnet,
            label: `${subnet}.0/24`,
            ips,
            size: ips.length
        }));
}

function createProviderClusters(geoLocations) {
    const clusters = new Map();
    
    geoLocations.forEach(loc => {
        const provider = loc.provider || 'Unknown';
        if (!clusters.has(provider)) {
            clusters.set(provider, []);
        }
        clusters.get(provider).push(loc.ip);
    });

    return Array.from(clusters.entries())
        .filter(([, ips]) => ips.length >= parseInt(document.getElementById('minClusterSize').value))
        .map(([provider, ips]) => ({
            id: provider,
            label: provider,
            ips,
            size: ips.length
        }));
}

function createRegionClusters(geoLocations) {
    const clusters = new Map();
    
    geoLocations.forEach(loc => {
        const region = `${loc.country || 'Unknown'}`;
        if (!clusters.has(region)) {
            clusters.set(region, []);
        }
        clusters.get(region).push(loc.ip);
    });

    return Array.from(clusters.entries())
        .filter(([, ips]) => ips.length >= parseInt(document.getElementById('minClusterSize').value))
        .map(([region, ips]) => ({
            id: region,
            label: region,
            ips,
            size: ips.length
        }));
}

function updateStatistics(clusters) {
    const totalClusters = clusters.length;
    const sizes = clusters.map(c => c.size);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / totalClusters;
    const maxSize = Math.max(...sizes);
    const isolatedCount = clusters.filter(c => c.size === 1).length;

    document.getElementById('totalClusters').textContent = totalClusters;
    document.getElementById('avgClusterSize').textContent = avgSize.toFixed(1);
    document.getElementById('largestCluster').textContent = maxSize;
    document.getElementById('isolatedNodes').textContent = isolatedCount;

    // Update cluster table
    const tbody = document.getElementById('clusterTable');
    tbody.innerHTML = clusters
        .sort((a, b) => b.size - a.size)
        .slice(0, 10)
        .map(cluster => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-2">${cluster.label}</td>
                <td class="px-4 py-2">${cluster.size}</td>
                <td class="px-4 py-2">${getClusterType(cluster)}</td>
            </tr>
        `)
        .join('');
}

function getClusterType(cluster) {
    if (cluster.label.includes('.')) return 'Subnet';
    if (['AWS', 'Google Cloud', 'Azure'].includes(cluster.label)) return 'Cloud Provider';
    return 'Geographic';
}

function updateVisualization() {
    if (!currentData) return;

    const method = document.getElementById('clusterMethod').value;
    let clusters;

    switch (method) {
        case 'subnet':
            clusters = createSubnetClusters(currentData.geoLocations.map(loc => loc.ip));
            break;
        case 'provider':
            clusters = createProviderClusters(currentData.geoLocations);
            break;
        case 'region':
            clusters = createRegionClusters(currentData.geoLocations);
            break;
    }

    const bubbleScale = parseFloat(document.getElementById('bubbleScale').value);
    const pack = d3.pack()
        .size([width, height])
        .padding(3);

    const root = d3.hierarchy({ children: clusters })
        .sum(d => d.size ? Math.pow(d.size, bubbleScale) : 0);

    const nodes = pack(root).leaves();

    // Update visualization
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    
    // Clear previous nodes
    svg.selectAll('.node').remove();

    // Create new nodes
    const node = svg.selectAll('.node')
        .data(nodes)
        .join('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.x},${d.y})`);

    node.append('circle')
        .attr('r', d => d.r)
        .style('fill', d => colorScale(d.data.id))
        .style('opacity', 0.7)
        .on('mouseover', function(event, d) {
            d3.select(this).style('opacity', 1);
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
            tooltip.html(`
                <strong>${d.data.label}</strong><br/>
                IPs: ${d.data.size}<br/>
                Type: ${getClusterType(d.data)}
            `)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this).style('opacity', 0.7);
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });

    node.append('text')
        .attr('dy', '.3em')
        .style('text-anchor', 'middle')
        .style('font-size', d => Math.min(d.r / 3, 12) + 'px')
        .style('fill', 'white')
        .text(d => d.data.label);

    updateStatistics(clusters);
}

// Event listeners for controls
document.getElementById('clusterMethod').addEventListener('change', updateVisualization);
document.getElementById('minClusterSize').addEventListener('change', updateVisualization);
document.getElementById('bubbleScale').addEventListener('input', updateVisualization);

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    initializeBubbleMap();
    initializeWebSocket();
});