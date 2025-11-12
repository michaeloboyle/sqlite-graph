// Vis.js Graph Visualizations for Use Case Examples

// Graph configurations for each use case
const graphConfigs = {
    'job-search': {
        nodes: [
            { id: 1, label: 'You', group: 'user', title: 'User Node' },
            { id: 2, label: 'JavaScript', group: 'skill', title: 'Skill: JavaScript' },
            { id: 3, label: 'React', group: 'skill', title: 'Skill: React' },
            { id: 4, label: 'Frontend Dev', group: 'job', title: 'Job: Frontend Developer' },
            { id: 5, label: 'Full-Stack Dev', group: 'job', title: 'Job: Full-Stack Developer' },
            { id: 6, label: 'Startup Inc', group: 'company', title: 'Company: Startup Inc' },
            { id: 7, label: 'Tech Corp', group: 'company', title: 'Company: Tech Corp' }
        ],
        edges: [
            { from: 1, to: 2, label: 'HAS_SKILL', color: { color: '#FF6B35' } },
            { from: 1, to: 3, label: 'HAS_SKILL', color: { color: '#FF6B35' } },
            { from: 4, to: 2, label: 'REQUIRES_SKILL', dashes: true },
            { from: 4, to: 3, label: 'REQUIRES_SKILL', dashes: true },
            { from: 5, to: 2, label: 'REQUIRES_SKILL', dashes: true },
            { from: 4, to: 6, label: 'AT_COMPANY' },
            { from: 5, to: 7, label: 'AT_COMPANY' }
        ],
        queryPath: [1, 2, 4, 6]
    },
    'ecommerce': {
        nodes: [
            { id: 1, label: 'Alice', group: 'user', title: 'User: Alice' },
            { id: 2, label: 'Bob', group: 'user', title: 'User: Bob' },
            { id: 3, label: 'Laptop', group: 'product', title: 'Product: Laptop' },
            { id: 4, label: 'Mouse', group: 'product', title: 'Product: Mouse' },
            { id: 5, label: 'Keyboard', group: 'product', title: 'Product: Keyboard' },
            { id: 6, label: 'Monitor', group: 'product', title: 'Product: Monitor' }
        ],
        edges: [
            { from: 1, to: 3, label: 'PURCHASED', color: { color: '#FF6B35' } },
            { from: 1, to: 4, label: 'PURCHASED', color: { color: '#FF6B35' } },
            { from: 2, to: 3, label: 'PURCHASED', dashes: true },
            { from: 2, to: 5, label: 'PURCHASED', dashes: true },
            { from: 2, to: 6, label: 'PURCHASED', dashes: true }
        ],
        queryPath: [1, 3, 2, 5]
    },
    'social': {
        nodes: [
            { id: 1, label: 'You', group: 'user', title: 'User: You' },
            { id: 2, label: 'Alice', group: 'friend', title: 'Friend: Alice' },
            { id: 3, label: 'Bob', group: 'friend', title: 'Friend: Bob' },
            { id: 4, label: 'Carol', group: 'fof', title: 'Friend-of-Friend: Carol' },
            { id: 5, label: 'Dave', group: 'fof', title: 'Friend-of-Friend: Dave' },
            { id: 6, label: 'Eve', group: 'fof', title: 'Friend-of-Friend: Eve' }
        ],
        edges: [
            { from: 1, to: 2, label: 'FRIENDS_WITH', color: { color: '#FF6B35' } },
            { from: 1, to: 3, label: 'FRIENDS_WITH', color: { color: '#FF6B35' } },
            { from: 2, to: 4, label: 'FRIENDS_WITH', dashes: true },
            { from: 2, to: 5, label: 'FRIENDS_WITH', dashes: true },
            { from: 3, to: 5, label: 'FRIENDS_WITH', dashes: true },
            { from: 3, to: 6, label: 'FRIENDS_WITH', dashes: true }
        ],
        queryPath: [1, 2, 4]
    },
    'crm': {
        nodes: [
            { id: 1, label: 'Q1 Deal', group: 'deal', title: 'Deal: Q1 Contract' },
            { id: 2, label: 'Acme Corp', group: 'company', title: 'Company: Acme Corp' },
            { id: 3, label: 'CEO', group: 'contact', title: 'Contact: CEO' },
            { id: 4, label: 'CTO', group: 'contact', title: 'Contact: CTO' },
            { id: 5, label: 'CFO', group: 'contact', title: 'Contact: CFO' },
            { id: 6, label: 'VP Sales', group: 'contact', title: 'Contact: VP Sales' }
        ],
        edges: [
            { from: 1, to: 2, label: 'AT_COMPANY', color: { color: '#FF6B35' } },
            { from: 3, to: 2, label: 'WORKS_AT', dashes: true },
            { from: 4, to: 2, label: 'WORKS_AT', dashes: true },
            { from: 5, to: 2, label: 'WORKS_AT', dashes: true },
            { from: 6, to: 2, label: 'WORKS_AT', dashes: true }
        ],
        queryPath: [1, 2, 3]
    }
};

