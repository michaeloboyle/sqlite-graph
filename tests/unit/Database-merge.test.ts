import { GraphDatabase } from '../../src/core/Database';
import { MergeConflictError } from '../../src/types/merge';

describe('GraphDatabase - Merge Operations', () => {
  let db: GraphDatabase;

  beforeEach(() => {
    db = new GraphDatabase(':memory:');
  });

  afterEach(async () => {
    await db.close();
  });

  describe('mergeNode()', () => {
    describe('Node creation', () => {
      it('should create new node when no match found', async () => {
        const result = await db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1' },
          { title: 'Engineer', status: 'active', url: 'https://example.com/job/1' }
        );

        expect(result.created).toBe(true);
        expect(result.node.type).toBe('Job');
        expect(result.node.properties.url).toBe('https://example.com/job/1');
        expect(result.node.properties.title).toBe('Engineer');
        expect(result.node.properties.status).toBe('active');
      });

      it('should merge matchProperties with baseProperties on create', async () => {
        const result = await db.mergeNode(
          'Company',
          { name: 'TechCorp' },
          { name: 'TechCorp', industry: 'SaaS', size: 'Large' }
        );

        expect(result.created).toBe(true);
        expect(result.node.properties).toMatchObject({
          name: 'TechCorp',
          industry: 'SaaS',
          size: 'Large'
        });
      });

      it('should apply onCreate properties when creating', async () => {
        const result = await db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1' },
          { url: 'https://example.com/job/1', title: 'Engineer' },
          { onCreate: { discovered: '2024-01-01', status: 'new' } as any }
        );

        expect(result.created).toBe(true);
        expect((result.node.properties as any).discovered).toBe('2024-01-01');
        expect((result.node.properties as any).status).toBe('new');
      });

      it('should not apply onMatch properties when creating', async () => {
        const result = await db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1' },
          { url: 'https://example.com/job/1', title: 'Engineer' },
          { onMatch: { lastSeen: '2024-01-01' } as any }
        );

        expect(result.created).toBe(true);
        expect((result.node.properties as any).lastSeen).toBeUndefined();
      });
    });

    describe('Node matching and update', () => {
      it('should find existing node by match criteria', async () => {
        const created = await db.createNode('Job', {
          url: 'https://example.com/job/1',
          title: 'Engineer',
          status: 'active'
        });

        const result = await db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1' }
        );

        expect(result.created).toBe(false);
        expect(result.node.id).toBe(created.id);
      });

      it('should apply onMatch properties on existing node', async () => {
        await db.createNode('Job', {
          url: 'https://example.com/job/1',
          title: 'Engineer',
          status: 'active'
        });

        const result = await db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1' },
          undefined,
          { onMatch: { status: 'applied', lastSeen: '2024-01-01' } }
        );

        expect(result.created).toBe(false);
        expect(result.node.properties.status).toBe('applied');
        expect(result.node.properties.lastSeen).toBe('2024-01-01');
        // Original properties should be preserved
        expect(result.node.properties.title).toBe('Engineer');
        expect(result.node.properties.url).toBe('https://example.com/job/1');
      });

      it('should not apply onCreate properties when matching', async () => {
        await db.createNode('Job', {
          url: 'https://example.com/job/1',
          title: 'Engineer'
        });

        const result = await db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1' },
          undefined,
          { onCreate: { discovered: '2024-01-01' } }
        );

        expect(result.created).toBe(false);
        expect(result.node.properties.discovered).toBeUndefined();
      });

      it('should match with multiple criteria (AND logic)', async () => {
        await db.createNode('Job', {
          url: 'https://example.com/job/1',
          company: 'TechCorp',
          title: 'Engineer'
        });

        const result = await db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1', company: 'TechCorp' }
        );

        expect(result.created).toBe(false);
      });

      it('should create new node if any match criterion differs', async () => {
        await db.createNode('Job', {
          url: 'https://example.com/job/1',
          company: 'TechCorp'
        });

        // Different company - should create new node
        const result = await db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1', company: 'Other Corp' },
          { url: 'https://example.com/job/1', company: 'Other Corp', title: 'Job' }
        );

        expect(result.created).toBe(true);
      });
    });

    describe('Conflict detection', () => {
      it('should throw error when multiple nodes match', async () => {
        await db.createNode('Company', { industry: 'SaaS', name: 'Corp1' });
        await db.createNode('Company', { industry: 'SaaS', name: 'Corp2' });

        await expect(db.mergeNode(
            'Company',
            { industry: 'SaaS' },
            { industry: 'SaaS', size: 'Large' }
          )).rejects.toThrow(MergeConflictError);
      });

      it('should include conflict details in error', async () => {
        await db.createNode('Job', { status: 'active', title: 'Job1' });
        await db.createNode('Job', { status: 'active', title: 'Job2' });

        try {
          await db.mergeNode('Job', { status: 'active' }, { status: 'active' });
          fail('Should have thrown MergeConflictError');
        } catch (error) {
          expect(error).toBeInstanceOf(MergeConflictError);
          const mergeError = error as MergeConflictError;
          expect(mergeError.conflictingNodes.length).toBe(2);
          expect(mergeError.matchProperties).toEqual({ status: 'active' });
        }
      });

      it('should not throw when only one node matches', async () => {
        await db.createNode('Company', { name: 'TechCorp', industry: 'SaaS' });

        expect(async () => {
          await db.mergeNode(
            'Company',
            { name: 'TechCorp' },
            { name: 'TechCorp', size: 'Large' }
          );
        }).not.toThrow();
      });
    });

    describe('Edge cases', () => {
      it('should throw on invalid node type', async () => {
        await expect(db.mergeNode('', { name: 'Test' }, { name: 'Test' })).rejects.toThrow();
      });

      it('should throw on empty matchProperties', async () => {
        await expect(db.mergeNode('Job', {}, { title: 'Engineer' })).rejects.toThrow(/Match properties cannot be empty/);
      });

      it('should handle nested properties', async () => {
        const result = await db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1' },
          {
            url: 'https://example.com/job/1',
            details: {
              remote: true,
              benefits: ['health', '401k']
            }
          }
        );

        expect(result.created).toBe(true);
        expect(result.node.properties.details).toEqual({
          remote: true,
          benefits: ['health', '401k']
        });
      });
    });
  });

  describe('mergeEdge()', () => {
    let jobId: number;
    let companyId: number;

    beforeEach(async () => {
      jobId = (await db.createNode('Job', { title: 'Engineer' })).id;
      companyId = (await db.createNode('Company', { name: 'TechCorp' })).id;
    });

    describe('Edge creation', () => {
      it('should create new edge when none exists', async () => {
        const result = await db.mergeEdge(
          jobId,
          'POSTED_BY',
          companyId,
          { posted_date: '2024-01-01' }
        );

        expect(result.created).toBe(true);
        expect(result.edge.type).toBe('POSTED_BY');
        expect(result.edge.from).toBe(jobId);
        expect(result.edge.to).toBe(companyId);
        expect(result.edge.properties).toEqual({ posted_date: '2024-01-01' });
      });

      it('should create edge without properties', async () => {
        const result = await db.mergeEdge(jobId, 'POSTED_BY', companyId);

        expect(result.created).toBe(true);
        expect(result.edge.properties).toBeUndefined();
      });

      it('should apply onCreate properties when creating', async () => {
        const result = await db.mergeEdge(
          jobId,
          'POSTED_BY',
          companyId,
          { status: 'draft' },
          { onCreate: { created_date: '2024-01-01' } as any }
        );

        expect(result.created).toBe(true);
        expect((result.edge.properties as any)?.created_date).toBe('2024-01-01');
        expect((result.edge.properties as any)?.status).toBe('draft');
      });
    });

    describe('Edge matching and update', () => {
      it('should find existing edge and apply onMatch properties', async () => {
        await db.createEdge(jobId, 'POSTED_BY', companyId, { status: 'draft' });

        const result = await db.mergeEdge(
          jobId,
          'POSTED_BY',
          companyId,
          undefined,
          { onMatch: { status: 'published', updated_date: '2024-01-02' } }
        );

        expect(result.created).toBe(false);
        expect((result.edge.properties as any)?.status).toBe('published');
        expect((result.edge.properties as any)?.updated_date).toBe('2024-01-02');
      });

      it('should merge properties not replace them', async () => {
        await db.createEdge(jobId, 'POSTED_BY', companyId, {
          status: 'draft',
          created: '2024-01-01',
          author: 'system'
        });

        const result = await db.mergeEdge(
          jobId,
          'POSTED_BY',
          companyId,
          undefined,
          { onMatch: { status: 'published' } }
        );

        expect(result.edge.properties).toEqual({
          status: 'published',
          created: '2024-01-01',
          author: 'system'
        });
      });

      it('should handle null existing properties', async () => {
        await db.createEdge(jobId, 'POSTED_BY', companyId);

        const result = await db.mergeEdge(
          jobId,
          'POSTED_BY',
          companyId,
          { status: 'published' }
        );

        expect(result.created).toBe(false);
        // When merging existing edge with null properties and providing baseProperties,
        // they should be set on match
        expect(result.edge.properties).toEqual({ status: 'published' });
      });
    });

    describe('Conflict detection', () => {
      it('should throw when multiple edges exist with same type', async () => {
        await db.createEdge(jobId, 'SIMILAR_TO', companyId);
        await db.createEdge(jobId, 'SIMILAR_TO', companyId);

        await expect(db.mergeEdge(jobId, 'SIMILAR_TO', companyId, { score: 0.9 })).rejects.toThrow(MergeConflictError);
      });

      it('should not throw when only one edge matches', async () => {
        await db.createEdge(jobId, 'POSTED_BY', companyId);

        await expect(
          db.mergeEdge(jobId, 'POSTED_BY', companyId, { status: 'updated' })
        ).resolves.toBeDefined();
      });
    });

    describe('Edge cases', () => {
      it('should throw on invalid from node', async () => {
        await expect(db.mergeEdge(999999, 'POSTED_BY', companyId)).rejects.toThrow();
      });

      it('should throw on invalid to node', async () => {
        await expect(db.mergeEdge(jobId, 'POSTED_BY', 999999)).rejects.toThrow();
      });

      it('should throw on invalid edge type', async () => {
        await expect(db.mergeEdge(jobId, '', companyId)).rejects.toThrow();
      });
    });
  });

  describe('Index Management', () => {
    describe('createPropertyIndex()', () => {
      it('should create single-property index', async () => {
        await db.createPropertyIndex('Job', 'url');

        const indexes = await db.listIndexes();
        const created = indexes.find(idx => idx.name === 'idx_merge_Job_url');

        expect(created).toBeDefined();
        expect(created?.table).toBe('nodes');
      });

      it('should create unique index when specified', async () => {
        await db.createPropertyIndex('Job', 'url', true);

        const indexes = await db.listIndexes();
        const created = indexes.find(idx => idx.name === 'idx_merge_Job_url');

        expect(created).toBeDefined();
        expect(created?.unique).toBe(true);
      });

      it('should be idempotent (no error on duplicate)', async () => {
        await db.createPropertyIndex('Job', 'url');

        await expect(db.createPropertyIndex('Job', 'url')).resolves.toBeUndefined();
      });
    });

    describe('dropIndex()', () => {
      it('should drop existing index', async () => {
        await db.createPropertyIndex('Job', 'url');
        await db.dropIndex('idx_merge_Job_url');

        const indexes = await db.listIndexes();
        const found = indexes.find(idx => idx.name === 'idx_merge_Job_url');

        expect(found).toBeUndefined();
      });

      it('should be idempotent (no error if index does not exist)', async () => {
        await expect(db.dropIndex('idx_nonexistent')).resolves.toBeUndefined();
      });
    });

    describe('listIndexes()', () => {
      it('should list custom merge indexes', async () => {
        await db.createPropertyIndex('Job', 'url');
        await db.createPropertyIndex('Company', 'name');

        const indexes = await db.listIndexes();

        expect(indexes.length).toBeGreaterThanOrEqual(2);
        expect(indexes.some(idx => idx.name === 'idx_merge_Job_url')).toBe(true);
        expect(indexes.some(idx => idx.name === 'idx_merge_Company_name')).toBe(true);
      });

      it('should only return merge indexes', async () => {
        await db.createPropertyIndex('Job', 'url');

        const indexes = await db.listIndexes();

        // Should only include idx_merge_* indexes
        expect(indexes.every(idx => idx.name.startsWith('idx_merge_'))).toBe(true);
      });
    });
  });
});
