/**
 * sqlite-graph Browser - Backend API Server
 *
 * Provides REST API for the Neo4j Aura-style browser interface
 * Run: npx ts-node examples/graph-browser/server.ts
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { GraphDatabase } from '../../src/core/Database';

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// In-memory database instance
let db: GraphDatabase | null = null;

// Initialize database
function initDatabase() {
  if (db) db.close();
  db = new GraphDatabase(':memory:');
  loadSampleData();
}

// Load sample job search data
function loadSampleData() {
  if (!db) return;

  // Companies
  const google = db.createNode('Company', { name: 'Google', industry: 'Technology', size: 'Large' });
  const startup = db.createNode('Company', { name: 'TechStartup', industry: 'SaaS', size: 'Small' });
  const microsoft = db.createNode('Company', { name: 'Microsoft', industry: 'Technology', size: 'Large' });

  // Jobs
  const seniorEng = db.createNode('Job', { title: 'Senior Engineer', salary: 180000, remote: true, status: 'active' });
  const techLead = db.createNode('Job', { title: 'Tech Lead', salary: 200000, remote: false, status: 'active' });
  const staffEng = db.createNode('Job', { title: 'Staff Engineer', salary: 220000, remote: true, status: 'active' });
  const principalEng = db.createNode('Job', { title: 'Principal Engineer', salary: 250000, remote: false, status: 'active' });

  // Skills
  const typescript = db.createNode('Skill', { name: 'TypeScript', category: 'Language' });
  const react = db.createNode('Skill', { name: 'React', category: 'Framework' });
  const nodejs = db.createNode('Skill', { name: 'Node.js', category: 'Runtime' });
  const postgres = db.createNode('Skill', { name: 'PostgreSQL', category: 'Database' });
  const kubernetes = db.createNode('Skill', { name: 'Kubernetes', category: 'Infrastructure' });

  // People
  const alice = db.createNode('Person', { name: 'Alice', experience: 8 });
  const bob = db.createNode('Person', { name: 'Bob', experience: 5 });
  const charlie = db.createNode('Person', { name: 'Charlie', experience: 12 });

  // Applications
  const app1 = db.createNode('Application', { status: 'in_progress', appliedAt: '2025-10-15' });
  const app2 = db.createNode('Application', { status: 'rejected', appliedAt: '2025-10-10' });
  const app3 = db.createNode('Application', { status: 'interview', appliedAt: '2025-10-20' });

  // Edges - Jobs to Companies
  db.createEdge(seniorEng.id, 'POSTED_BY', google.id);
  db.createEdge(techLead.id, 'POSTED_BY', google.id);
  db.createEdge(staffEng.id, 'POSTED_BY', startup.id);
  db.createEdge(principalEng.id, 'POSTED_BY', microsoft.id);

  // Edges - Jobs to Skills
  db.createEdge(seniorEng.id, 'REQUIRES', typescript.id);
  db.createEdge(seniorEng.id, 'REQUIRES', react.id);
  db.createEdge(seniorEng.id, 'REQUIRES', nodejs.id);
  db.createEdge(techLead.id, 'REQUIRES', typescript.id);
  db.createEdge(techLead.id, 'REQUIRES', kubernetes.id);
  db.createEdge(staffEng.id, 'REQUIRES', typescript.id);
  db.createEdge(staffEng.id, 'REQUIRES', postgres.id);
  db.createEdge(principalEng.id, 'REQUIRES', typescript.id);
  db.createEdge(principalEng.id, 'REQUIRES', kubernetes.id);

  // Edges - People to Skills
  db.createEdge(alice.id, 'HAS_SKILL', typescript.id);
  db.createEdge(alice.id, 'HAS_SKILL', react.id);
  db.createEdge(alice.id, 'HAS_SKILL', nodejs.id);
  db.createEdge(bob.id, 'HAS_SKILL', typescript.id);
  db.createEdge(bob.id, 'HAS_SKILL', postgres.id);
  db.createEdge(charlie.id, 'HAS_SKILL', typescript.id);
  db.createEdge(charlie.id, 'HAS_SKILL', kubernetes.id);

  // Edges - Applications
  db.createEdge(alice.id, 'APPLIED', app1.id);
  db.createEdge(app1.id, 'APPLIED_TO', seniorEng.id);
  db.createEdge(bob.id, 'APPLIED', app2.id);
  db.createEdge(app2.id, 'APPLIED_TO', techLead.id);
  db.createEdge(charlie.id, 'APPLIED', app3.id);
  db.createEdge(app3.id, 'APPLIED_TO', principalEng.id);

  // Job similarity
  db.createEdge(seniorEng.id, 'SIMILAR_TO', techLead.id);
  db.createEdge(techLead.id, 'SIMILAR_TO', principalEng.id);
  db.createEdge(staffEng.id, 'SIMILAR_TO', seniorEng.id);
}

// API Routes

// GET /api/stats - Get database statistics
app.get('/api/stats', (req: Request, res: Response) => {
  if (!db) {
    return res.status(503).json({ error: 'Database not initialized' });
  }

  const data = db.export();
  res.json({
    nodes: data.nodes.length,
    edges: data.edges.length,
    nodeTypes: [...new Set(data.nodes.map(n => n.type))],
    edgeTypes: [...new Set(data.edges.map(e => e.type))]
  });
});

// POST /api/query - Execute a query
app.post('/api/query', (req: Request, res: Response) => {
  if (!db) {
    return res.status(503).json({ error: 'Database not initialized' });
  }

  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const startTime = Date.now();

  try {
    // Safely evaluate the query in a sandboxed context
    const result = eval(`(${query})`);
    const endTime = Date.now();

    res.json({
      success: true,
      data: result,
      stats: {
        executionTime: endTime - startTime,
        resultCount: Array.isArray(result) ? result.length : 1
      }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/export - Export entire graph
app.get('/api/export', (req: Request, res: Response) => {
  if (!db) {
    return res.status(503).json({ error: 'Database not initialized' });
  }

  const data = db.export();
  res.json(data);
});

// POST /api/reset - Reset database to sample data
app.post('/api/reset', (req: Request, res: Response) => {
  initDatabase();
  res.json({ success: true, message: 'Database reset with sample data' });
});

// POST /api/clear - Clear all data
app.post('/api/clear', (req: Request, res: Response) => {
  if (db) db.close();
  db = new GraphDatabase(':memory:');
  res.json({ success: true, message: 'Database cleared' });
});

// Serve the frontend
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
initDatabase();

app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   sqlite-graph Browser Server                     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📊 Sample data loaded: ${db?.export().nodes.length} nodes, ${db?.export().edges.length} edges`);
  console.log(`\n💡 Open http://localhost:${PORT} in your browser\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down server...');
  if (db) db.close();
  process.exit(0);
});
