# sqlite-graph Browser

> Neo4j Aura-style interactive graph database browser for sqlite-graph

An interactive web interface for exploring and querying your sqlite-graph databases, inspired by Neo4j Aura's Browser tool.

![sqlite-graph Browser Screenshot](../../docs/screenshots/graph-browser.png)

## Features

✅ **Interactive Visualization** - Explore your graph with vis.js-powered visualization
✅ **Query Editor** - CodeMirror-based editor with syntax highlighting
✅ **Multiple Views** - Graph, Table, and JSON views for results
✅ **Sample Queries** - Pre-built queries to get started quickly
✅ **Live Statistics** - Real-time node and edge counts
✅ **Dark Theme** - Professional dark UI like Neo4j Aura
✅ **Export Support** - Export graph data in multiple formats

## Quick Start

### 1. Start the Server

```bash
# From repository root
npx ts-node examples/graph-browser/server.ts
```

### 2. Open Browser

Visit [http://localhost:3000](http://localhost:3000)

### 3. Run Queries

Try these sample queries:

```javascript
// Get all active jobs
db.nodes('Job').where({status: 'active'}).exec()

// Find company for a job
db.traverse(1).out('POSTED_BY').exec()

// Shortest path between nodes
db.traverse(1).shortestPath(5)

// Export entire graph
db.export()
```

## Architecture

```
graph-browser/
├── index.html          # Frontend (Dark theme UI)
├── server.ts          # Backend API (Express)
└── README.md          # This file
```

### Frontend (index.html)

- **Query Editor**: CodeMirror with dark theme
- **Visualization**: vis.js network graph
- **Views**: Graph, Table, JSON tabs
- **UI**: Dark theme inspired by Neo4j Aura

### Backend (server.ts)

- **Express API**: REST endpoints for queries
- **In-Memory DB**: Sample job search data
- **Query Execution**: Safe eval with error handling
- **Statistics**: Real-time graph metrics

## API Endpoints

### GET /api/stats
Get database statistics

**Response:**
```json
{
  "nodes": 19,
  "edges": 27,
  "nodeTypes": ["Job", "Company", "Skill", "Person", "Application"],
  "edgeTypes": ["POSTED_BY", "REQUIRES", "HAS_SKILL", "APPLIED", "APPLIED_TO", "SIMILAR_TO"]
}
```

### POST /api/query
Execute a graph query

**Request:**
```json
{
  "query": "db.nodes('Job').where({status: 'active'}).exec()"
}
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "stats": {
    "executionTime": 5,
    "resultCount": 4
  }
}
```

### GET /api/export
Export entire graph

**Response:**
```json
{
  "nodes": [...],
  "edges": [...]
}
```

### POST /api/reset
Reset database to sample data

### POST /api/clear
Clear all data from database

## Sample Data

The browser loads a job search graph with:

- **19 Nodes:**
  - 3 Companies (Google, TechStartup, Microsoft)
  - 4 Jobs (Senior Engineer, Tech Lead, Staff Engineer, Principal Engineer)
  - 5 Skills (TypeScript, React, Node.js, PostgreSQL, Kubernetes)
  - 3 People (Alice, Bob, Charlie)
  - 3 Applications (various statuses)

- **27 Edges:**
  - POSTED_BY (jobs → companies)
  - REQUIRES (jobs → skills)
  - HAS_SKILL (people → skills)
  - APPLIED (people → applications)
  - APPLIED_TO (applications → jobs)
  - SIMILAR_TO (job → job)

## Configuration

### Change Port

Edit `server.ts`:

```typescript
const PORT = 3000; // Change to your preferred port
```

### Use File-Based Database

Edit `server.ts`:

```typescript
function initDatabase() {
  db = new GraphDatabase('./graph.db'); // Use file instead of :memory:
  loadSampleData();
}
```

### Custom Sample Data

Modify `loadSampleData()` in `server.ts` to load your own data structure.

## Development

### Adding New Query Templates

Edit `index.html` sidebar section:

```html
<div class="sample-query" onclick="loadQuery(`YOUR_QUERY`)">
  <div class="title">Your Query Title</div>
  <div class="query">Description</div>
</div>
```

### Customizing Visualization

Edit vis.js options in `index.html`:

```javascript
const options = {
  nodes: {
    shape: 'dot',
    size: 25,
    // ... customize node appearance
  },
  edges: {
    // ... customize edge appearance
  }
};
```

## Keyboard Shortcuts

- `Cmd+Enter` / `Ctrl+Enter` - Run query
- Arrow keys - Navigate editor
- Tab - Indent in editor

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
kill -9 $(lsof -ti:3000)
```

### Database Not Initialized

Refresh the page or restart the server.

### Query Syntax Errors

Check the console for detailed error messages. Common issues:
- Missing quotes around strings
- Incorrect method names
- Invalid filter syntax

## Comparison to Neo4j Aura

| Feature | Neo4j Aura | sqlite-graph Browser |
|---------|------------|---------------------|
| Graph Visualization | ✅ | ✅ |
| Query Editor | ✅ (Cypher) | ✅ (JavaScript DSL) |
| Dark Theme | ✅ | ✅ |
| Multiple Views | ✅ | ✅ (Graph/Table/JSON) |
| Sample Data | ✅ | ✅ |
| Export | ✅ | ✅ |
| Cloud Hosted | ✅ | ❌ (Local only) |
| Cypher Support | ✅ | ⏳ (Planned) |

## Roadmap

- [ ] Cypher-style query language support
- [ ] Graph editing (create/update/delete)
- [ ] Multiple database connections
- [ ] Query history
- [ ] Saved queries
- [ ] Schema visualization
- [ ] Performance profiling
- [ ] Collaborative features

## License

MIT - Same as sqlite-graph

## Credits

**Development Team:** Michael O'Boyle and Claude Code
**Inspiration:** Neo4j Aura Browser
**Built With:** Express, vis.js, CodeMirror, TypeScript

---

**Happy Graphing!** 🗺️
