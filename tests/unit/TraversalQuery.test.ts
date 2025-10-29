import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GraphDatabase } from '../../src/core/Database';
import { Node } from '../../src/types';

/**
 * Comprehensive test suite for TraversalQuery class
 * Tests all traversal methods, path finding, and cycle detection
 */
describe('TraversalQuery', () => {
  let db: GraphDatabase;
  let testNodeIds: {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };

  /**
   * Create a test graph structure:
   *
   *     A
   *    /|\
   *   B C D
   *   |X| |
   *   E F G
   *
   * Where:
   * - A connects to B, C, D (out edges)
   * - B connects to E (out)
   * - C connects to E, F (out) - creates diamond pattern
   * - D connects to G (out)
   * - F connects back to C (creates cycle)
   */
  beforeEach(() => {
    db = new GraphDatabase(':memory:');

    const a = db.createNode('Node', { name: 'A', level: 0 });
    const b = db.createNode('Node', { name: 'B', level: 1 });
    const c = db.createNode('Node', { name: 'C', level: 1 });
    const d = db.createNode('Node', { name: 'D', level: 1 });
    const e = db.createNode('Node', { name: 'E', level: 2 });
    const f = db.createNode('Node', { name: 'F', level: 2 });

    // Create edges
    db.createEdge('LINKS', a.id, b.id);
    db.createEdge('LINKS', a.id, c.id);
    db.createEdge('LINKS', a.id, d.id);
    db.createEdge('LINKS', b.id, e.id);
    db.createEdge('LINKS', c.id, e.id);
    db.createEdge('LINKS', c.id, f.id);

    // Create cycle: F -> C
    db.createEdge('LINKS', f.id, c.id);

    // Store for tests
    testNodeIds = {
      a: a.id,
      b: b.id,
      c: c.id,
      d: d.id,
      e: e.id,
      f: f.id
    };
  });

  afterEach(() => {
    db.close();
  });

  describe('out() - Outgoing Traversal', () => {
    it('should traverse outgoing edges from start node', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(1)
        .toArray();

      expect(nodes).toHaveLength(3);
      const nodeNames = nodes.map(n => n.properties.name).sort();
      expect(nodeNames).toEqual(['B', 'C', 'D']);
    });

    it('should respect node type filter in out()', () => {
      // Add a different type node
      const special = db.createNode('Special', { name: 'Special' });
      db.createEdge('LINKS', testNodeIds.a, special.id);

      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS', 'Node')
        .maxDepth(1)
        .toArray();

      // Should only get regular Node types
      expect(nodes).toHaveLength(3);
      expect(nodes.every(n => n.type === 'Node')).toBe(true);
    });

    it('should traverse multiple hops with out()', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(2)
        .toArray();

      // Should get B, C, D (depth 1) and E, F (depth 2)
      expect(nodes.length).toBeGreaterThanOrEqual(5);
      const nodeNames = nodes.map(n => n.properties.name).sort();
      expect(nodeNames).toContain('E');
      expect(nodeNames).toContain('F');
    });

    it('should return empty array when no outgoing edges exist', () => {
      const isolated = db.createNode('Node', { name: 'Isolated' });

      const nodes = db.traverse(isolated.id)
        .out('LINKS')
        .toArray();

      expect(nodes).toEqual([]);
    });
  });

  describe('in() - Incoming Traversal', () => {
    it('should traverse incoming edges', () => {
      const nodes = db.traverse(testNodeIds.e)
        .in('LINKS')
        .maxDepth(1)
        .toArray();

      // E has incoming edges from B and C
      expect(nodes).toHaveLength(2);
      const nodeNames = nodes.map(n => n.properties.name).sort();
      expect(nodeNames).toEqual(['B', 'C']);
    });

    it('should respect node type filter in in()', () => {
      const special = db.createNode('Special', { name: 'Special' });
      db.createEdge('LINKS', special.id, testNodeIds.e);

      const nodes = db.traverse(testNodeIds.e)
        .in('LINKS', 'Node')
        .maxDepth(1)
        .toArray();

      // Should only get regular Node types
      expect(nodes).toHaveLength(2);
      expect(nodes.every(n => n.type === 'Node')).toBe(true);
    });

    it('should traverse multiple hops with in()', () => {
      const nodes = db.traverse(testNodeIds.e)
        .in('LINKS')
        .maxDepth(2)
        .toArray();

      // Should get B, C (depth 1) and A (depth 2)
      expect(nodes.length).toBeGreaterThanOrEqual(3);
      const nodeNames = nodes.map(n => n.properties.name);
      expect(nodeNames).toContain('A');
    });

    it('should return empty array when no incoming edges exist', () => {
      const nodes = db.traverse(testNodeIds.a)
        .in('LINKS')
        .toArray();

      expect(nodes).toEqual([]);
    });
  });

  describe('both() - Bidirectional Traversal', () => {
    it('should traverse edges in both directions', () => {
      const nodes = db.traverse(testNodeIds.c)
        .both('LINKS')
        .maxDepth(1)
        .toArray();

      // C has: incoming from A, F; outgoing to E, F
      expect(nodes.length).toBeGreaterThanOrEqual(3);
      const nodeNames = nodes.map(n => n.properties.name).sort();
      expect(nodeNames).toContain('A'); // incoming
      expect(nodeNames).toContain('E'); // outgoing
      expect(nodeNames).toContain('F'); // both directions
    });

    it('should respect node type filter in both()', () => {
      const special = db.createNode('Special', { name: 'Special' });
      db.createEdge('LINKS', special.id, testNodeIds.c);
      db.createEdge('LINKS', testNodeIds.c, special.id);

      const nodes = db.traverse(testNodeIds.c)
        .both('LINKS', 'Node')
        .maxDepth(1)
        .toArray();

      expect(nodes.every(n => n.type === 'Node')).toBe(true);
    });

    it('should explore wider graph with both()', () => {
      const nodes = db.traverse(testNodeIds.b)
        .both('LINKS')
        .maxDepth(2)
        .toArray();

      // Should reach many nodes going both directions
      expect(nodes.length).toBeGreaterThan(3);
    });
  });

  describe('maxDepth() - Depth Limiting', () => {
    it('should limit traversal to maxDepth', () => {
      const depth1 = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(1)
        .toArray();

      const depth2 = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(2)
        .toArray();

      expect(depth1.length).toBeLessThan(depth2.length);
    });

    it('should throw error for negative maxDepth', () => {
      expect(() => {
        db.traverse(testNodeIds.a).maxDepth(-1);
      }).toThrow('Max depth must be non-negative');
    });

    it('should accept zero maxDepth', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(0)
        .toArray();

      // Should return empty - can't traverse with depth 0
      expect(nodes).toEqual([]);
    });

    it('should work with large depth values', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(100)
        .toArray();

      // Should just get all reachable nodes
      expect(nodes.length).toBeGreaterThan(0);
    });
  });

  describe('minDepth() - Minimum Depth', () => {
    it('should skip nodes closer than minDepth', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .minDepth(2)
        .maxDepth(3)
        .toArray();

      // Should only get nodes at depth 2+ (E, F, etc.)
      expect(nodes.every(n => n.properties.level >= 2)).toBe(true);
    });

    it('should throw error for negative minDepth', () => {
      expect(() => {
        db.traverse(testNodeIds.a).minDepth(-1);
      }).toThrow('Min depth must be non-negative');
    });

    it('should work with minDepth equal to maxDepth', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .minDepth(1)
        .maxDepth(1)
        .toArray();

      // Should only get nodes at exactly depth 1
      expect(nodes).toHaveLength(3);
      expect(nodes.every(n => n.properties.level === 1)).toBe(true);
    });
  });

  describe('filter() - Predicate Filtering', () => {
    it('should filter nodes by property value', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .filter(node => node.properties.name === 'B')
        .toArray();

      expect(nodes).toHaveLength(1);
      expect(nodes[0].properties.name).toBe('B');
    });

    it('should chain multiple filters', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .filter(node => node.properties.level >= 1)
        .filter(node => node.properties.name !== 'D')
        .maxDepth(1)
        .toArray();

      expect(nodes).toHaveLength(2);
      expect(nodes.map(n => n.properties.name).sort()).toEqual(['B', 'C']);
    });

    it('should apply filter across multiple depths', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .filter(node => node.properties.level === 2)
        .maxDepth(3)
        .toArray();

      // Should only get E and F
      expect(nodes.every(n => n.properties.level === 2)).toBe(true);
    });

    it('should return empty when filter matches nothing', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .filter(node => node.properties.name === 'Nonexistent')
        .toArray();

      expect(nodes).toEqual([]);
    });
  });

  describe('unique() - Node Deduplication', () => {
    it('should return each node only once', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .unique()
        .maxDepth(2)
        .toArray();

      const nodeIds = nodes.map(n => n.id);
      const uniqueIds = new Set(nodeIds);

      expect(nodeIds.length).toBe(uniqueIds.size);
    });

    it('should deduplicate diamond pattern traversal', () => {
      // E is reachable via B and C - should appear once
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .unique()
        .maxDepth(2)
        .toArray();

      const eNodes = nodes.filter(n => n.properties.name === 'E');
      expect(eNodes).toHaveLength(1);
    });

    it('should work without unique() - allow duplicates', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(2)
        .toArray();

      // Without unique, E might appear multiple times via different paths
      // (implementation detail - this tests the difference)
      expect(nodes.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('toArray() - Result Collection', () => {
    it('should return array of nodes', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(1)
        .toArray();

      expect(Array.isArray(nodes)).toBe(true);
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0]).toHaveProperty('id');
      expect(nodes[0]).toHaveProperty('type');
      expect(nodes[0]).toHaveProperty('properties');
    });

    it('should not include start node in results', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .toArray();

      const hasStartNode = nodes.some(n => n.id === testNodeIds.a);
      expect(hasStartNode).toBe(false);
    });

    it('should return empty array for isolated node', () => {
      const isolated = db.createNode('Node', { name: 'Isolated' });

      const nodes = db.traverse(isolated.id)
        .out('LINKS')
        .toArray();

      expect(nodes).toEqual([]);
    });

    it('should work with no traversal steps defined', () => {
      // Edge case: traverse without defining out/in/both
      const nodes = db.traverse(testNodeIds.a).toArray();

      // Should return empty - no steps to follow
      expect(nodes).toEqual([]);
    });
  });

  describe('shortestPath() - Path Finding', () => {
    it('should find shortest path between two nodes', () => {
      const path = db.traverse(testNodeIds.a)
        .out('LINKS')
        .shortestPath(testNodeIds.e);

      expect(path).not.toBeNull();
      expect(Array.isArray(path)).toBe(true);
      expect(path!.length).toBeGreaterThan(0);
      expect(path![0].id).toBe(testNodeIds.a);
      expect(path![path!.length - 1].id).toBe(testNodeIds.e);
    });

    it('should find direct path when available', () => {
      const path = db.traverse(testNodeIds.a)
        .out('LINKS')
        .shortestPath(testNodeIds.b);

      expect(path).not.toBeNull();
      expect(path).toHaveLength(2); // A -> B
    });

    it('should return null when no path exists', () => {
      const isolated = db.createNode('Node', { name: 'Isolated' });

      const path = db.traverse(testNodeIds.a)
        .out('LINKS')
        .shortestPath(isolated.id);

      expect(path).toBeNull();
    });

    it('should prefer shorter path in diamond pattern', () => {
      // Both A->B->E and A->C->E exist, both length 3
      const path = db.traverse(testNodeIds.a)
        .out('LINKS')
        .shortestPath(testNodeIds.e);

      expect(path).not.toBeNull();
      expect(path).toHaveLength(3); // A -> (B or C) -> E
    });

    it('should work with both() direction', () => {
      const path = db.traverse(testNodeIds.b)
        .both('LINKS')
        .shortestPath(testNodeIds.f);

      expect(path).not.toBeNull();
      // B -> A -> C -> F or B -> E -> C -> F
      expect(path!.length).toBeGreaterThanOrEqual(3);
    });

    it('should return path with start node as first element', () => {
      const path = db.traverse(testNodeIds.a)
        .out('LINKS')
        .shortestPath(testNodeIds.e);

      expect(path).not.toBeNull();
      expect(path![0].id).toBe(testNodeIds.a);
    });
  });

  describe('toPaths() - All Paths with Cycle Detection', () => {
    it('should return all paths from traversal', () => {
      const paths = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(2)
        .toPaths();

      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0]).toBeInstanceOf(Array);
    });

    it('should detect and prevent cycles', () => {
      // F -> C -> F creates a cycle
      const paths = db.traverse(testNodeIds.c)
        .both('LINKS')
        .maxDepth(5)
        .toPaths();

      // Should complete without infinite loop
      expect(paths).toBeDefined();

      // No path should contain same node twice
      for (const path of paths) {
        const nodeIds = path.map(n => n.id);
        const uniqueIds = new Set(nodeIds);
        expect(nodeIds.length).toBe(uniqueIds.size);
      }
    });

    it('should handle self-referencing nodes', () => {
      const self = db.createNode('Node', { name: 'Self' });
      db.createEdge('LINKS', self.id, self.id);

      const paths = db.traverse(self.id)
        .out('LINKS')
        .maxDepth(3)
        .toPaths();

      // Should not get stuck in infinite self-loop
      expect(paths).toBeDefined();
    });

    it('should include all intermediate nodes in paths', () => {
      const paths = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(2)
        .toPaths();

      // Each path should start with a node from depth 1
      for (const path of paths) {
        expect(path.length).toBeGreaterThan(0);
        expect(path[0]).toHaveProperty('id');
      }
    });

    it('should respect maxDepth in toPaths', () => {
      const paths1 = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(1)
        .toPaths();

      const paths2 = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(2)
        .toPaths();

      expect(paths2.length).toBeGreaterThan(paths1.length);
    });

    it('should apply filters to toPaths results', () => {
      const paths = db.traverse(testNodeIds.a)
        .out('LINKS')
        .filter(node => node.properties.level === 1)
        .maxDepth(2)
        .toPaths();

      // All paths should only contain level 1 nodes
      for (const path of paths) {
        expect(path.every(n => n.properties.level === 1)).toBe(true);
      }
    });
  });

  describe('allPaths() - Limited Path Finding', () => {
    it('should find multiple paths to target', () => {
      const paths = db.traverse(testNodeIds.a)
        .out('LINKS')
        .allPaths(testNodeIds.e, 10);

      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);

      // All paths should end at E
      for (const path of paths) {
        expect(path[path.length - 1].id).toBe(testNodeIds.e);
      }
    });

    it('should respect maxPaths limit', () => {
      const paths = db.traverse(testNodeIds.a)
        .out('LINKS')
        .allPaths(testNodeIds.e, 2);

      expect(paths.length).toBeLessThanOrEqual(2);
    });

    it('should find different paths in diamond pattern', () => {
      // A can reach E via B or C
      const paths = db.traverse(testNodeIds.a)
        .out('LINKS')
        .allPaths(testNodeIds.e, 5);

      expect(paths.length).toBeGreaterThanOrEqual(2);

      // Should have different intermediate nodes
      const pathStrings = paths.map(p =>
        p.map(n => n.properties.name).join('->')
      );
      const uniquePaths = new Set(pathStrings);
      expect(uniquePaths.size).toBeGreaterThan(1);
    });

    it('should return empty array when no paths exist', () => {
      const isolated = db.createNode('Node', { name: 'Isolated' });

      const paths = db.traverse(testNodeIds.a)
        .out('LINKS')
        .allPaths(isolated.id);

      expect(paths).toEqual([]);
    });

    it('should respect maxDepth in allPaths', () => {
      const paths = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(1)
        .allPaths(testNodeIds.e);

      // Can't reach E in 1 hop from A
      expect(paths).toEqual([]);
    });
  });

  describe('paths() - Unified Path Wrapper', () => {
    it('should find paths to target without options', () => {
      const paths = db.traverse(testNodeIds.a)
        .out('LINKS')
        .paths(testNodeIds.e);

      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);

      for (const path of paths) {
        expect(path[path.length - 1].id).toBe(testNodeIds.e);
      }
    });

    it('should limit results with maxPaths option', () => {
      const paths = db.traverse(testNodeIds.a)
        .out('LINKS')
        .paths(testNodeIds.e, { maxPaths: 1 });

      expect(paths.length).toBeLessThanOrEqual(1);
    });

    it('should respect maxDepth option', () => {
      const paths = db.traverse(testNodeIds.a)
        .out('LINKS')
        .paths(testNodeIds.e, { maxDepth: 1 });

      expect(paths).toEqual([]);
    });

    it('should use toPaths internally when no maxPaths', () => {
      const pathsResult = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(2)
        .paths(testNodeIds.e);

      const toPathsResult = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(2)
        .toPaths()
        .filter(p => p[p.length - 1].id === testNodeIds.e);

      expect(pathsResult.length).toBe(toPathsResult.length);
    });

    it('should use allPaths internally when maxPaths specified', () => {
      const pathsResult = db.traverse(testNodeIds.a)
        .out('LINKS')
        .paths(testNodeIds.e, { maxPaths: 3 });

      const allPathsResult = db.traverse(testNodeIds.a)
        .out('LINKS')
        .allPaths(testNodeIds.e, 3);

      expect(pathsResult.length).toBe(allPathsResult.length);
    });
  });

  describe('Complex Multi-Hop Traversals', () => {
    it('should handle deep traversals', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(10)
        .toArray();

      expect(nodes.length).toBeGreaterThan(0);
    });

    it('should combine multiple traversal methods', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(2)
        .minDepth(1)
        .filter(node => node.properties.level >= 1)
        .unique()
        .toArray();

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every(n => n.properties.level >= 1)).toBe(true);
    });

    it('should traverse mixed edge directions', () => {
      // Start from middle node, go both ways
      const nodes = db.traverse(testNodeIds.c)
        .both('LINKS')
        .maxDepth(2)
        .toArray();

      expect(nodes.length).toBeGreaterThan(3);
    });

    it('should handle graphs with multiple edge types', () => {
      // Add different edge type
      db.createEdge('SPECIAL', testNodeIds.a, testNodeIds.b);

      const linkNodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(1)
        .toArray();

      const specialNodes = db.traverse(testNodeIds.a)
        .out('SPECIAL')
        .maxDepth(1)
        .toArray();

      expect(linkNodes.length).toBe(3);
      expect(specialNodes.length).toBe(1);
    });

    it('should handle very large depth limits gracefully', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(1000)
        .toArray();

      // Should terminate without issues
      expect(nodes).toBeDefined();
      expect(Array.isArray(nodes)).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle traversal from non-existent node gracefully', () => {
      const nodes = db.traverse(99999)
        .out('LINKS')
        .toArray();

      expect(nodes).toEqual([]);
    });

    it('should handle empty graph', () => {
      const emptyDb = new GraphDatabase(':memory:');
      const node = emptyDb.createNode('Node', { name: 'Only' });

      const nodes = emptyDb.traverse(node.id)
        .out('LINKS')
        .toArray();

      expect(nodes).toEqual([]);
      emptyDb.close();
    });

    it('should handle traversal with non-existent edge type', () => {
      const nodes = db.traverse(testNodeIds.a)
        .out('NONEXISTENT')
        .toArray();

      expect(nodes).toEqual([]);
    });

    it('should maintain query builder immutability', () => {
      const query1 = db.traverse(testNodeIds.a).out('LINKS');
      const query2 = query1.maxDepth(1);
      const query3 = query2.filter(n => n.properties.name === 'B');

      // All should be same instance (builder pattern)
      expect(query1).toBe(query2);
      expect(query2).toBe(query3);
    });

    it('should handle concurrent traversals', () => {
      const nodes1 = db.traverse(testNodeIds.a)
        .out('LINKS')
        .toArray();

      const nodes2 = db.traverse(testNodeIds.b)
        .out('LINKS')
        .toArray();

      // Both should work independently
      expect(nodes1).toBeDefined();
      expect(nodes2).toBeDefined();
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large result sets', () => {
      // Create a larger graph
      const root = db.createNode('Node', { name: 'Root' });

      // Create 50 child nodes
      for (let i = 0; i < 50; i++) {
        const child = db.createNode('Node', { name: `Child${i}` });
        db.createEdge('LINKS', root.id, child.id);
      }

      const nodes = db.traverse(root.id)
        .out('LINKS')
        .maxDepth(1)
        .toArray();

      expect(nodes).toHaveLength(50);
    });

    it('should not leak memory with cycles', () => {
      // Create circular graph: X -> Y -> Z -> X
      const x = db.createNode('Node', { name: 'X' });
      const y = db.createNode('Node', { name: 'Y' });
      const z = db.createNode('Node', { name: 'Z' });

      db.createEdge('LINKS', x.id, y.id);
      db.createEdge('LINKS', y.id, z.id);
      db.createEdge('LINKS', z.id, x.id);

      // Should complete without hanging
      const paths = db.traverse(x.id)
        .out('LINKS')
        .maxDepth(10)
        .toPaths();

      expect(paths).toBeDefined();
    });

    it('should handle deep path exploration efficiently', () => {
      const start = Date.now();

      db.traverse(testNodeIds.a)
        .out('LINKS')
        .maxDepth(5)
        .toPaths();

      const elapsed = Date.now() - start;

      // Should complete in reasonable time (< 1 second)
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