// Vis.js styling options
const graphOptions = {
    nodes: {
        shape: 'dot',
        size: 20,
        font: {
            size: 14,
            color: '#111827',
            face: 'Inter'
        },
        borderWidth: 2,
        borderWidthSelected: 3
    },
    edges: {
        width: 2,
        color: { color: '#9CA3AF', highlight: '#FF6B35' },
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        font: { size: 10, color: '#6B7280', face: 'Inter', align: 'middle' },
        smooth: { type: 'continuous' }
    },
    groups: {
        user: { color: { background: '#FF6B35', border: '#E55A2B' } },
        skill: { color: { background: '#8BE9FD', border: '#6AC5D9' } },
        job: { color: { background: '#50FA7B', border: '#3DD968' } },
        company: { color: { background: '#FFB86C', border: '#E69A4E' } },
        friend: { color: { background: '#BD93F9', border: '#9B6FDB' } },
        fof: { color: { background: '#F1FA8C', border: '#D4DD6F' } },
        product: { color: { background: '#FF79C6', border: '#DB5CA8' } },
        deal: { color: { background: '#FF6B35', border: '#E55A2B' } },
        contact: { color: { background: '#50FA7B', border: '#3DD968' } }
    },
    physics: {
        enabled: true,
        stabilization: { iterations: 100 },
        barnesHut: {
            gravitationalConstant: -8000,
            centralGravity: 0.3,
            springLength: 150,
            springConstant: 0.04
        }
    },
    interaction: {
        hover: true,
        tooltipDelay: 100,
        zoomView: false,
        dragView: false
    }
};

// Initialize all graphs
const networks = {};

function initializeGraphs() {
    Object.keys(graphConfigs).forEach(exampleId => {
        const container = document.getElementById(`graph-${exampleId}`);
        if (!container) return;

        const config = graphConfigs[exampleId];
        const data = {
            nodes: new vis.DataSet(config.nodes),
            edges: new vis.DataSet(config.edges)
        };

        networks[exampleId] = new vis.Network(container, data, graphOptions);

        // Disable physics after initial layout
        networks[exampleId].once('stabilizationIterationsDone', () => {
            networks[exampleId].setOptions({ physics: false });
        });
    });
}

// Animate query execution
function animateQuery(exampleId) {
    const network = networks[exampleId];
    const config = graphConfigs[exampleId];

    if (!network || !config.queryPath) return;

    const data = network.body.data;
    const allNodes = data.nodes.get();
    const allEdges = data.edges.get();

    // Reset all nodes and edges to default
    allNodes.forEach(node => {
        data.nodes.update({
            id: node.id,
            color: undefined,
            borderWidth: 2
        });
    });

    allEdges.forEach(edge => {
        data.edges.update({
            id: edge.id,
            color: { color: '#9CA3AF' },
            width: 2
        });
    });

    // Animate the query path
    const path = config.queryPath;
    let step = 0;

    function highlightNextStep() {
        if (step >= path.length) return;

        const nodeId = path[step];

        // Highlight current node
        data.nodes.update({
            id: nodeId,
            color: { background: '#FF6B35', border: '#E55A2B' },
            borderWidth: 4
        });

        // Highlight edge to next node
        if (step < path.length - 1) {
            const nextNodeId = path[step + 1];
            const edge = allEdges.find(e =>
                (e.from === nodeId && e.to === nextNodeId) ||
                (e.to === nodeId && e.from === nextNodeId)
            );

            if (edge) {
                data.edges.update({
                    id: edge.id,
                    color: { color: '#FF6B35' },
                    width: 4
                });
            }
        }

        // Focus on current node
        network.focus(nodeId, {
            scale: 1.2,
            animation: {
                duration: 500,
                easingFunction: 'easeInOutQuad'
            }
        });

        step++;
        if (step < path.length) {
            setTimeout(highlightNextStep, 800);
        } else {
            // Final zoom out to show full graph
            setTimeout(() => {
                network.fit({
                    animation: {
                        duration: 1000,
                        easingFunction: 'easeInOutQuad'
                    }
                });
            }, 1000);
        }
    }

    highlightNextStep();
}

// Add click handlers to "Run Query" buttons
document.addEventListener('DOMContentLoaded', () => {
    // Initialize graphs
    initializeGraphs();

    // Add button handlers
    document.querySelectorAll('.animate-query-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const exampleId = this.getAttribute('data-target');
            animateQuery(exampleId);

            // Update button text
            this.textContent = '⟳ Replay Query';
            setTimeout(() => {
                this.textContent = '▶ Run Query';
            }, 5000);
        });
    });

    // Auto-play first visible graph
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                const useCase = entry.target;
                const exampleId = useCase.getAttribute('data-example');

                // Auto-play once when scrolled into view
                if (!useCase.dataset.played) {
                    setTimeout(() => {
                        animateQuery(exampleId);
                        useCase.dataset.played = 'true';
                    }, 500);
                }
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('.use-case').forEach(useCase => {
        observer.observe(useCase);
    });
});

// Handle window resize
window.addEventListener('resize', () => {
    Object.values(networks).forEach(network => {
        network.fit();
    });
});
