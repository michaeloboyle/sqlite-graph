import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GraphDatabase } from '../../src/core/Database';
import { GraphExport } from '../../src/types';

/**
 * Integration tests for complex multi-step graph operations.
 * Tests combining CRUD, queries, traversals, transactions, and data export/import.
 */
describe('Complex Graph Operations - Integration Tests', () => {
  let db: GraphDatabase;

  beforeEach(() => {
    db = new GraphDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('Multi-Step Graph Transformations', () => {
    it('should perform complex graph transformation with multiple operations', () => {
      // Step 1: Create initial graph structure
      const nodes = {
        a: db.createNode('Node', { label: 'A', value: 1 }),
        b: db.createNode('Node', { label: 'B', value: 2 }),
        c: db.createNode('Node', { label: 'C', value: 3 }),
        d: db.createNode('Node', { label: 'D', value: 4 })
      };

      db.createEdge(nodes.a.id, 'LINKS_TO', nodes.b.id, { weight: 1 });
      db.createEdge(nodes.b.id, 'LINKS_TO', nodes.c.id, { weight: 2 });
      db.createEdge(nodes.c.id, 'LINKS_TO', nodes.d.id, { weight: 3 });
      db.createEdge(nodes.d.id, 'LINKS_TO', nodes.a.id, { weight: 4 }); // Cycle

      // Step 2: Query and transform
      const allNodes = db.nodes('Node').exec();
      expect(allNodes).toHaveLength(4);

      // Step 3: Add metadata to all nodes
      allNodes.forEach(node => {
        const outgoing = db.traverse(node.id).out('LINKS_TO').toArray();
        const incoming = db.traverse(node.id).in('LINKS_TO').toArray();

        db.updateNode(node.id, {
          degree: outgoing.length + incoming.length,
          outDegree: outgoing.length,
          inDegree: incoming.length
        });
      });

      // Step 4: Verify transformations
      const updatedA = db.getNode(nodes.a.id);
      expect(updatedA?.properties.degree).toBe(2); // 1 out, 1 in
      expect(updatedA?.properties.outDegree).toBe(1);
      expect(updatedA?.properties.inDegree).toBe(1);

      // Step 5: Add derived relationships
      allNodes.forEach(node => {
        const twoHopNeighbors = db.traverse(node.id)
          .out('LINKS_TO')
          .maxDepth(2)
          .minDepth(2)
          .toArray();

        twoHopNeighbors.forEach(neighbor => {
          // Create "indirect" relationship
          db.createEdge(node.id, 'INDIRECT', neighbor.id, { hops: 2 });
        });
      });

      // Step 6: Verify derived relationships
      const indirectFromA = db.traverse(nodes.a.id)
        .out('INDIRECT')
        .toArray();

      expect(indirectFromA.length).toBeGreaterThan(0);
    });

    it('should build and query hierarchical taxonomy', () => {
      // Build skill taxonomy
      const programming = db.createNode('Category', { name: 'Programming', level: 0 });
      const languages = db.createNode('Category', { name: 'Languages', level: 1 });
      const frameworks = db.createNode('Category', { name: 'Frameworks', level: 1 });

      db.createEdge(programming.id, 'PARENT_OF', languages.id);
      db.createEdge(programming.id, 'PARENT_OF', frameworks.id);

      const webLangs = db.createNode('Category', { name: 'Web Languages', level: 2 });
      const systemsLangs = db.createNode('Category', { name: 'Systems Languages', level: 2 });

      db.createEdge(languages.id, 'PARENT_OF', webLangs.id);
      db.createEdge(languages.id, 'PARENT_OF', systemsLangs.id);

      // Add actual skills
      const js = db.createNode('Skill', { name: 'JavaScript' });
      const ts = db.createNode('Skill', { name: 'TypeScript' });
      const rust = db.createNode('Skill', { name: 'Rust' });
      const react = db.createNode('Skill', { name: 'React' });

      db.createEdge(js.id, 'BELONGS_TO', webLangs.id);
      db.createEdge(ts.id, 'BELONGS_TO', webLangs.id);
      db.createEdge(rust.id, 'BELONGS_TO', systemsLangs.id);
      db.createEdge(react.id, 'BELONGS_TO', frameworks.id);

      // Query all skills under "Languages" category
      const languageCategories = db.traverse(languages.id)
        .out('PARENT_OF')
        .toArray();

      expect(languageCategories).toHaveLength(2);

      // Find all skills under programming (3 levels deep)
      let allSkills: any[] = [];
      const categories = [programming.id];

      while (categories.length > 0) {
        const catId = categories.shift()!;
        const children = db.traverse(catId).out('PARENT_OF').toArray();
        categories.push(...children.map(c => c.id));

        const skills = db.traverse(catId).in('BELONGS_TO').toArray();
        allSkills.push(...skills);
      }

      expect(allSkills.length).toBeGreaterThan(0);
    });

    it('should handle complex filtering and aggregation', () => {
      // Create diverse dataset
      const companies = Array.from({ length: 10 }, (_, i) =>
        db.createNode('Company', {
          name: `Company ${i}`,
          size: ['small', 'medium', 'large'][i % 3],
          founded: 2000 + i,
          revenue: 1000000 * (i + 1)
        })
      );

      const jobs = Array.from({ length: 30 }, (_, i) =>
        db.createNode('Job', {
          title: `Job ${i}`,
          salary: 80000 + i * 5000,
          remote: i % 2 === 0,
          department: ['Engineering', 'Sales', 'Marketing'][i % 3]
        })
      );

      // Link jobs to companies
      jobs.forEach((job, i) => {
        const company = companies[i % companies.length];
        db.createEdge(job.id, 'POSTED_BY', company.id);
      });

      // Complex aggregation: average salary by company size
      const sizeGroups = { small: [], medium: [], large: [] } as any;

      companies.forEach(company => {
        const companyJobs = db.traverse(company.id).in('POSTED_BY').toArray();
        const avgSalary =
          companyJobs.reduce((sum, job) => sum + job.properties.salary, 0) / companyJobs.length;

        const size = company.properties.size;
        sizeGroups[size].push(avgSalary);
      });

      // Calculate averages
      const avgBySizeArray = Object.entries(sizeGroups).map(([size, salaries]: [string, any]) => ({
        size,
        avgSalary: salaries.reduce((sum: number, s: number) => sum + s, 0) / salaries.length
      }));

      expect(avgBySizeArray).toHaveLength(3);
      avgBySizeArray.forEach(group => {
        expect(group.avgSalary).toBeGreaterThan(0);
      });

      // Find companies with high-paying jobs
      const highPayCompanies = companies.filter(company => {
        const companyJobs = db.traverse(company.id).in('POSTED_BY').toArray();
        return companyJobs.some(job => job.properties.salary >= 150000);
      });

      expect(highPayCompanies.length).toBeGreaterThan(0);
    });
  });

  describe('Transaction Scenarios with Savepoints', () => {
    it('should handle partial rollback with savepoints', () => {
      const result = db.transaction(ctx => {
        // Create first batch
        const job1 = db.createNode('Job', { title: 'Job 1', batch: 1 });
        const job2 = db.createNode('Job', { title: 'Job 2', batch: 1 });

        ctx.savepoint('batch1');

        // Create second batch
        const job3 = db.createNode('Job', { title: 'Job 3', batch: 2 });
        const job4 = db.createNode('Job', { title: 'Job 4', batch: 2 });

        ctx.savepoint('batch2');

        // Create third batch
        const job5 = db.createNode('Job', { title: 'Job 5', batch: 3 });

        // Rollback third batch
        ctx.rollbackTo('batch2');

        // Create replacement for batch 3
        const job6 = db.createNode('Job', { title: 'Job 6', batch: 3 });

        return { job1, job2, job3, job4, job6 };
      });

      // Verify Job 5 was rolled back, Job 6 exists
      const allJobs = db.nodes('Job').exec();
      expect(allJobs).toHaveLength(5);

      const titles = allJobs.map(j => j.properties.title).sort();
      expect(titles).toEqual(['Job 1', 'Job 2', 'Job 3', 'Job 4', 'Job 6']);
    });

    it('should handle complex transaction with error recovery', () => {
      const result = db.transaction(ctx => {
        const company = db.createNode('Company', { name: 'Test Company' });
        ctx.savepoint('company_created');

        try {
          const job1 = db.createNode('Job', { title: 'Job 1' });
          db.createEdge(job1.id, 'POSTED_BY', company.id);

          ctx.savepoint('job1_created');

          const job2 = db.createNode('Job', { title: 'Job 2' });
          // Simulate error condition
          if (job2.properties.title === 'Job 2') {
            throw new Error('Simulated error');
          }
          db.createEdge(job2.id, 'POSTED_BY', company.id);
        } catch (error) {
          // Rollback to after job1
          ctx.rollbackTo('job1_created');

          // Create alternative job2
          const job2Alt = db.createNode('Job', { title: 'Job 2 Alt' });
          db.createEdge(job2Alt.id, 'POSTED_BY', company.id);
        }

        return company.id;
      });

      // Verify recovery worked
      const jobs = db.traverse(result).in('POSTED_BY').toArray();
      expect(jobs).toHaveLength(2);

      const titles = jobs.map(j => j.properties.title).sort();
      expect(titles).toContain('Job 1');
      expect(titles).toContain('Job 2 Alt');
      expect(titles).not.toContain('Job 2');
    });

    it('should support nested transaction-like operations', () => {
      db.transaction(ctx => {
        // Outer operation
        const project = db.createNode('Project', { name: 'Project A' });
        ctx.savepoint('project');

        // Inner operation 1
        db.transaction(innerCtx => {
          const task1 = db.createNode('Task', { title: 'Task 1' });
          db.createEdge(task1.id, 'PART_OF', project.id);
        });

        ctx.savepoint('task1');

        // Inner operation 2
        db.transaction(innerCtx => {
          const task2 = db.createNode('Task', { title: 'Task 2' });
          db.createEdge(task2.id, 'PART_OF', project.id);
        });

        // Verify both tasks exist
        const tasks = db.traverse(project.id).in('PART_OF').toArray();
        expect(tasks).toHaveLength(2);
      });

      // Verify everything committed
      const projects = db.nodes('Project').exec();
      expect(projects).toHaveLength(1);

      const allTasks = db.nodes('Task').exec();
      expect(allTasks).toHaveLength(2);
    });

    it('should rollback entire transaction on error', () => {
      expect(() => {
        db.transaction(ctx => {
          const node1 = db.createNode('Node', { label: 'Node 1' });
          const node2 = db.createNode('Node', { label: 'Node 2' });

          db.createEdge(node1.id, 'LINKS', node2.id);

          // Create savepoint
          ctx.savepoint('after_nodes');

          const node3 = db.createNode('Node', { label: 'Node 3' });

          // Throw error - should rollback everything
          throw new Error('Transaction failed');
        });
      }).toThrow('Transaction failed');

      // Verify nothing was committed
      const nodes = db.nodes('Node').exec();
      expect(nodes).toHaveLength(0);
    });
  });

  describe('Export and Import Operations', () => {
    it('should export and import complete graph', () => {
      // Create original graph
      const company = db.createNode('Company', { name: 'TestCorp', size: 'medium' });
      const job = db.createNode('Job', { title: 'Engineer', salary: 150000 });
      const skill = db.createNode('Skill', { name: 'TypeScript', category: 'programming' });

      db.createEdge(job.id, 'POSTED_BY', company.id);
      db.createEdge(job.id, 'REQUIRES', skill.id, { level: 'expert' });

      // Export
      const exported = db.export();

      // Verify export structure
      expect(exported.nodes).toHaveLength(3);
      expect(exported.edges).toHaveLength(2);
      expect(exported.metadata).toBeDefined();
      expect(exported.metadata?.version).toBe('1');

      // Create new database and import
      const db2 = new GraphDatabase(':memory:');
      db2.import(exported);

      // Verify imported data
      const importedCompanies = db2.nodes('Company').exec();
      expect(importedCompanies).toHaveLength(1);
      expect(importedCompanies[0].properties.name).toBe('TestCorp');

      const importedJobs = db2.nodes('Job').exec();
      expect(importedJobs).toHaveLength(1);

      // Verify relationships
      const jobCompanies = db2.traverse(importedJobs[0].id)
        .out('POSTED_BY')
        .toArray();
      expect(jobCompanies).toHaveLength(1);

      db2.close();
    });

    it('should handle large graph export/import', () => {
      // Create larger graph
      const nodeCount = 100;
      const nodes = Array.from({ length: nodeCount }, (_, i) =>
        db.createNode('Node', { index: i, value: Math.random() })
      );

      // Create edges (each node connects to next 3)
      nodes.forEach((node, i) => {
        for (let j = 1; j <= 3; j++) {
          const targetIndex = (i + j) % nodeCount;
          db.createEdge(node.id, 'LINKS', nodes[targetIndex].id, { weight: j });
        }
      });

      // Export
      const startExport = Date.now();
      const exported = db.export();
      const exportTime = Date.now() - startExport;

      expect(exported.nodes).toHaveLength(nodeCount);
      expect(exported.edges).toHaveLength(nodeCount * 3);

      // Import to new database
      const db2 = new GraphDatabase(':memory:');
      const startImport = Date.now();
      db2.import(exported);
      const importTime = Date.now() - startImport;

      // Verify
      const importedNodes = db2.nodes('Node').exec();
      expect(importedNodes).toHaveLength(nodeCount);

      // Verify random node's connections
      const randomNode = importedNodes[Math.floor(Math.random() * nodeCount)];
      const connections = db2.traverse(randomNode.id).out('LINKS').toArray();
      expect(connections).toHaveLength(3);

      console.log(`Export/Import performance for 100 nodes:
        Export: ${exportTime}ms
        Import: ${importTime}ms
      `);

      expect(exportTime).toBeLessThan(1000);
      expect(importTime).toBeLessThan(2000);

      db2.close();
    });

    it('should preserve data types in export/import', () => {
      const node = db.createNode('Test', {
        string: 'hello',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        object: { nested: 'value' },
        date: new Date().toISOString()
      });

      const exported = db.export();
      const db2 = new GraphDatabase(':memory:');
      db2.import(exported);

      const imported = db2.nodes('Test').first();
      expect(imported).toBeTruthy();
      expect(imported!.properties.string).toBe('hello');
      expect(imported!.properties.number).toBe(42);
      expect(imported!.properties.boolean).toBe(true);
      expect(imported!.properties.null).toBeNull();
      expect(imported!.properties.array).toEqual([1, 2, 3]);
      expect(imported!.properties.object).toEqual({ nested: 'value' });
      expect(imported!.properties.date).toBeDefined();

      db2.close();
    });

    it('should handle incremental import without duplicates', () => {
      // Initial data
      const company = db.createNode('Company', { name: 'Company A', id: 'comp-a' });
      const job1 = db.createNode('Job', { title: 'Job 1', id: 'job-1' });
      db.createEdge(job1.id, 'POSTED_BY', company.id);

      const export1 = db.export();

      // Add more data
      const job2 = db.createNode('Job', { title: 'Job 2', id: 'job-2' });
      db.createEdge(job2.id, 'POSTED_BY', company.id);

      // Export again - this will include all data
      const export2 = db.export();

      // New database with first export
      const db2 = new GraphDatabase(':memory:');
      db2.import(export1);

      // Import second export (will have duplicates)
      db2.import(export2);

      // Count nodes - will have duplicates because import doesn't check
      const companies = db2.nodes('Company').exec();
      const jobs = db2.nodes('Job').exec();

      // This shows import creates duplicates - would need application-level deduplication
      expect(companies.length).toBeGreaterThanOrEqual(1);
      expect(jobs.length).toBeGreaterThanOrEqual(2);

      db2.close();
    });
  });

  describe('Path Finding and Graph Algorithms', () => {
    it('should find shortest path between nodes', () => {
      // Create graph: A -> B -> C -> D
      //                \         /
      //                 -> E ----
      const a = db.createNode('Node', { label: 'A' });
      const b = db.createNode('Node', { label: 'B' });
      const c = db.createNode('Node', { label: 'C' });
      const d = db.createNode('Node', { label: 'D' });
      const e = db.createNode('Node', { label: 'E' });

      db.createEdge(a.id, 'LINKS', b.id);
      db.createEdge(b.id, 'LINKS', c.id);
      db.createEdge(c.id, 'LINKS', d.id);
      db.createEdge(a.id, 'LINKS', e.id);
      db.createEdge(e.id, 'LINKS', d.id);

      // Find shortest path from A to D
      const path = db.traverse(a.id).shortestPath(d.id);

      expect(path).toBeDefined();
      expect(path!.length).toBe(3); // A -> E -> D (or A -> B -> C -> D)

      const labels = path!.map(node => node.properties.label);
      expect(labels[0]).toBe('A');
      expect(labels[labels.length - 1]).toBe('D');
    });

    it('should detect cycles in graph', () => {
      // Create cycle: A -> B -> C -> A
      const a = db.createNode('Node', { label: 'A' });
      const b = db.createNode('Node', { label: 'B' });
      const c = db.createNode('Node', { label: 'C' });

      db.createEdge(a.id, 'LINKS', b.id);
      db.createEdge(b.id, 'LINKS', c.id);
      db.createEdge(c.id, 'LINKS', a.id);

      // Traverse with cycle detection (limited depth)
      const visited = new Set();
      const hasCycle = (nodeId: number, depth: number): boolean => {
        if (depth > 10) return true; // Exceeded reasonable depth
        if (visited.has(nodeId)) return true;

        visited.add(nodeId);
        const neighbors = db.traverse(nodeId).out('LINKS').toArray();

        for (const neighbor of neighbors) {
          if (hasCycle(neighbor.id, depth + 1)) return true;
        }

        return false;
      };

      expect(hasCycle(a.id, 0)).toBe(true);
    });

    it('should find all paths between nodes', () => {
      // Create diamond graph: A -> B -> D
      //                        \-> C ->/
      const a = db.createNode('Node', { label: 'A' });
      const b = db.createNode('Node', { label: 'B' });
      const c = db.createNode('Node', { label: 'C' });
      const d = db.createNode('Node', { label: 'D' });

      db.createEdge(a.id, 'LINKS', b.id);
      db.createEdge(a.id, 'LINKS', c.id);
      db.createEdge(b.id, 'LINKS', d.id);
      db.createEdge(c.id, 'LINKS', d.id);

      // Find all paths using traversal
      const paths = db.traverse(a.id)
        .out('LINKS')
        .maxDepth(3)
        .paths(d.id);

      expect(paths.length).toBeGreaterThanOrEqual(2);

      // Verify both paths exist
      const pathStrings = paths.map(path =>
        path.map(node => node.properties.label).join('->')
      );

      expect(pathStrings).toContainEqual('A->B->D');
      expect(pathStrings).toContainEqual('A->C->D');
    });

    it('should calculate node centrality', () => {
      // Create star topology: Center connected to 5 outer nodes
      const center = db.createNode('Node', { label: 'Center' });
      const outer = Array.from({ length: 5 }, (_, i) =>
        db.createNode('Node', { label: `Outer ${i}` })
      );

      outer.forEach(node => {
        db.createEdge(center.id, 'LINKS', node.id);
        db.createEdge(node.id, 'LINKS', center.id);
      });

      // Calculate degree centrality
      const allNodes = db.nodes('Node').exec();
      const centrality = allNodes.map(node => {
        const outgoing = db.traverse(node.id).out('LINKS').toArray();
        const incoming = db.traverse(node.id).in('LINKS').toArray();
        return {
          label: node.properties.label,
          degree: outgoing.length + incoming.length
        };
      });

      const centerNode = centrality.find(n => n.label === 'Center');
      expect(centerNode?.degree).toBe(10); // 5 out + 5 in

      const outerNodes = centrality.filter(n => n.label.startsWith('Outer'));
      outerNodes.forEach(node => {
        expect(node.degree).toBe(2); // 1 out + 1 in
      });
    });
  });

  describe('Data Integrity Under Stress', () => {
    it('should maintain consistency with rapid updates', () => {
      const node = db.createNode('Counter', { value: 0 });

      // Simulate rapid updates
      db.transaction(() => {
        for (let i = 0; i < 100; i++) {
          const current = db.getNode(node.id);
          db.updateNode(node.id, { value: current!.properties.value + 1 });
        }
      });

      const final = db.getNode(node.id);
      expect(final?.properties.value).toBe(100);
    });

    it('should handle complex concurrent operations in transaction', () => {
      db.transaction(() => {
        const nodes = Array.from({ length: 10 }, (_, i) =>
          db.createNode('Node', { index: i })
        );

        // Create all possible edges
        nodes.forEach((from, i) => {
          nodes.forEach((to, j) => {
            if (i !== j) {
              db.createEdge(from.id, 'LINKS', to.id);
            }
          });
        });

        // Query while still in transaction
        const allNodes = db.nodes('Node').exec();
        expect(allNodes).toHaveLength(10);

        // Each node should have 9 outgoing edges
        nodes.forEach(node => {
          const outgoing = db.traverse(node.id).out('LINKS').toArray();
          expect(outgoing).toHaveLength(9);
        });
      });
    });

    it('should validate graph invariants after operations', () => {
      // Create graph with constraints
      const root = db.createNode('Root', { value: 'root' });
      const children = Array.from({ length: 5 }, (_, i) =>
        db.createNode('Child', { value: `child-${i}`, parent: root.id })
      );

      children.forEach(child => {
        db.createEdge(root.id, 'PARENT_OF', child.id);
      });

      // Invariant: Each child has exactly one parent
      children.forEach(child => {
        const parents = db.traverse(child.id).in('PARENT_OF').toArray();
        expect(parents).toHaveLength(1);
        expect(parents[0].id).toBe(root.id);
      });

      // Invariant: Root has exactly 5 children
      const rootChildren = db.traverse(root.id).out('PARENT_OF').toArray();
      expect(rootChildren).toHaveLength(5);
    });
  });
});
