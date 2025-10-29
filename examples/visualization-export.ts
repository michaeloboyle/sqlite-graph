/**
 * sqlite-graph Visualization Export Example
 * 
 * Demonstrates exporting graph data for vis.js visualization
 * Run: npx ts-node examples/visualization-export.ts
 */

import { GraphDatabase } from '../src/core/Database';
import * as fs from 'fs';
import * as path from 'path';

interface VisNode {
  id: number;
  label: string;
  title: string;
  color: { background: string; border: string };
  properties: Record<string, unknown>;
  type: string;
}

interface VisEdge {
  from: number;
  to: number;
  label: string;
  arrows: string;
}

interface VisData {
  nodes: VisNode[];
  edges: VisEdge[];
}

const nodeColors: Record<string, { background: string; border: string }> = {
  Job: { background: '#4CAF50', border: '#388E3C' },
  Company: { background: '#2196F3', border: '#1976D2' },
  Skill: { background: '#FF9800', border: '#F57C00' },
  Person: { background: '#9C27B0', border: '#7B1FA2' },
  Application: { background: '#E91E63', border: '#C2185B' },
};

function exportToVisJS(db: GraphDatabase): VisData {
  const graphData = db.export();

  const nodes: VisNode[] = graphData.nodes.map((node) => {
    const props = node.properties as any;
    const displayName = props.title || props.name || node.type;

    return {
      id: node.id,
      label: node.type,
      title: `${node.type}: ${displayName}`,
      color: nodeColors[node.type] || { background: '#999', border: '#666' },
      properties: node.properties,
      type: node.type,
    };
  });

  const edges: VisEdge[] = graphData.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    label: edge.type,
    arrows: 'to',
  }));

  return { nodes, edges };
}

function createJobSearchGraph(): GraphDatabase {
  console.log('\n=== Creating Job Search Graph ===\n');

  const db = new GraphDatabase(':memory:');

  // Create companies
  const google = db.createNode('Company', { name: 'Google', industry: 'Technology' });
  const startup = db.createNode('Company', { name: 'TechStartup', industry: 'SaaS' });

  // Create jobs
  const seniorEng = db.createNode('Job', { title: 'Senior Engineer', salary: 180000 });
  const techLead = db.createNode('Job', { title: 'Tech Lead', salary: 200000 });

  // Create skills
  const typescript = db.createNode('Skill', { name: 'TypeScript' });
  const react = db.createNode('Skill', { name: 'React' });
  const nodejs = db.createNode('Skill', { name: 'Node.js' });

  // Create people
  const alice = db.createNode('Person', { name: 'Alice', experience: 8 });
  const bob = db.createNode('Person', { name: 'Bob', experience: 5 });

  // Create applications
  const app1 = db.createNode('Application', { status: 'in_progress' });
  const app2 = db.createNode('Application', { status: 'rejected' });

  // Link jobs to companies
  db.createEdge(seniorEng.id, 'POSTED_BY', google.id);
  db.createEdge(techLead.id, 'POSTED_BY', startup.id);

  // Link jobs to skills
  db.createEdge(seniorEng.id, 'REQUIRES', typescript.id);
  db.createEdge(seniorEng.id, 'REQUIRES', react.id);
  db.createEdge(techLead.id, 'REQUIRES', typescript.id);
  db.createEdge(techLead.id, 'REQUIRES', nodejs.id);

  // Link people to skills
  db.createEdge(alice.id, 'HAS_SKILL', typescript.id);
  db.createEdge(alice.id, 'HAS_SKILL', react.id);
  db.createEdge(bob.id, 'HAS_SKILL', typescript.id);

  // Link applications
  db.createEdge(alice.id, 'APPLIED', app1.id);
  db.createEdge(app1.id, 'APPLIED_TO', seniorEng.id);
  db.createEdge(bob.id, 'APPLIED', app2.id);
  db.createEdge(app2.id, 'APPLIED_TO', techLead.id);

  // Add similarity
  db.createEdge(seniorEng.id, 'SIMILAR_TO', techLead.id);

  const graphData = db.export();
  console.log(`✅ Created: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges\n`);

  return db;
}

function generateHTMLVisualization(visData: VisData, filename: string): void {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${filename}</title>
<script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js"></script>
<style>
body{font-family:system-ui;margin:0;background:#f5f5f5}
.container{max-width:1400px;margin:0 auto;padding:20px}
header{background:#fff;padding:20px;border-radius:8px;margin-bottom:20px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
#network{width:100%;height:700px;background:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
.info{background:#fff;padding:20px;border-radius:8px;margin-top:20px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px}
.stat{background:#f8f9fa;padding:15px;border-radius:4px;text-align:center}
.stat-value{font-size:32px;font-weight:bold;color:#007bff}
</style></head><body>
<div class="container">
<header><h1>🗺️ ${filename}</h1><p>Click nodes to see details, drag to rearrange</p></header>
<div id="network"></div>
<div class="info">
<h3>Graph Statistics</h3>
<div class="stats">
<div class="stat"><div class="stat-value">${visData.nodes.length}</div><div>Nodes</div></div>
<div class="stat"><div class="stat-value">${visData.edges.length}</div><div>Edges</div></div>
</div></div></div>
<script>
const nodes=new vis.DataSet(${JSON.stringify(visData.nodes)});
const edges=new vis.DataSet(${JSON.stringify(visData.edges)});
const network=new vis.Network(document.getElementById('network'),{nodes,edges},{
nodes:{shape:'dot',size:20,font:{size:14},borderWidth:2,shadow:true},
edges:{width:2,smooth:{type:'continuous'},arrows:{to:{enabled:true,scaleFactor:0.5}},font:{size:12}},
physics:{stabilization:{iterations:200},barnesHut:{gravitationalConstant:-8000,springConstant:0.04,springLength:150}},
interaction:{hover:true,navigationButtons:true,keyboard:true}
});
network.on('stabilizationIterationsDone',()=>network.setOptions({physics:false}));
</script></body></html>`;

  const outputPath = path.join(__dirname, filename);
  fs.writeFileSync(outputPath, html);
  console.log(`✅ Generated: ${outputPath}\n`);
}

function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   sqlite-graph Visualization Export Example       ║');
  console.log('╚════════════════════════════════════════════════════╝');

  const db = createJobSearchGraph();
  const visData = exportToVisJS(db);

  console.log('=== Generating Visualizations ===\n');
  generateHTMLVisualization(visData, 'job-search-visualization.html');

  // Export JSON
  const jsonPath = path.join(__dirname, 'job-search-data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(visData, null, 2));
  console.log(`✅ Exported JSON: ${jsonPath}\n`);

  console.log('=== Demo Query: Find Matching Jobs ===\n');
  const alice = db.nodes('Person').where({ name: 'Alice' }).exec()[0];
  if (alice) {
    const matchingJobs = db.traverse(alice.id)
      .out('HAS_SKILL')
      .both('REQUIRES')
      .filter((node) => node.type === 'Job')
      .unique()
      .toArray();
    
    console.log(`Found ${matchingJobs.length} jobs matching Alice's skills:`);
    matchingJobs.forEach((job) => {
      console.log(`  - ${(job.properties as any).title}`);
    });
  }

  console.log('\n=== Complete! ===\n');
  console.log('Open these files in your browser:');
  console.log('  - job-search-visualization.html');
  console.log('  - visualization-browser.html\n');

  db.close();
}

main();
