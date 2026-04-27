import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GraphDatabase } from '../../src/core/Database';

describe('TraversalQuery - paths() wrapper', () => {
  let db: GraphDatabase;

  beforeEach(async () => {
    db = new GraphDatabase(':memory:');

    // Create a simple graph:
    // A -> B -> C
    // A -> D -> C
    // A -> E
    const a = await db.createNode('Node', { name: 'A' });
    const b = await db.createNode('Node', { name: 'B' });
    const c = await db.createNode('Node', { name: 'C' });
    const d = await db.createNode('Node', { name: 'D' });
    const e = await db.createNode('Node', { name: 'E' });

    await db.createEdge(a.id, 'LINKS', b.id);
    await db.createEdge(b.id, 'LINKS', c.id);
    await db.createEdge(a.id, 'LINKS', d.id);
    await db.createEdge(d.id, 'LINKS', c.id);
    await db.createEdge(a.id, 'LINKS', e.id);

    // Store node IDs for tests
    (db as any).testNodeIds = { a: a.id, b: b.id, c: c.id, d: d.id, e: e.id };
  });

  afterEach(async () => {
    await db.close();
  });

  it('should return all paths to target node without options', async () => {
    const ids = (db as any).testNodeIds;

    // Find all paths from A to C
    const paths = await db.traverse(ids.a)
      .out('LINKS')
      .paths(ids.c);

    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);

    // Should find both paths: A->B->C and A->D->C
    expect(paths.length).toBe(2);

    // Each path should be an array of nodes
    paths.forEach(path => {
      expect(Array.isArray(path)).toBe(true);
      expect(path.length).toBeGreaterThan(0);
      // Path should end at C
      expect(path[path.length - 1].id).toBe(ids.c);
    });
  });

  it('should limit maxPaths when option provided', async () => {
    const ids = (db as any).testNodeIds;

    // Limit to 1 path
    const paths = await db.traverse(ids.a)
      .out('LINKS')
      .paths(ids.c, { maxPaths: 1 });

    expect(paths.length).toBe(1);
    expect(paths[0][paths[0].length - 1].id).toBe(ids.c);
  });

  it('should respect maxDepth option', async () => {
    const ids = (db as any).testNodeIds;

    // With maxDepth 1, should not find C (requires 2 hops)
    const paths = await db.traverse(ids.a)
      .out('LINKS')
      .paths(ids.c, { maxDepth: 1 });

    expect(paths.length).toBe(0);

    // With maxDepth 2, should find both paths to C
    const paths2 = await db.traverse(ids.a)
      .out('LINKS')
      .paths(ids.c, { maxDepth: 2 });

    expect(paths2.length).toBe(2);
  });

  it('should use toPaths() when no maxPaths specified', async () => {
    const ids = (db as any).testNodeIds;

    // paths() without options should behave like toPaths()
    const pathsResult = await db.traverse(ids.a)
      .out('LINKS')
      .paths(ids.c);

    const toPathsResult = await db.traverse(ids.a)
      .out('LINKS')
      .toPaths();

    // Filter toPaths result to only paths ending at C
    const toPathsFiltered = toPathsResult.filter(
      path => path[path.length - 1].id === ids.c
    );

    // Should have same number of paths
    expect(pathsResult.length).toBe(toPathsFiltered.length);
  });

  it('should use allPaths() when maxPaths is specified', async () => {
    const ids = (db as any).testNodeIds;

    // paths() with maxPaths should behave like allPaths()
    const pathsResult = await db.traverse(ids.a)
      .out('LINKS')
      .paths(ids.c, { maxPaths: 5 });

    const allPathsResult = await db.traverse(ids.a)
      .out('LINKS')
      .allPaths(ids.c, 5);

    // Should return same results
    expect(pathsResult.length).toBe(allPathsResult.length);
  });

  it('should apply maxDepth before finding paths', async () => {
    const ids = (db as any).testNodeIds;

    // Set maxDepth on traversal, then call paths()
    const paths = await db.traverse(ids.a)
      .out('LINKS')
      .maxDepth(1)
      .paths(ids.c);

    // Should respect the maxDepth set on traversal
    expect(paths.length).toBe(0);
  });

  it('should override traversal maxDepth with options.maxDepth', async () => {
    const ids = (db as any).testNodeIds;

    // Set maxDepth on traversal to 1, but override with options.maxDepth 2
    const paths = await db.traverse(ids.a)
      .out('LINKS')
      .maxDepth(1)
      .paths(ids.c, { maxDepth: 2 });

    // options.maxDepth should override
    expect(paths.length).toBe(2);
  });

  it('should return empty array when no paths exist', async () => {
    const ids = (db as any).testNodeIds;

    // Create disconnected node
    const isolated = await db.createNode('Node', { name: 'Isolated' });

    const paths = await db.traverse(ids.a)
      .out('LINKS')
      .paths(isolated.id);

    expect(paths).toEqual([]);
  });

  it('should work with different edge types', async () => {
    // Create new graph with different edge types
    const x = await db.createNode('Node', { name: 'X' });
    const y = await db.createNode('Node', { name: 'Y' });
    const z = await db.createNode('Node', { name: 'Z' });

    await db.createEdge(x.id, 'TYPE_A', y.id);
    await db.createEdge(y.id, 'TYPE_A', z.id);

    const paths = await db.traverse(x.id)
      .out('TYPE_A')
      .paths(z.id);

    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0][paths[0].length - 1].id).toBe(z.id);
  });

  it('should handle self-referencing paths', async () => {
    const self = await db.createNode('Node', { name: 'Self' });
    await db.createEdge(self.id, 'LINKS', self.id);

    const paths = await db.traverse(self.id)
      .out('LINKS')
      .paths(self.id);

    // Self-loops should be prevented by cycle detection
    // A path from A to A via a self-loop would be infinite
    expect(paths.length).toBe(0);
  });

  it('should combine with other traversal methods', async () => {
    const ids = (db as any).testNodeIds;

    // Use filter before paths()
    const paths = await db.traverse(ids.a)
      .out('LINKS')
      .filter(node => node.properties.name !== 'E')
      .paths(ids.c);

    // Should still find paths to C
    expect(paths.length).toBe(2);
  });
});
