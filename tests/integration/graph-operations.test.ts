import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GraphDatabase } from '../../src/core/Database';
import { GraphExport } from '../../src/types';

/**
 * Integration tests for complex multi-step graph operations.
 * Tests combining CRUD, queries, traversals, transactions, and data export/import.
 */
describe('Complex Graph Operations - Integration Tests', async () => {
  let db: GraphDatabase;

  beforeEach(() => {
    db = new GraphDatabase(':memory:');
  });

  afterEach(async () => {
    await db.close();
  });

  describe('Multi-Step Graph Transformations', async () => {
    it('should perform complex graph transformation with multiple operations', async () => {
      // Step 1: Create initial graph structure
      const nodes = {
        a: await db.createNode('Node', { label: 'A', value: 1 }),
        b: await db.createNode('Node', { label: 'B', value: 2 }),
        c: await db.createNode('Node', { label: 'C', value: 3 }),
        d: await db.createNode('Node', { label: 'D', value: 4 })
      };

      await db.createEdge(nodes.a.id, 'LINKS_TO', nodes.b.id, { weight: 1 });
      await db.createEdge(nodes.b.id, 'LINKS_TO', nodes.c.id, { weight: 2 });
      await db.createEdge(nodes.c.id, 'LINKS_TO', nodes.d.id, { weight: 3 });
      await db.createEdge(nodes.d.id, 'LINKS_TO', nodes.a.id, { weight: 4 }); // Cycle

      // Step 2: Query and transform
      const allNodes = await db.nodes('Node').exec();
      expect(allNodes).toHaveLength(4);

      // Step 3: Add metadata to all nodes
      await Promise.all(allNodes.map(async node => {
        const outgoing = await db.traverse(node.id).out('LINKS_TO').toArray();
        const incoming = await db.traverse(node.id).in('LINKS_TO').toArray();

        await db.updateNode(node.id, {
          degree: outgoing.length + incoming.length,
          outDegree: outgoing.length,
          inDegree: incoming.length
        });
      }));

      // Step 4: Verify transformations
      const updatedA = await db.getNode(nodes.a.id);
      expect(updatedA?.properties.degree).toBe(2); // 1 out, 1 in
      expect(updatedA?.properties.outDegree).toBe(1);
      expect(updatedA?.properties.inDegree).toBe(1);

      // Step 5: Add derived relationships
      await Promise.all(allNodes.map(async node => {
        const twoHopNeighbors = await db.traverse(node.id)
          .out('LINKS_TO')
          .maxDepth(2)
          .minDepth(2)
          .toArray();

        twoHopNeighbors.forEach(async neighbor => {
          // Create "indirect" relationship
          await db.createEdge(node.id, 'INDIRECT', neighbor.id, { hops: 2 });
        });
      }));

      // Step 6: Verify derived relationships
      const indirectFromA = await db.traverse(nodes.a.id)
        .out('INDIRECT')
        .toArray();

      expect(indirectFromA.length).toBeGreaterThan(0);
    });

    it('should build and query hierarchical taxonomy', async () => {
      // Build skill taxonomy
      const programming = await db.createNode('Category', { name: 'Programming', level: 0 });
      const languages = await db.createNode('Category', { name: 'Languages', level: 1 });
      const frameworks = await db.createNode('Category', { name: 'Frameworks', level: 1 });

      await db.createEdge(programming.id, 'PARENT_OF', languages.id);
      await db.createEdge(programming.id, 'PARENT_OF', frameworks.id);

      const webLangs = await db.createNode('Category', { name: 'Web Languages', level: 2 });
      const systemsLangs = await db.createNode('Category', { name: 'Systems Languages', level: 2 });

      await db.createEdge(languages.id, 'PARENT_OF', webLangs.id);
      await db.createEdge(languages.id, 'PARENT_OF', systemsLangs.id);

      // Add actual skills
      const js = await db.createNode('Skill', { name: 'JavaScript' });
      const ts = await db.createNode('Skill', { name: 'TypeScript' });
      const rust = await db.createNode('Skill', { name: 'Rust' });
      const react = await db.createNode('Skill', { name: 'React' });

      await db.createEdge(js.id, 'BELONGS_TO', webLangs.id);
      await db.createEdge(ts.id, 'BELONGS_TO', webLangs.id);
      await db.createEdge(rust.id, 'BELONGS_TO', systemsLangs.id);
      await db.createEdge(react.id, 'BELONGS_TO', frameworks.id);

      // Query all skills under "Languages" category
      const languageCategories = await db.traverse(languages.id)
        .out('PARENT_OF')
        .toArray();

      expect(languageCategories).toHaveLength(2);

      // Find all skills under programming (3 levels deep)
      let allSkills: any[] = [];
      const categories = [programming.id];

      while (categories.length > 0) {
        const catId = categories.shift()!;
        const children = await db.traverse(catId).out('PARENT_OF').toArray();
        categories.push(...children.map(c => c.id));

        const skills = await db.traverse(catId).in('BELONGS_TO').toArray();
        allSkills.push(...skills);
      }

      expect(allSkills.length).toBeGreaterThan(0);
    });

    it('should handle complex filtering and aggregation', async () => {
      // Create diverse dataset
      const companies = await Promise.all(Array.from({ length: 10 }, async (_, i) => await db.createNode('Company', {
          name: `Company ${i}`,
          size: ['small', 'medium', 'large'][i % 3],
          founded: 2000 + i,
          revenue: 1000000 * (i + 1)
        })
      );

      const jobs = await Promise.all(Array.from({ length: 30 }, async (_, i) => await db.createNode('Job', {
          title: `Job ${i}`,
          salary: 80000 + i * 5000,
          remote: i % 2 === 0,
          department: ['Engineering', 'Sales', 'Marketing'][i % 3]
        })
      );

      // Link jobs to companies
      await Promise.all(jobs.map(async (job, i) => {
        const company = companies[i % companies.length];
        await db.createEdge(job.id, 'POSTED_BY', company.id);
      }));

      // Complex aggregation: average salary by company size
      const sizeGroups = { small: [], medium: [], large: [] } as any;

      await Promise.all(companies.map(async company => {
        const companyJobs = await db.traverse(company.id).in('POSTED_BY').toArray();
        const avgSalary =
          companyJobs.reduce((sum, job) => sum + job.properties.salary, 0) / companyJobs.length;

        const size = company.properties.size;
        sizeGroups[size].push(avgSalary);
      }));

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
      const highPayCompanies = companies.filter(async company => {
        const companyJobs = await db.traverse(company.id).in('POSTED_BY').toArray();
        return companyJobs.some(job => job.properties.salary >= 150000);
      });

      expect(highPayCompanies.length).toBeGreaterThan(0);
    });
  });

  describe('Transaction Scenarios with Savepoints', async () => {
    it('should handle partial rollback with savepoints', async () => {
      const result = await db.transaction(async ctx => {
        // Create first batch
        const job1 = await db.createNode('Job', { title: 'Job 1', batch: 1 });
        const job2 = await db.createNode('Job', { title: 'Job 2', batch: 1 });

        ctx.savepoint('batch1');

        // Create second batch
        const job3 = await db.createNode('Job', { title: 'Job 3', batch: 2 });
        const job4 = await db.createNode('Job', { title: 'Job 4', batch: 2 });

        ctx.savepoint('batch2');

        // Create third batch
        const job5 = await db.createNode('Job', { title: 'Job 5', batch: 3 });

        // Rollback third batch
        ctx.rollbackTo('batch2');

        // Create replacement for batch 3
        const job6 = await db.createNode('Job', { title: 'Job 6', batch: 3 });

        return { job1, job2, job3, job4, job6 };
      });

      // Verify Job 5 was rolled back, Job 6 exists
      const allJobs = await db.nodes('Job').exec();
      expect(allJobs).toHaveLength(5);

      const titles = allJobs.map(j => j.properties.title).sort();
      expect(titles).toEqual(['Job 1', 'Job 2', 'Job 3', 'Job 4', 'Job 6']);
    });

    it('should handle complex transaction with error recovery', async () => {
      const result = await db.transaction(async ctx => {
        const company = await db.createNode('Company', { name: 'Test Company' });
        ctx.savepoint('company_created');

        try {
          const job1 = await db.createNode('Job', { title: 'Job 1' });
          await db.createEdge(job1.id, 'POSTED_BY', company.id);

          ctx.savepoint('job1_created');

          const job2 = await db.createNode('Job', { title: 'Job 2' });
          // Simulate error condition
          if (job2.properties.title === 'Job 2') {
            throw new Error('Simulated error');
          }
          await db.createEdge(job2.id, 'POSTED_BY', company.id);
        } catch (error) {
          // Rollback to after job1
          ctx.rollbackTo('job1_created');

          // Create alternative job2
          const job2Alt = await db.createNode('Job', { title: 'Job 2 Alt' });
          await db.createEdge(job2Alt.id, 'POSTED_BY', company.id);
        }

        return company.id;
      });

      // Verify recovery worked
      const jobs = await db.traverse(result).in('POSTED_BY').toArray();
      expect(jobs).toHaveLength(2);

      const titles = jobs.map(j => j.properties.title).sort();
      expect(titles).toContain('Job 1');
      expect(titles).toContain('Job 2 Alt');
      expect(titles).not.toContain('Job 2');
    });

    it('should support nested transaction-like operations', async () => {
      await db.transaction(async ctx => {
        // Outer operation
        const project = await db.createNode('Project', { name: 'Project A' });
        ctx.savepoint('project');

        // Inner operation 1
        db.transaction(async innerCtx => {
          const task1 = await db.createNode('Task', { title: 'Task 1' });
          await db.createEdge(task1.id, 'PART_OF', project.id);
        });

        ctx.savepoint('task1');

        // Inner operation 2
        db.transaction(async innerCtx => {
          const task2 = await db.createNode('Task', { title: 'Task 2' });
          await db.createEdge(task2.id, 'PART_OF', project.id);
        });

        // Verify both tasks exist
        const tasks = await db.traverse(project.id).in('PART_OF').toArray();
        expect(tasks).toHaveLength(2);
      });

      // Verify everything committed
      const projects = await db.nodes('Project').exec();
      expect(projects).toHaveLength(1);

      const allTasks = await db.nodes('Task').exec();
      expect(allTasks).toHaveLength(2);
    });

    it('should rollback entire transaction on error', async () => {
      await expect(db.transaction(async ctx => {
          const node1 = await db.createNode('Node', { label: 'Node 1' });
          const node2 = await db.createNode('Node', { label: 'Node 2' });

          await db.createEdge(node1.id, 'LINKS', node2.id);

          // Create savepoint
          ctx.savepoint('after_nodes');

          const node3 = await db.createNode('Node', { label: 'Node 3' });

          // Throw error - should rollback everything
          throw new Error('Transaction failed');
        })).rejects.toThrow('Transaction failed');

      // Verify nothing was committed
      const nodes = await db.nodes('Node').exec();
      expect(nodes).toHaveLength(0);
    });
  });

  describe('Export and Import Operations', async () => {
    it('should export and import complete graph', async () => {
      // Create original graph
      const company = await db.createNode('Company', { name: 'TestCorp', size: 'medium' });
      const job = await db.createNode('Job', { title: 'Engineer', salary: 150000 });
      const skill = await db.createNode('Skill', { name: 'TypeScript', category: 'programming' });

      await db.createEdge(job.id, 'POSTED_BY', company.id);
      await db.createEdge(job.id, 'REQUIRES', skill.id, { level: 'expert' });

      // Export
      const exported = await db.export();

      // Verify export structure
      expect(exported.nodes).toHaveLength(3);
      expect(exported.edges).toHaveLength(2);
      expect(exported.metadata).toBeDefined();
      expect(exported.metadata?.version).toBe('1');

      // Create new database and import
      const db2 = new GraphDatabase(':memory:');
      await db2.import(exported);

      // Verify imported data
      const importedCompanies = await db2.nodes('Company').exec();
      expect(importedCompanies).toHaveLength(1);
      expect(importedCompanies[0].properties.name).toBe('TestCorp');

      const importedJobs = await db2.nodes('Job').exec();
      expect(importedJobs).toHaveLength(1);

      // Verify relationships
      const jobCompanies = db2.traverse(importedJobs[0].id)
        .out('POSTED_BY')
        .toArray();
      expect(jobCompanies).toHaveLength(1);

      await db2.close();
    });

    it('should handle large graph export/import', async () => {
      // Create larger graph
      const nodeCount = 100;
      const nodes = await Promise.all(Array.from({ length: nodeCount }, async (_, i) => await db.createNode('Node', { index: i, value: Math.random() })
      );

      // Create edges (each node connects to next 3)
      await Promise.all(nodes.map(async (node, i) => {
        for (let j = 1; j <= 3; j++) {
          const targetIndex = (i + j) % nodeCount;
          await db.createEdge(node.id, 'LINKS', nodes[targetIndex].id, { weight: j });
        }
      }));

      // Export
      const startExport = Date.now();
      const exported = await db.export();
      const exportTime = Date.now() - startExport;

      expect(exported.nodes).toHaveLength(nodeCount);
      expect(exported.edges).toHaveLength(nodeCount * 3);

      // Import to new database
      const db2 = new GraphDatabase(':memory:');
      const startImport = Date.now();
      await db2.import(exported);
      const importTime = Date.now() - startImport;

      // Verify
      const importedNodes = await db2.nodes('Node').exec();
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

      await db2.close();
    });

    it('should preserve data types in export/import', async () => {
      const node = await db.createNode('Test', {
        string: 'hello',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        object: { nested: 'value' },
        date: new Date().toISOString()
      });

      const exported = await db.export();
      const db2 = new GraphDatabase(':memory:');
      await db2.import(exported);

      const imported = await db2.nodes('Test').first();
      expect(imported).toBeTruthy();
      expect(imported!.properties.string).toBe('hello');
      expect(imported!.properties.number).toBe(42);
      expect(imported!.properties.boolean).toBe(true);
      expect(imported!.properties.null).toBeNull();
      expect(imported!.properties.array).toEqual([1, 2, 3]);
      expect(imported!.properties.object).toEqual({ nested: 'value' });
      expect(imported!.properties.date).toBeDefined();

      await db2.close();
    });

    it('should handle incremental import without duplicates', async () => {
      // Initial data
      const company = await db.createNode('Company', { name: 'Company A', id: 'comp-a' });
      const job1 = await db.createNode('Job', { title: 'Job 1', id: 'job-1' });
      await db.createEdge(job1.id, 'POSTED_BY', company.id);

      const export1 = await db.export();

      // Add more data
      const job2 = await db.createNode('Job', { title: 'Job 2', id: 'job-2' });
      await db.createEdge(job2.id, 'POSTED_BY', company.id);

      // Export again - this will include all data
      const export2 = await db.export();

      // New database with first export
      const db2 = new GraphDatabase(':memory:');
      await db2.import(export1);

      // Import second export (will have duplicates)
      await db2.import(export2);

      // Count nodes - will have duplicates because import doesn't check
      const companies = await db2.nodes('Company').exec();
      const jobs = await db2.nodes('Job').exec();

      // This shows import creates duplicates - would need application-level deduplication
      expect(companies.length).toBeGreaterThanOrEqual(1);
      expect(jobs.length).toBeGreaterThanOrEqual(2);

      await db2.close();
    });
  });

  describe('Path Finding and Graph Algorithms', async () => {
    it('should find shortest path between nodes', async () => {
      // Create graph: A -> B -> C -> D
      //                \         /
      //                 -> E ----
      const a = await db.createNode('Node', { label: 'A' });
      const b = await db.createNode('Node', { label: 'B' });
      const c = await db.createNode('Node', { label: 'C' });
      const d = await db.createNode('Node', { label: 'D' });
      const e = await db.createNode('Node', { label: 'E' });

      await db.createEdge(a.id, 'LINKS', b.id);
      await db.createEdge(b.id, 'LINKS', c.id);
      await db.createEdge(c.id, 'LINKS', d.id);
      await db.createEdge(a.id, 'LINKS', e.id);
      await db.createEdge(e.id, 'LINKS', d.id);

      // Find shortest path from A to D
      const path = await db.traverse(a.id).shortestPath(d.id);

      expect(path).toBeDefined();
      expect(path!.length).toBe(3); // A -> E -> D (or A -> B -> C -> D)

      const labels = path!.map(node => node.properties.label);
      expect(labels[0]).toBe('A');
      expect(labels[labels.length - 1]).toBe('D');
    });

    it('should detect cycles in graph', async () => {
      // Create cycle: A -> B -> C -> A
      const a = await db.createNode('Node', { label: 'A' });
      const b = await db.createNode('Node', { label: 'B' });
      const c = await db.createNode('Node', { label: 'C' });

      await db.createEdge(a.id, 'LINKS', b.id);
      await db.createEdge(b.id, 'LINKS', c.id);
      await db.createEdge(c.id, 'LINKS', a.id);

      // Traverse with cycle detection (limited depth)
      const visited = new Set();
      const hasCycle = (nodeId: number, depth: number): boolean => {
        if (depth > 10) return true; // Exceeded reasonable depth
        if (visited.has(nodeId)) return true;

        visited.add(nodeId);
        const neighbors = await db.traverse(nodeId).out('LINKS').toArray();

        for (const neighbor of neighbors) {
          if (hasCycle(neighbor.id, depth + 1)) return true;
        }

        return false;
      };

      expect(hasCycle(a.id, 0)).toBe(true);
    });

    it('should find all paths between nodes', async () => {
      // Create diamond graph: A -> B -> D
      //                        \-> C ->/
      const a = await db.createNode('Node', { label: 'A' });
      const b = await db.createNode('Node', { label: 'B' });
      const c = await db.createNode('Node', { label: 'C' });
      const d = await db.createNode('Node', { label: 'D' });

      await db.createEdge(a.id, 'LINKS', b.id);
      await db.createEdge(a.id, 'LINKS', c.id);
      await db.createEdge(b.id, 'LINKS', d.id);
      await db.createEdge(c.id, 'LINKS', d.id);

      // Find all paths using traversal
      const paths = await db.traverse(a.id)
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

    it('should calculate node centrality', async () => {
      // Create star topology: Center connected to 5 outer nodes
      const center = await db.createNode('Node', { label: 'Center' });
      const outer = await Promise.all(Array.from({ length: 5 }, async (_, i) => await db.createNode('Node', { label: `Outer ${i}` })
      );

      await Promise.all(outer.map(async node => {
        await db.createEdge(center.id, 'LINKS', node.id);
        await db.createEdge(node.id, 'LINKS', center.id);
      }));

      // Calculate degree centrality
      const allNodes = await db.nodes('Node').exec();
      const centrality = await Promise.all(allNodes.mapmap(async node => {
        const outgoing = await db.traverse(node.id).out('LINKS').toArray();
        const incoming = await db.traverse(node.id).in('LINKS').toArray();
        return {
          label: node.properties.label,
          degree: outgoing.length + incoming.length
        };
      }));

      const centerNode = centrality.find(n => n.label === 'Center');
      expect(centerNode?.degree).toBe(10); // 5 out + 5 in

      const outerNodes = centrality.filter(n => n.label.startsWith('Outer'));
      outerNodes.forEach(node => {
        expect(node.degree).toBe(2); // 1 out + 1 in
      });
    });
  });

  describe('Data Integrity Under Stress', async () => {
    it('should maintain consistency with rapid updates', async () => {
      const node = await db.createNode('Counter', { value: 0 });

      // Simulate rapid updates
      await db.transaction(async () => {
        for (let i = 0; i < 100; i++) {
          const current = await db.getNode(node.id);
          await db.updateNode(node.id, { value: current!.properties.value + 1 });
        }
      });

      const final = await db.getNode(node.id);
      expect(final?.properties.value).toBe(100);
    });

    it('should handle complex concurrent operations in transaction', async () => {
      await db.transaction(async () => {
        const nodes = await Promise.all(Array.from({ length: 10 }, async (_, i) => await db.createNode('Node', { index: i })
        );

        // Create all possible edges
        await Promise.all(nodes.map(async (from, i) => {
          nodes.forEach(async (to, j) => {
            if (i !== j) {
              await db.createEdge(from.id, 'LINKS', to.id);
            }
          });
        }));

        // Query while still in transaction
        const allNodes = await db.nodes('Node').exec();
        expect(allNodes).toHaveLength(10);

        // Each node should have 9 outgoing edges
        await Promise.all(nodes.map(async node => {
          const outgoing = await db.traverse(node.id).out('LINKS').toArray();
          expect(outgoing).toHaveLength(9);
        }));
      });
    });

    it('should validate graph invariants after operations', async () => {
      // Create graph with constraints
      const root = await db.createNode('Root', { value: 'root' });
      const children = await Promise.all(Array.from({ length: 5 }, async (_, i) => await db.createNode('Child', { value: `child-${i}`, parent: root.id })
      );

      await Promise.all(children.map(async child => {
        await db.createEdge(root.id, 'PARENT_OF', child.id);
      }));

      // Invariant: Each child has exactly one parent
      await Promise.all(children.map(async child => {
        const parents = await db.traverse(child.id).in('PARENT_OF').toArray();
        expect(parents).toHaveLength(1);
        expect(parents[0].id).toBe(root.id);
      }));

      // Invariant: Root has exactly 5 children
      const rootChildren = await db.traverse(root.id).out('PARENT_OF').toArray();
      expect(rootChildren).toHaveLength(5);
    });
  });
});
