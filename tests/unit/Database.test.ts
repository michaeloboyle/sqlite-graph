import { GraphDatabase } from '../../src/core/Database';
import { Node, Edge, GraphSchema, GraphExport } from '../../src/types';
import { TransactionAlreadyFinalizedError } from '../../src/core/Transaction';

describe('GraphDatabase', () => {
  let db: GraphDatabase;

  beforeEach(() => {
    // Use in-memory database for testing
    db = new GraphDatabase(':memory:');
  });

  afterEach(async () => {
    await db.close();
  });

  describe('constructor', () => {
    it('should create database with in-memory path', async () => {
      const testDb = new GraphDatabase(':memory:');
      expect(testDb).toBeDefined();
      await testDb.close();
    });

    it('should create database with schema validation', async () => {
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
      await testDb.close();
    });

    it('should create database with custom options', async () => {
      const testDb = new GraphDatabase(':memory:', {
        timeout: 5000,
        verbose: console.log
      });
      expect(testDb).toBeDefined();
      await testDb.close();
    });
  });

  describe('createNode', () => {
    it('should create node with valid type and properties', async () => {
      const node = await db.createNode('Job', {
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

    it('should create node with nested object properties', async () => {
      const node = await db.createNode('Job', {
        title: 'Engineer',
        salary: { min: 100000, max: 150000 },
        location: { city: 'San Francisco', state: 'CA' }
      });

      expect(node.properties.salary).toEqual({ min: 100000, max: 150000 });
      expect(node.properties.location).toEqual({ city: 'San Francisco', state: 'CA' });
    });

    it('should create node with array properties', async () => {
      const node = await db.createNode('Job', {
        title: 'Engineer',
        skills: ['JavaScript', 'TypeScript', 'React'],
        tags: [1, 2, 3]
      });

      expect(node.properties.skills).toEqual(['JavaScript', 'TypeScript', 'React']);
      expect(node.properties.tags).toEqual([1, 2, 3]);
    });

    it('should create node with empty properties', async () => {
      const node = await db.createNode('Job', {});

      expect(node.id).toBeGreaterThan(0);
      expect(node.properties).toEqual({});
    });

    it('should create multiple nodes with auto-incrementing IDs', async () => {
      const node1 = await db.createNode('Job', { title: 'Job 1' });
      const node2 = await db.createNode('Job', { title: 'Job 2' });
      const node3 = await db.createNode('Company', { name: 'Company 1' });

      expect(node2.id).toBe(node1.id + 1);
      expect(node3.id).toBe(node2.id + 1);
    });

    it('should throw error for invalid node type', async () => {
      await expect(db.createNode('', { title: 'Test' })).rejects.toThrow('Node type must be a non-empty string');
      // Note: Whitespace-only strings are considered valid by the current validation
    });

    it('should enforce schema validation when schema is defined', async () => {
      const schema: GraphSchema = {
        nodes: {
          Job: { properties: ['title', 'status'] }
        },
        edges: {}
      };

      const schemaDb = new GraphDatabase(':memory:', { schema });

      // Valid node type
      const validNode = await schemaDb.createNode('Job', { title: 'Engineer' });
      expect(validNode).toBeDefined();

      // Invalid node type
      await expect(schemaDb.createNode('InvalidType', { name: 'Test' })).rejects.toThrow();

      await schemaDb.close();
    });
  });

  describe('getNode', () => {
    it('should retrieve existing node by ID', async () => {
      const created = await db.createNode('Job', { title: 'Engineer', status: 'active' });
      const retrieved = await db.getNode(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.type).toBe('Job');
      expect(retrieved?.properties.title).toBe('Engineer');
      expect(retrieved?.properties.status).toBe('active');
    });

    it('should return null for non-existent node', async () => {
      const node = await db.getNode(99999);
      expect(node).toBeNull();
    });

    it('should throw error for invalid node ID', async () => {
      await expect(db.getNode(0)).rejects.toThrow();
      await expect(db.getNode(-1)).rejects.toThrow();
      await expect(db.getNode(1.5)).rejects.toThrow();
    });

    it('should retrieve node with complex nested properties', async () => {
      const created = await db.createNode('Job', {
        title: 'Engineer',
        metadata: {
          views: 100,
          applicants: 50,
          nested: { deep: { value: 'test' } }
        }
      });

      const retrieved = await db.getNode(created.id);
      expect(retrieved?.properties.metadata).toEqual({
        views: 100,
        applicants: 50,
        nested: { deep: { value: 'test' } }
      });
    });
  });

  describe('updateNode', () => {
    it('should update node properties', async () => {
      const created = await db.createNode('Job', { title: 'Engineer', status: 'draft' });
      const updated = await db.updateNode(created.id, { status: 'active', views: 100 });

      expect(updated.id).toBe(created.id);
      expect(updated.properties.title).toBe('Engineer'); // Original property retained
      expect(updated.properties.status).toBe('active'); // Updated property
      expect(updated.properties.views).toBe(100); // New property
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('should merge properties instead of replacing', async () => {
      const created = await db.createNode('Job', {
        title: 'Engineer',
        status: 'draft',
        salary: 100000
      });

      const updated = await db.updateNode(created.id, { status: 'active' });

      expect(updated.properties).toEqual({
        title: 'Engineer',
        status: 'active',
        salary: 100000
      });
    });

    it('should update nested properties', async () => {
      const created = await db.createNode('Job', {
        title: 'Engineer',
        metadata: { views: 10 }
      });

      const updated = await db.updateNode(created.id, {
        metadata: { views: 20, likes: 5 }
      });

      expect(updated.properties.metadata).toEqual({ views: 20, likes: 5 });
    });

    it('should throw error for non-existent node', async () => {
      await expect(db.updateNode(99999, { status: 'active' })).rejects.toThrow('Node with ID 99999 not found');
    });

    it('should throw error for invalid node ID', async () => {
      await expect(db.updateNode(0, { status: 'active' })).rejects.toThrow();
      await expect(db.updateNode(-1, { status: 'active' })).rejects.toThrow();
    });

    it('should allow updating with empty properties object', async () => {
      const created = await db.createNode('Job', { title: 'Engineer' });
      const updated = await db.updateNode(created.id, {});

      expect(updated.properties).toEqual(created.properties);
    });
  });

  describe('deleteNode', () => {
    it('should delete existing node', async () => {
      const node = await db.createNode('Job', { title: 'Engineer' });
      const deleted = await db.deleteNode(node.id);

      expect(deleted).toBe(true);
      expect(await db.getNode(node.id)).toBeNull();
    });

    it('should return false for non-existent node', async () => {
      const deleted = await db.deleteNode(99999);
      expect(deleted).toBe(false);
    });

    it('should delete node and cascade delete edges', async () => {
      const job = await db.createNode('Job', { title: 'Engineer' });
      const company = await db.createNode('Company', { name: 'TechCorp' });
      const edge = await db.createEdge(job.id, 'POSTED_BY', company.id);

      // Delete the job node
      await db.deleteNode(job.id);

      // Verify node is deleted
      expect(await db.getNode(job.id)).toBeNull();

      // Verify edge is also deleted (cascade)
      expect(await db.getEdge(edge.id)).toBeNull();
    });

    it('should throw error for invalid node ID', async () => {
      await expect(db.deleteNode(0)).rejects.toThrow();
      await expect(db.deleteNode(-1)).rejects.toThrow();
    });

    it('should handle deleting node multiple times', async () => {
      const node = await db.createNode('Job', { title: 'Engineer' });

      const firstDelete = await db.deleteNode(node.id);
      expect(firstDelete).toBe(true);

      const secondDelete = await db.deleteNode(node.id);
      expect(secondDelete).toBe(false);
    });
  });

  describe('createEdge', () => {
    let jobNode: Node;
    let companyNode: Node;

    beforeEach(async () => {
      jobNode = await db.createNode('Job', { title: 'Engineer' });
      companyNode = await db.createNode('Company', { name: 'TechCorp' });
    });

    it('should create edge between two nodes', async () => {
      const edge = await db.createEdge(jobNode.id, 'POSTED_BY', companyNode.id);

      expect(edge).toBeDefined();
      expect(edge.id).toBeGreaterThan(0);
      expect(edge.type).toBe('POSTED_BY');
      expect(edge.from).toBe(jobNode.id);
      expect(edge.to).toBe(companyNode.id);
      expect(edge.createdAt).toBeInstanceOf(Date);
    });

    it('should create edge with properties', async () => {
      const edge = await db.createEdge(jobNode.id, 'REQUIRES', companyNode.id, {
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

    it('should create edge without properties', async () => {
      const edge = await db.createEdge(jobNode.id, 'POSTED_BY', companyNode.id);
      expect(edge.properties).toBeUndefined();
    });

    it('should create multiple edges between same nodes with different types', async () => {
      const edge1 = await db.createEdge(jobNode.id, 'POSTED_BY', companyNode.id);
      const edge2 = await db.createEdge(jobNode.id, 'VERIFIED_BY', companyNode.id);

      expect(edge1.id).not.toBe(edge2.id);
      expect(edge1.type).toBe('POSTED_BY');
      expect(edge2.type).toBe('VERIFIED_BY');
    });

    it('should throw error for non-existent source node', async () => {
      await expect(db.createEdge(99999, 'POSTED_BY', companyNode.id)).rejects.toThrow('Source node with ID 99999 not found');
    });

    it('should throw error for non-existent target node', async () => {
      await expect(db.createEdge(jobNode.id, 'POSTED_BY', 99999)).rejects.toThrow('Target node with ID 99999 not found');
    });

    it('should throw error for invalid edge type', async () => {
      await expect(db.createEdge(jobNode.id, '', companyNode.id)).rejects.toThrow('Edge type must be a non-empty string');
      // Note: Whitespace-only strings are considered valid by the current validation
    });

    it('should throw error for invalid node IDs', async () => {
      await expect(db.createEdge(0, 'POSTED_BY', companyNode.id)).rejects.toThrow();
      await expect(db.createEdge(jobNode.id, 'POSTED_BY', -1)).rejects.toThrow();
    });

    it('should allow self-referencing edges', async () => {
      const edge = await db.createEdge(jobNode.id, 'SIMILAR_TO', jobNode.id);

      expect(edge.from).toBe(jobNode.id);
      expect(edge.to).toBe(jobNode.id);
    });
  });

  describe('getEdge', () => {
    it('should retrieve existing edge by ID', async () => {
      const job = await db.createNode('Job', { title: 'Engineer' });
      const company = await db.createNode('Company', { name: 'TechCorp' });
      const created = await db.createEdge(job.id, 'POSTED_BY', company.id, { verified: true });

      const retrieved = await db.getEdge(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.type).toBe('POSTED_BY');
      expect(retrieved?.from).toBe(job.id);
      expect(retrieved?.to).toBe(company.id);
      expect(retrieved?.properties).toEqual({ verified: true });
    });

    it('should return null for non-existent edge', async () => {
      const edge = await db.getEdge(99999);
      expect(edge).toBeNull();
    });

    it('should throw error for invalid edge ID', async () => {
      await expect(db.getEdge(0)).rejects.toThrow();
      await expect(db.getEdge(-1)).rejects.toThrow();
    });
  });

  describe('deleteEdge', () => {
    it('should delete existing edge', async () => {
      const job = await db.createNode('Job', { title: 'Engineer' });
      const company = await db.createNode('Company', { name: 'TechCorp' });
      const edge = await db.createEdge(job.id, 'POSTED_BY', company.id);

      const deleted = await db.deleteEdge(edge.id);

      expect(deleted).toBe(true);
      expect(await db.getEdge(edge.id)).toBeNull();
    });

    it('should return false for non-existent edge', async () => {
      const deleted = await db.deleteEdge(99999);
      expect(deleted).toBe(false);
    });

    it('should not delete nodes when edge is deleted', async () => {
      const job = await db.createNode('Job', { title: 'Engineer' });
      const company = await db.createNode('Company', { name: 'TechCorp' });
      const edge = await db.createEdge(job.id, 'POSTED_BY', company.id);

      await db.deleteEdge(edge.id);

      expect(await db.getNode(job.id)).toBeDefined();
      expect(await db.getNode(company.id)).toBeDefined();
    });

    it('should throw error for invalid edge ID', async () => {
      await expect(db.deleteEdge(0)).rejects.toThrow();
      await expect(db.deleteEdge(-1)).rejects.toThrow();
    });
  });

  describe('transaction', () => {
    it('should commit transaction on success', async () => {
      const result = await db.transaction(async () => {
        const job = await db.createNode('Job', { title: 'Engineer' });
        const company = await db.createNode('Company', { name: 'TechCorp' });
        await db.createEdge(job.id, 'POSTED_BY', company.id);
        return { job, company };
      });

      expect(result.job).toBeDefined();
      expect(result.company).toBeDefined();
      expect(await db.getNode(result.job.id)).toBeDefined();
      expect(await db.getNode(result.company.id)).toBeDefined();
    });

    it('should rollback transaction on error', async () => {
      await expect(db.transaction(async () => {
          await db.createNode('Job', { title: 'Engineer' });
          throw new Error('Test error');
        })).rejects.toThrow('Test error');

      // Verify rollback - no nodes should exist
      const allNodes = await db.nodes('Job').exec();
      expect(allNodes).toHaveLength(0);
    });

    it('should support manual commit', async () => {
      await db.transaction(async (ctx) => {
        await db.createNode('Job', { title: 'Engineer' });
        ctx.commit();
      });

      const nodes = await db.nodes('Job').exec();
      expect(nodes).toHaveLength(1);
    });

    it('should support manual rollback', async () => {
      await db.transaction(async (ctx) => {
        await db.createNode('Job', { title: 'Engineer' });
        ctx.rollback();
      });

      const nodes = await db.nodes('Job').exec();
      expect(nodes).toHaveLength(0);
    });

    it('should support savepoints', async () => {
      await db.transaction(async (ctx) => {
        const job1 = await db.createNode('Job', { title: 'Job 1' });
        ctx.savepoint('sp1');

        const job2 = await db.createNode('Job', { title: 'Job 2' });
        ctx.rollbackTo('sp1');

        const job3 = await db.createNode('Job', { title: 'Job 3' });
      });

      const jobs = await db.nodes('Job').exec();
      expect(jobs).toHaveLength(2);
      expect(jobs.map(j => j.properties.title).sort()).toEqual(['Job 1', 'Job 3']);
    });

    it('should throw error when committing finalized transaction', async () => {
      await expect(db.transaction(async (ctx) => {
          ctx.commit();
          ctx.commit(); // Second commit should throw
        })).rejects.toThrow(TransactionAlreadyFinalizedError);
    });

    it('should throw error when rolling back finalized transaction', async () => {
      await expect(db.transaction(async (ctx) => {
          ctx.commit();
          ctx.rollback(); // Rollback after commit should throw
        })).rejects.toThrow(TransactionAlreadyFinalizedError);
    });

    it('should handle nested savepoints', async () => {
      await db.transaction(async (ctx) => {
        await db.createNode('Job', { title: 'Job 1' });
        ctx.savepoint('sp1');

        await db.createNode('Job', { title: 'Job 2' });
        ctx.savepoint('sp2');

        await db.createNode('Job', { title: 'Job 3' });
        ctx.rollbackTo('sp2');

        await db.createNode('Job', { title: 'Job 4' });
      });

      const jobs = await db.nodes('Job').exec();
      expect(jobs).toHaveLength(3);
      expect(jobs.map(j => j.properties.title).sort()).toEqual(['Job 1', 'Job 2', 'Job 4']);
    });

    it('should return transaction function result', async () => {
      const result = await db.transaction(async () => {
        return { value: 42, message: 'success' };
      });

      expect(result).toEqual({ value: 42, message: 'success' });
    });
  });

  describe('export', () => {
    it('should export empty database', async () => {
      const exported = await db.export();

      expect(exported.nodes).toEqual([]);
      expect(exported.edges).toEqual([]);
      expect(exported.metadata).toBeDefined();
      expect(exported.metadata?.version).toBe('1');
      expect(exported.metadata?.exportedAt).toBeDefined();
    });

    it('should export nodes only', async () => {
      await db.createNode('Job', { title: 'Engineer' });
      await db.createNode('Company', { name: 'TechCorp' });

      const exported = await db.export();

      expect(exported.nodes).toHaveLength(2);
      expect(exported.edges).toHaveLength(0);
    });

    it('should export nodes and edges', async () => {
      const job = await db.createNode('Job', { title: 'Engineer' });
      const company = await db.createNode('Company', { name: 'TechCorp' });
      await db.createEdge(job.id, 'POSTED_BY', company.id);

      const exported = await db.export();

      expect(exported.nodes).toHaveLength(2);
      expect(exported.edges).toHaveLength(1);
      expect(exported.edges[0].type).toBe('POSTED_BY');
    });

    it('should preserve all node properties in export', async () => {
      const created = await db.createNode('Job', {
        title: 'Engineer',
        nested: { value: 'test' },
        array: [1, 2, 3]
      });

      const exported = await db.export();

      expect(exported.nodes[0].properties).toEqual(created.properties);
    });

    it('should preserve all edge properties in export', async () => {
      const job = await db.createNode('Job', { title: 'Engineer' });
      const company = await db.createNode('Company', { name: 'TechCorp' });
      await db.createEdge(job.id, 'POSTED_BY', company.id, { verified: true, rating: 5 });

      const exported = await db.export();

      expect(exported.edges[0].properties).toEqual({ verified: true, rating: 5 });
    });

    it('should include timestamps in export', async () => {
      const node = await db.createNode('Job', { title: 'Engineer' });
      const exported = await db.export();

      expect(exported.nodes[0].createdAt).toBeInstanceOf(Date);
      expect(exported.nodes[0].updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('import', () => {
    it('should import empty dataset', async () => {
      const data: GraphExport = {
        nodes: [],
        edges: [],
        metadata: { version: '1', exportedAt: new Date().toISOString() }
      };

      await db.import(data);

      const exported = await db.export();
      expect(exported.nodes).toHaveLength(0);
      expect(exported.edges).toHaveLength(0);
    });

    it('should import nodes only', async () => {
      const data: GraphExport = {
        nodes: [
          { id: 1, type: 'Job', properties: { title: 'Engineer' }, createdAt: new Date(), updatedAt: new Date() },
          { id: 2, type: 'Company', properties: { name: 'TechCorp' }, createdAt: new Date(), updatedAt: new Date() }
        ],
        edges: [],
        metadata: { version: '1', exportedAt: new Date().toISOString() }
      };

      await db.import(data);

      const nodes = await db.nodes('Job').exec();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].properties.title).toBe('Engineer');
    });

    it('should import nodes and edges', async () => {
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

      await db.import(data);

      const exported = await db.export();
      expect(exported.nodes).toHaveLength(2);
      expect(exported.edges).toHaveLength(1);
    });

    it('should handle import in transaction', async () => {
      const data: GraphExport = {
        nodes: [
          { id: 1, type: 'Job', properties: { title: 'Engineer' }, createdAt: new Date(), updatedAt: new Date() }
        ],
        edges: [],
        metadata: { version: '1', exportedAt: new Date().toISOString() }
      };

      await db.import(data);

      // Verify transaction completed
      const nodes = await db.nodes('Job').exec();
      expect(nodes).toHaveLength(1);
    });

    it('should rollback import on error', async () => {
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

      await expect(db.import(data)).rejects.toThrow();

      // Verify rollback - no nodes should be imported
      const nodes = await db.nodes('Job').exec();
      expect(nodes).toHaveLength(0);
    });

    it('should preserve complex properties on import', async () => {
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

      await db.import(data);

      const nodes = await db.nodes('Job').exec();
      expect(nodes[0].properties.nested).toEqual({ deep: { value: 'test' } });
      expect(nodes[0].properties.array).toEqual([1, 2, 3]);
    });

    it('should handle round-trip export/import', async () => {
      // Create original data
      const job = await db.createNode('Job', { title: 'Engineer', status: 'active' });
      const company = await db.createNode('Company', { name: 'TechCorp' });
      await db.createEdge(job.id, 'POSTED_BY', company.id, { verified: true });

      // Export
      const exported = await db.export();

      // Create new database and import
      const newDb = new GraphDatabase(':memory:');
      await newDb.import(exported);

      // Verify
      const newExported = await newDb.export();
      expect(newExported.nodes).toHaveLength(2);
      expect(newExported.edges).toHaveLength(1);
      expect(newExported.nodes.find(n => n.type === 'Job')?.properties.title).toBe('Engineer');

      await newDb.close();
    });
  });

  describe('nodes', () => {
    it('should return NodeQuery instance', async () => {
      const query = db.nodes('Job');
      expect(query).toBeDefined();
      expect(typeof query.exec).toBe('function');
    });

    it('should execute basic query', async () => {
      await db.createNode('Job', { title: 'Engineer' });
      await db.createNode('Job', { title: 'Designer' });

      const jobs = await db.nodes('Job').exec();
      expect(jobs).toHaveLength(2);
    });
  });

  describe('traverse', () => {
    it('should return TraversalQuery instance', async () => {
      const node = await db.createNode('Job', { title: 'Engineer' });
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
    it('should close database connection', async () => {
      const testDb = new GraphDatabase(':memory:');
      await testDb.close();

      // After close, operations should fail
      await expect(testDb.createNode('Job', { title: 'Test' })).rejects.toThrow();
    });

    it('should handle multiple close calls', async () => {
      const testDb = new GraphDatabase(':memory:');
      await testDb.close();

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
    it('should handle very long strings in properties', async () => {
      const longString = 'a'.repeat(10000);
      const node = await db.createNode('Job', { description: longString });

      expect(node.properties.description).toBe(longString);
    });

    it('should handle unicode characters in properties', async () => {
      const node = await db.createNode('Job', {
        title: '工程师',
        emoji: '🚀💻🔥',
        special: 'Çüé'
      });

      expect(node.properties.title).toBe('工程师');
      expect(node.properties.emoji).toBe('🚀💻🔥');
    });

    it('should handle null and undefined in properties', async () => {
      const node = await db.createNode('Job', {
        title: 'Engineer',
        optionalField: null,
        undefinedField: undefined
      });

      expect(node.properties.optionalField).toBeNull();
      expect(node.properties.undefinedField).toBeUndefined();
    });

    it('should handle boolean values in properties', async () => {
      const node = await db.createNode('Job', {
        active: true,
        remote: false
      });

      expect(node.properties.active).toBe(true);
      expect(node.properties.remote).toBe(false);
    });

    it('should handle date objects in properties', async () => {
      const date = new Date('2025-10-28T12:00:00Z');
      const node = await db.createNode('Job', { postedDate: date });

      // Date objects are serialized to ISO strings via JSON.stringify
      expect(node.properties.postedDate).toBe(date.toISOString());
    });

    it('should handle mixed type arrays', async () => {
      const node = await db.createNode('Job', {
        mixed: [1, 'string', true, null, { nested: 'object' }]
      });

      expect(node.properties.mixed).toEqual([1, 'string', true, null, { nested: 'object' }]);
    });

    it('should handle large number of nodes', async () => {
      const count = 1000;
      for (let i = 0; i < count; i++) {
        await db.createNode('Job', { index: i });
      }

      const nodes = await db.nodes('Job').exec();
      expect(nodes.length).toBe(count);
    });

    it('should handle large number of edges', async () => {
      const node1 = await db.createNode('Hub', { name: 'Hub' });
      const count = 500;

      for (let i = 0; i < count; i++) {
        const node = await db.createNode('Node', { index: i });
        await db.createEdge(node1.id, 'CONNECTS', node.id);
      }

      const exported = await db.export();
      expect(exported.edges.length).toBe(count);
    });
  });
});
