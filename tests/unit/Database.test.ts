import { GraphDatabase } from '../../src/core/Database';
import { Node, Edge, GraphSchema, GraphExport } from '../../src/types';
import { TransactionAlreadyFinalizedError } from '../../src/core/Transaction';

describe('GraphDatabase', () => {
  let db: GraphDatabase;

  beforeEach(() => {
    // Use in-memory database for testing
    db = new GraphDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('constructor', () => {
    it('should create database with in-memory path', () => {
      const testDb = new GraphDatabase(':memory:');
      expect(testDb).toBeDefined();
      testDb.close();
    });

    it('should create database with schema validation', () => {
      const schema: GraphSchema = {
        nodes: {
          Job: { properties: ['title', 'status'] },
          Company: { properties: ['name'] }
        },
        edges: {
          POSTED_BY: { from: 'Job', to: 'Company' }
        }
      };

      const testDb = new GraphDatabase(':memory:', { schema });
      expect(testDb).toBeDefined();
      testDb.close();
    });

    it('should create database with custom options', () => {
      const testDb = new GraphDatabase(':memory:', {
        timeout: 5000,
        verbose: console.log
      });
      expect(testDb).toBeDefined();
      testDb.close();
    });
  });

  describe('createNode', () => {
    it('should create node with valid type and properties', () => {
      const node = db.createNode('Job', {
        title: 'Senior Engineer',
        status: 'active',
        salary: 150000
      });

      expect(node).toBeDefined();
      expect(node.id).toBeGreaterThan(0);
      expect(node.type).toBe('Job');
      expect(node.properties.title).toBe('Senior Engineer');
      expect(node.properties.status).toBe('active');
      expect(node.properties.salary).toBe(150000);
      expect(node.createdAt).toBeInstanceOf(Date);
      expect(node.updatedAt).toBeInstanceOf(Date);
    });

    it('should create node with nested object properties', () => {
      const node = db.createNode('Job', {
        title: 'Engineer',
        salary: { min: 100000, max: 150000 },
        location: { city: 'San Francisco', state: 'CA' }
      });

      expect(node.properties.salary).toEqual({ min: 100000, max: 150000 });
      expect(node.properties.location).toEqual({ city: 'San Francisco', state: 'CA' });
    });

    it('should create node with array properties', () => {
      const node = db.createNode('Job', {
        title: 'Engineer',
        skills: ['JavaScript', 'TypeScript', 'React'],
        tags: [1, 2, 3]
      });

      expect(node.properties.skills).toEqual(['JavaScript', 'TypeScript', 'React']);
      expect(node.properties.tags).toEqual([1, 2, 3]);
    });

    it('should create node with empty properties', () => {
      const node = db.createNode('Job', {});

      expect(node.id).toBeGreaterThan(0);
      expect(node.properties).toEqual({});
    });

    it('should create multiple nodes with auto-incrementing IDs', () => {
      const node1 = db.createNode('Job', { title: 'Job 1' });
      const node2 = db.createNode('Job', { title: 'Job 2' });
      const node3 = db.createNode('Company', { name: 'Company 1' });

      expect(node2.id).toBe(node1.id + 1);
      expect(node3.id).toBe(node2.id + 1);
    });

    it('should throw error for invalid node type', () => {
      expect(() => db.createNode('', { title: 'Test' })).toThrow('Node type must be a non-empty string');
      // Note: Whitespace-only strings are considered valid by the current validation
    });

    it('should enforce schema validation when schema is defined', () => {
      const schema: GraphSchema = {
        nodes: {
          Job: { properties: ['title', 'status'] }
        },
        edges: {}
      };

      const schemaDb = new GraphDatabase(':memory:', { schema });

      // Valid node type
      const validNode = schemaDb.createNode('Job', { title: 'Engineer' });
      expect(validNode).toBeDefined();

      // Invalid node type
      expect(() => schemaDb.createNode('InvalidType', { name: 'Test' })).toThrow();

      schemaDb.close();
    });
  });

  describe('getNode', () => {
    it('should retrieve existing node by ID', () => {
      const created = db.createNode('Job', { title: 'Engineer', status: 'active' });
      const retrieved = db.getNode(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.type).toBe('Job');
      expect(retrieved?.properties.title).toBe('Engineer');
      expect(retrieved?.properties.status).toBe('active');
    });

    it('should return null for non-existent node', () => {
      const node = db.getNode(99999);
      expect(node).toBeNull();
    });

    it('should throw error for invalid node ID', () => {
      expect(() => db.getNode(0)).toThrow();
      expect(() => db.getNode(-1)).toThrow();
      expect(() => db.getNode(1.5)).toThrow();
    });

    it('should retrieve node with complex nested properties', () => {
      const created = db.createNode('Job', {
        title: 'Engineer',
        metadata: {
          views: 100,
          applicants: 50,
          nested: { deep: { value: 'test' } }
        }
      });

      const retrieved = db.getNode(created.id);
      expect(retrieved?.properties.metadata).toEqual({
        views: 100,
        applicants: 50,
        nested: { deep: { value: 'test' } }
      });
    });
  });

  describe('updateNode', () => {
    it('should update node properties', () => {
      const created = db.createNode('Job', { title: 'Engineer', status: 'draft' });
      const updated = db.updateNode(created.id, { status: 'active', views: 100 });

      expect(updated.id).toBe(created.id);
      expect(updated.properties.title).toBe('Engineer'); // Original property retained
      expect(updated.properties.status).toBe('active'); // Updated property
      expect(updated.properties.views).toBe(100); // New property
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('should merge properties instead of replacing', () => {
      const created = db.createNode('Job', {
        title: 'Engineer',
        status: 'draft',
        salary: 100000
      });

      const updated = db.updateNode(created.id, { status: 'active' });

      expect(updated.properties).toEqual({
        title: 'Engineer',
        status: 'active',
        salary: 100000
      });
    });

    it('should update nested properties', () => {
      const created = db.createNode('Job', {
        title: 'Engineer',
        metadata: { views: 10 }
      });

      const updated = db.updateNode(created.id, {
        metadata: { views: 20, likes: 5 }
      });

      expect(updated.properties.metadata).toEqual({ views: 20, likes: 5 });
    });

    it('should throw error for non-existent node', () => {
      expect(() => db.updateNode(99999, { status: 'active' })).toThrow('Node with ID 99999 not found');
    });

    it('should throw error for invalid node ID', () => {
      expect(() => db.updateNode(0, { status: 'active' })).toThrow();
      expect(() => db.updateNode(-1, { status: 'active' })).toThrow();
    });

    it('should allow updating with empty properties object', () => {
      const created = db.createNode('Job', { title: 'Engineer' });
      const updated = db.updateNode(created.id, {});

      expect(updated.properties).toEqual(created.properties);
    });
  });

  describe('deleteNode', () => {
    it('should delete existing node', () => {
      const node = db.createNode('Job', { title: 'Engineer' });
      const deleted = db.deleteNode(node.id);

      expect(deleted).toBe(true);
      expect(db.getNode(node.id)).toBeNull();
    });

    it('should return false for non-existent node', () => {
      const deleted = db.deleteNode(99999);
      expect(deleted).toBe(false);
    });

    it('should delete node and cascade delete edges', () => {
      const job = db.createNode('Job', { title: 'Engineer' });
      const company = db.createNode('Company', { name: 'TechCorp' });
      const edge = db.createEdge('POSTED_BY', job.id, company.id);

      // Delete the job node
      db.deleteNode(job.id);

      // Verify node is deleted
      expect(db.getNode(job.id)).toBeNull();

      // Verify edge is also deleted (cascade)
      expect(db.getEdge(edge.id)).toBeNull();
    });

    it('should throw error for invalid node ID', () => {
      expect(() => db.deleteNode(0)).toThrow();
      expect(() => db.deleteNode(-1)).toThrow();
    });

    it('should handle deleting node multiple times', () => {
      const node = db.createNode('Job', { title: 'Engineer' });

      const firstDelete = db.deleteNode(node.id);
      expect(firstDelete).toBe(true);

      const secondDelete = db.deleteNode(node.id);
      expect(secondDelete).toBe(false);
    });
  });

  describe('createEdge', () => {
    let jobNode: Node;
    let companyNode: Node;

    beforeEach(() => {
      jobNode = db.createNode('Job', { title: 'Engineer' });
      companyNode = db.createNode('Company', { name: 'TechCorp' });
    });

    it('should create edge between two nodes', () => {
      const edge = db.createEdge('POSTED_BY', jobNode.id, companyNode.id);

      expect(edge).toBeDefined();
      expect(edge.id).toBeGreaterThan(0);
      expect(edge.type).toBe('POSTED_BY');
      expect(edge.from).toBe(jobNode.id);
      expect(edge.to).toBe(companyNode.id);
      expect(edge.createdAt).toBeInstanceOf(Date);
    });

    it('should create edge with properties', () => {
      const edge = db.createEdge('REQUIRES', jobNode.id, companyNode.id, {
        level: 'expert',
        required: true,
        years: 5
      });

      expect(edge.properties).toEqual({
        level: 'expert',
        required: true,
        years: 5
      });
    });

    it('should create edge without properties', () => {
      const edge = db.createEdge('POSTED_BY', jobNode.id, companyNode.id);
      expect(edge.properties).toBeUndefined();
    });

    it('should create multiple edges between same nodes with different types', () => {
      const edge1 = db.createEdge('POSTED_BY', jobNode.id, companyNode.id);
      const edge2 = db.createEdge('VERIFIED_BY', jobNode.id, companyNode.id);

      expect(edge1.id).not.toBe(edge2.id);
      expect(edge1.type).toBe('POSTED_BY');
      expect(edge2.type).toBe('VERIFIED_BY');
    });

    it('should throw error for non-existent source node', () => {
      expect(() => db.createEdge('POSTED_BY', 99999, companyNode.id)).toThrow('Source node with ID 99999 not found');
    });

    it('should throw error for non-existent target node', () => {
      expect(() => db.createEdge('POSTED_BY', jobNode.id, 99999)).toThrow('Target node with ID 99999 not found');
    });

    it('should throw error for invalid edge type', () => {
      expect(() => db.createEdge('', jobNode.id, companyNode.id)).toThrow('Edge type must be a non-empty string');
      // Note: Whitespace-only strings are considered valid by the current validation
    });

    it('should throw error for invalid node IDs', () => {
      expect(() => db.createEdge('POSTED_BY', 0, companyNode.id)).toThrow();
      expect(() => db.createEdge('POSTED_BY', jobNode.id, -1)).toThrow();
    });

    it('should allow self-referencing edges', () => {
      const edge = db.createEdge('SIMILAR_TO', jobNode.id, jobNode.id);

      expect(edge.from).toBe(jobNode.id);
      expect(edge.to).toBe(jobNode.id);
    });
  });

  describe('getEdge', () => {
    it('should retrieve existing edge by ID', () => {
      const job = db.createNode('Job', { title: 'Engineer' });
      const company = db.createNode('Company', { name: 'TechCorp' });
      const created = db.createEdge('POSTED_BY', job.id, company.id, { verified: true });

      const retrieved = db.getEdge(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.type).toBe('POSTED_BY');
      expect(retrieved?.from).toBe(job.id);
      expect(retrieved?.to).toBe(company.id);
      expect(retrieved?.properties).toEqual({ verified: true });
    });

    it('should return null for non-existent edge', () => {
      const edge = db.getEdge(99999);
      expect(edge).toBeNull();
    });

    it('should throw error for invalid edge ID', () => {
      expect(() => db.getEdge(0)).toThrow();
      expect(() => db.getEdge(-1)).toThrow();
    });
  });

  describe('deleteEdge', () => {
    it('should delete existing edge', () => {
      const job = db.createNode('Job', { title: 'Engineer' });
      const company = db.createNode('Company', { name: 'TechCorp' });
      const edge = db.createEdge('POSTED_BY', job.id, company.id);

      const deleted = db.deleteEdge(edge.id);

      expect(deleted).toBe(true);
      expect(db.getEdge(edge.id)).toBeNull();
    });

    it('should return false for non-existent edge', () => {
      const deleted = db.deleteEdge(99999);
      expect(deleted).toBe(false);
    });

    it('should not delete nodes when edge is deleted', () => {
      const job = db.createNode('Job', { title: 'Engineer' });
      const company = db.createNode('Company', { name: 'TechCorp' });
      const edge = db.createEdge('POSTED_BY', job.id, company.id);

      db.deleteEdge(edge.id);

      expect(db.getNode(job.id)).toBeDefined();
      expect(db.getNode(company.id)).toBeDefined();
    });

    it('should throw error for invalid edge ID', () => {
      expect(() => db.deleteEdge(0)).toThrow();
      expect(() => db.deleteEdge(-1)).toThrow();
    });
  });

  describe('transaction', () => {
    it('should commit transaction on success', () => {
      const result = db.transaction(() => {
        const job = db.createNode('Job', { title: 'Engineer' });
        const company = db.createNode('Company', { name: 'TechCorp' });
        db.createEdge('POSTED_BY', job.id, company.id);
        return { job, company };
      });

      expect(result.job).toBeDefined();
      expect(result.company).toBeDefined();
      expect(db.getNode(result.job.id)).toBeDefined();
      expect(db.getNode(result.company.id)).toBeDefined();
    });

    it('should rollback transaction on error', () => {
      expect(() => {
        db.transaction(() => {
          db.createNode('Job', { title: 'Engineer' });
          throw new Error('Test error');
        });
      }).toThrow('Test error');

      // Verify rollback - no nodes should exist
      const allNodes = db.nodes('Job').exec();
      expect(allNodes).toHaveLength(0);
    });

    it('should support manual commit', () => {
      db.transaction((ctx) => {
        db.createNode('Job', { title: 'Engineer' });
        ctx.commit();
      });

      const nodes = db.nodes('Job').exec();
      expect(nodes).toHaveLength(1);
    });

    it('should support manual rollback', () => {
      db.transaction((ctx) => {
        db.createNode('Job', { title: 'Engineer' });
        ctx.rollback();
      });

      const nodes = db.nodes('Job').exec();
      expect(nodes).toHaveLength(0);
    });

    it('should support savepoints', () => {
      db.transaction((ctx) => {
        const job1 = db.createNode('Job', { title: 'Job 1' });
        ctx.savepoint('sp1');

        const job2 = db.createNode('Job', { title: 'Job 2' });
        ctx.rollbackTo('sp1');

        const job3 = db.createNode('Job', { title: 'Job 3' });
      });

      const jobs = db.nodes('Job').exec();
      expect(jobs).toHaveLength(2);
      expect(jobs.map(j => j.properties.title).sort()).toEqual(['Job 1', 'Job 3']);
    });

    it('should throw error when committing finalized transaction', () => {
      expect(() => {
        db.transaction((ctx) => {
          ctx.commit();
          ctx.commit(); // Second commit should throw
        });
      }).toThrow(TransactionAlreadyFinalizedError);
    });

    it('should throw error when rolling back finalized transaction', () => {
      expect(() => {
        db.transaction((ctx) => {
          ctx.commit();
          ctx.rollback(); // Rollback after commit should throw
        });
      }).toThrow(TransactionAlreadyFinalizedError);
    });

    it('should handle nested savepoints', () => {
      db.transaction((ctx) => {
        db.createNode('Job', { title: 'Job 1' });
        ctx.savepoint('sp1');

        db.createNode('Job', { title: 'Job 2' });
        ctx.savepoint('sp2');

        db.createNode('Job', { title: 'Job 3' });
        ctx.rollbackTo('sp2');

        db.createNode('Job', { title: 'Job 4' });
      });

      const jobs = db.nodes('Job').exec();
      expect(jobs).toHaveLength(3);
      expect(jobs.map(j => j.properties.title).sort()).toEqual(['Job 1', 'Job 2', 'Job 4']);
    });

    it('should return transaction function result', () => {
      const result = db.transaction(() => {
        return { value: 42, message: 'success' };
      });

      expect(result).toEqual({ value: 42, message: 'success' });
    });
  });

  describe('export', () => {
    it('should export empty database', () => {
      const exported = db.export();

      expect(exported.nodes).toEqual([]);
      expect(exported.edges).toEqual([]);
      expect(exported.metadata).toBeDefined();
      expect(exported.metadata?.version).toBe('1');
      expect(exported.metadata?.exportedAt).toBeDefined();
    });

    it('should export nodes only', () => {
      db.createNode('Job', { title: 'Engineer' });
      db.createNode('Company', { name: 'TechCorp' });

      const exported = db.export();

      expect(exported.nodes).toHaveLength(2);
      expect(exported.edges).toHaveLength(0);
    });

    it('should export nodes and edges', () => {
      const job = db.createNode('Job', { title: 'Engineer' });
      const company = db.createNode('Company', { name: 'TechCorp' });
      db.createEdge('POSTED_BY', job.id, company.id);

      const exported = db.export();

      expect(exported.nodes).toHaveLength(2);
      expect(exported.edges).toHaveLength(1);
      expect(exported.edges[0].type).toBe('POSTED_BY');
    });

    it('should preserve all node properties in export', () => {
      const created = db.createNode('Job', {
        title: 'Engineer',
        nested: { value: 'test' },
        array: [1, 2, 3]
      });

      const exported = db.export();

      expect(exported.nodes[0].properties).toEqual(created.properties);
    });

    it('should preserve all edge properties in export', () => {
      const job = db.createNode('Job', { title: 'Engineer' });
      const company = db.createNode('Company', { name: 'TechCorp' });
      db.createEdge('POSTED_BY', job.id, company.id, { verified: true, rating: 5 });

      const exported = db.export();

      expect(exported.edges[0].properties).toEqual({ verified: true, rating: 5 });
    });

    it('should include timestamps in export', () => {
      const node = db.createNode('Job', { title: 'Engineer' });
      const exported = db.export();

      expect(exported.nodes[0].createdAt).toBeInstanceOf(Date);
      expect(exported.nodes[0].updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('import', () => {
    it('should import empty dataset', () => {
      const data: GraphExport = {
        nodes: [],
        edges: [],
        metadata: { version: '1', exportedAt: new Date().toISOString() }
      };

      db.import(data);

      const exported = db.export();
      expect(exported.nodes).toHaveLength(0);
      expect(exported.edges).toHaveLength(0);
    });

    it('should import nodes only', () => {
      const data: GraphExport = {
        nodes: [
          { id: 1, type: 'Job', properties: { title: 'Engineer' }, createdAt: new Date(), updatedAt: new Date() },
          { id: 2, type: 'Company', properties: { name: 'TechCorp' }, createdAt: new Date(), updatedAt: new Date() }
        ],
        edges: [],
        metadata: { version: '1', exportedAt: new Date().toISOString() }
      };

      db.import(data);

      const nodes = db.nodes('Job').exec();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].properties.title).toBe('Engineer');
    });

    it('should import nodes and edges', () => {
      const data: GraphExport = {
        nodes: [
          { id: 1, type: 'Job', properties: { title: 'Engineer' }, createdAt: new Date(), updatedAt: new Date() },
          { id: 2, type: 'Company', properties: { name: 'TechCorp' }, createdAt: new Date(), updatedAt: new Date() }
        ],
        edges: [
          { id: 1, type: 'POSTED_BY', from: 1, to: 2, createdAt: new Date() }
        ],
        metadata: { version: '1', exportedAt: new Date().toISOString() }
      };

      db.import(data);

      const exported = db.export();
      expect(exported.nodes).toHaveLength(2);
      expect(exported.edges).toHaveLength(1);
    });

    it('should handle import in transaction', () => {
      const data: GraphExport = {
        nodes: [
          { id: 1, type: 'Job', properties: { title: 'Engineer' }, createdAt: new Date(), updatedAt: new Date() }
        ],
        edges: [],
        metadata: { version: '1', exportedAt: new Date().toISOString() }
      };

      db.import(data);

      // Verify transaction completed
      const nodes = db.nodes('Job').exec();
      expect(nodes).toHaveLength(1);
    });

    it('should rollback import on error', () => {
      const data: GraphExport = {
        nodes: [
          { id: 1, type: 'Job', properties: { title: 'Engineer' }, createdAt: new Date(), updatedAt: new Date() }
        ],
        edges: [
          // Edge with non-existent node IDs
          { id: 1, type: 'POSTED_BY', from: 999, to: 1000, createdAt: new Date() }
        ],
        metadata: { version: '1', exportedAt: new Date().toISOString() }
      };

      expect(() => db.import(data)).toThrow();

      // Verify rollback - no nodes should be imported
      const nodes = db.nodes('Job').exec();
      expect(nodes).toHaveLength(0);
    });

    it('should preserve complex properties on import', () => {
      const data: GraphExport = {
        nodes: [
          {
            id: 1,
            type: 'Job',
            properties: {
              title: 'Engineer',
              nested: { deep: { value: 'test' } },
              array: [1, 2, 3]
            },
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        edges: [],
        metadata: { version: '1', exportedAt: new Date().toISOString() }
      };

      db.import(data);

      const nodes = db.nodes('Job').exec();
      expect(nodes[0].properties.nested).toEqual({ deep: { value: 'test' } });
      expect(nodes[0].properties.array).toEqual([1, 2, 3]);
    });

    it('should handle round-trip export/import', () => {
      // Create original data
      const job = db.createNode('Job', { title: 'Engineer', status: 'active' });
      const company = db.createNode('Company', { name: 'TechCorp' });
      db.createEdge('POSTED_BY', job.id, company.id, { verified: true });

      // Export
      const exported = db.export();

      // Create new database and import
      const newDb = new GraphDatabase(':memory:');
      newDb.import(exported);

      // Verify
      const newExported = newDb.export();
      expect(newExported.nodes).toHaveLength(2);
      expect(newExported.edges).toHaveLength(1);
      expect(newExported.nodes.find(n => n.type === 'Job')?.properties.title).toBe('Engineer');

      newDb.close();
    });
  });

  describe('nodes', () => {
    it('should return NodeQuery instance', () => {
      const query = db.nodes('Job');
      expect(query).toBeDefined();
      expect(typeof query.exec).toBe('function');
    });

    it('should execute basic query', () => {
      db.createNode('Job', { title: 'Engineer' });
      db.createNode('Job', { title: 'Designer' });

      const jobs = db.nodes('Job').exec();
      expect(jobs).toHaveLength(2);
    });
  });

  describe('traverse', () => {
    it('should return TraversalQuery instance', () => {
      const node = db.createNode('Job', { title: 'Engineer' });
      const query = db.traverse(node.id);

      expect(query).toBeDefined();
    });

    it('should throw error for non-existent start node', () => {
      expect(() => db.traverse(99999)).toThrow('Start node with ID 99999 not found');
    });

    it('should throw error for invalid node ID', () => {
      expect(() => db.traverse(0)).toThrow();
      expect(() => db.traverse(-1)).toThrow();
    });
  });

  describe('close', () => {
    it('should close database connection', () => {
      const testDb = new GraphDatabase(':memory:');
      testDb.close();

      // After close, operations should fail
      expect(() => testDb.createNode('Job', { title: 'Test' })).toThrow();
    });

    it('should handle multiple close calls', () => {
      const testDb = new GraphDatabase(':memory:');
      testDb.close();

      // Second close might throw, but shouldn't crash
      expect(() => testDb.close()).not.toThrow();
    });
  });

  describe('getRawDb', () => {
    it('should return underlying SQLite database instance', () => {
      const rawDb = db.getRawDb();

      expect(rawDb).toBeDefined();
      expect(typeof rawDb.prepare).toBe('function');
      expect(typeof rawDb.exec).toBe('function');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle very long strings in properties', () => {
      const longString = 'a'.repeat(10000);
      const node = db.createNode('Job', { description: longString });

      expect(node.properties.description).toBe(longString);
    });

    it('should handle unicode characters in properties', () => {
      const node = db.createNode('Job', {
        title: '工程师',
        emoji: '🚀💻🔥',
        special: 'Çüé'
      });

      expect(node.properties.title).toBe('工程师');
      expect(node.properties.emoji).toBe('🚀💻🔥');
    });

    it('should handle null and undefined in properties', () => {
      const node = db.createNode('Job', {
        title: 'Engineer',
        optionalField: null,
        undefinedField: undefined
      });

      expect(node.properties.optionalField).toBeNull();
      expect(node.properties.undefinedField).toBeUndefined();
    });

    it('should handle boolean values in properties', () => {
      const node = db.createNode('Job', {
        active: true,
        remote: false
      });

      expect(node.properties.active).toBe(true);
      expect(node.properties.remote).toBe(false);
    });

    it('should handle date objects in properties', () => {
      const date = new Date('2025-10-28T12:00:00Z');
      const node = db.createNode('Job', { postedDate: date });

      // Date objects are serialized to ISO strings via JSON.stringify
      expect(node.properties.postedDate).toBe(date.toISOString());
    });

    it('should handle mixed type arrays', () => {
      const node = db.createNode('Job', {
        mixed: [1, 'string', true, null, { nested: 'object' }]
      });

      expect(node.properties.mixed).toEqual([1, 'string', true, null, { nested: 'object' }]);
    });

    it('should handle large number of nodes', () => {
      const count = 1000;
      for (let i = 0; i < count; i++) {
        db.createNode('Job', { index: i });
      }

      const nodes = db.nodes('Job').exec();
      expect(nodes.length).toBe(count);
    });

    it('should handle large number of edges', () => {
      const node1 = db.createNode('Hub', { name: 'Hub' });
      const count = 500;

      for (let i = 0; i < count; i++) {
        const node = db.createNode('Node', { index: i });
        db.createEdge('CONNECTS', node1.id, node.id);
      }

      const exported = db.export();
      expect(exported.edges.length).toBe(count);
    });
  });
});
