import { GraphDatabase } from '../../src/core/Database';
import { MergeConflictError } from '../../src/types/merge';

describe('GraphDatabase - Merge Operations', () => {
  let db: GraphDatabase;

  beforeEach(() => {
    db = new GraphDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('mergeNode()', () => {
    describe('Node creation', () => {
      it('should create new node when no match found', () => {
        const result = db.mergeNode(
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

      it('should merge matchProperties with baseProperties on create', () => {
        const result = db.mergeNode(
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

      it('should apply onCreate properties when creating', () => {
        const result = db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1' },
          { url: 'https://example.com/job/1', title: 'Engineer' },
          { onCreate: { discovered: '2024-01-01', status: 'new' } as any }
        );

        expect(result.created).toBe(true);
        expect((result.node.properties as any).discovered).toBe('2024-01-01');
        expect((result.node.properties as any).status).toBe('new');
      });

      it('should not apply onMatch properties when creating', () => {
        const result = db.mergeNode(
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
      it('should find existing node by match criteria', () => {
        const created = db.createNode('Job', {
          url: 'https://example.com/job/1',
          title: 'Engineer',
          status: 'active'
        });

        const result = db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1' }
        );

        expect(result.created).toBe(false);
        expect(result.node.id).toBe(created.id);
      });

      it('should apply onMatch properties on existing node', () => {
        db.createNode('Job', {
          url: 'https://example.com/job/1',
          title: 'Engineer',
          status: 'active'
        });

        const result = db.mergeNode(
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

      it('should not apply onCreate properties when matching', () => {
        db.createNode('Job', {
          url: 'https://example.com/job/1',
          title: 'Engineer'
        });

        const result = db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1' },
          undefined,
          { onCreate: { discovered: '2024-01-01' } }
        );

        expect(result.created).toBe(false);
        expect(result.node.properties.discovered).toBeUndefined();
      });

      it('should match with multiple criteria (AND logic)', () => {
        db.createNode('Job', {
          url: 'https://example.com/job/1',
          company: 'TechCorp',
          title: 'Engineer'
        });

        const result = db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1', company: 'TechCorp' }
        );

        expect(result.created).toBe(false);
      });

      it('should create new node if any match criterion differs', () => {
        db.createNode('Job', {
          url: 'https://example.com/job/1',
          company: 'TechCorp'
        });

        // Different company - should create new node
        const result = db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1', company: 'Other Corp' },
          { url: 'https://example.com/job/1', company: 'Other Corp', title: 'Job' }
        );

        expect(result.created).toBe(true);
      });
    });

    describe('Conflict detection', () => {
      it('should throw error when multiple nodes match', () => {
        db.createNode('Company', { industry: 'SaaS', name: 'Corp1' });
        db.createNode('Company', { industry: 'SaaS', name: 'Corp2' });

        expect(() => {
          db.mergeNode(
            'Company',
            { industry: 'SaaS' },
            { industry: 'SaaS', size: 'Large' }
          );
        }).toThrow(MergeConflictError);
      });

      it('should include conflict details in error', () => {
        db.createNode('Job', { status: 'active', title: 'Job1' });
        db.createNode('Job', { status: 'active', title: 'Job2' });

        try {
          db.mergeNode('Job', { status: 'active' }, { status: 'active' });
          fail('Should have thrown MergeConflictError');
        } catch (error) {
          expect(error).toBeInstanceOf(MergeConflictError);
          const mergeError = error as MergeConflictError;
          expect(mergeError.conflictingNodes.length).toBe(2);
          expect(mergeError.matchProperties).toEqual({ status: 'active' });
        }
      });

      it('should not throw when only one node matches', () => {
        db.createNode('Company', { name: 'TechCorp', industry: 'SaaS' });

        expect(() => {
          db.mergeNode(
            'Company',
            { name: 'TechCorp' },
            { name: 'TechCorp', size: 'Large' }
          );
        }).not.toThrow();
      });
    });

    describe('Edge cases', () => {
      it('should throw on invalid node type', () => {
        expect(() => {
          db.mergeNode('', { name: 'Test' }, { name: 'Test' });
        }).toThrow();
      });

      it('should throw on empty matchProperties', () => {
        expect(() => {
          db.mergeNode('Job', {}, { title: 'Engineer' });
        }).toThrow(/Match properties cannot be empty/);
      });

      it('should handle nested properties', () => {
        const result = db.mergeNode(
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

    beforeEach(() => {
      jobId = db.createNode('Job', { title: 'Engineer' }).id;
      companyId = db.createNode('Company', { name: 'TechCorp' }).id;
    });

    describe('Edge creation', () => {
      it('should create new edge when none exists', () => {
        const result = db.mergeEdge(
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

      it('should create edge without properties', () => {
        const result = db.mergeEdge(jobId, 'POSTED_BY', companyId);

        expect(result.created).toBe(true);
        expect(result.edge.properties).toBeUndefined();
      });

      it('should apply onCreate properties when creating', () => {
        const result = db.mergeEdge(
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
      it('should find existing edge and apply onMatch properties', () => {
        db.createEdge(jobId, 'POSTED_BY', companyId, { status: 'draft' });

        const result = db.mergeEdge(
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

      it('should merge properties not replace them', () => {
        db.createEdge(jobId, 'POSTED_BY', companyId, {
          status: 'draft',
          created: '2024-01-01',
          author: 'system'
        });

        const result = db.mergeEdge(
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

      it('should handle null existing properties', () => {
        db.createEdge(jobId, 'POSTED_BY', companyId);

        const result = db.mergeEdge(
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
      it('should throw when multiple edges exist with same type', () => {
        db.createEdge(jobId, 'SIMILAR_TO', companyId);
        db.createEdge(jobId, 'SIMILAR_TO', companyId);

        expect(() => {
          db.mergeEdge(jobId, 'SIMILAR_TO', companyId, { score: 0.9 });
        }).toThrow(MergeConflictError);
      });

      it('should not throw when only one edge matches', () => {
        db.createEdge(jobId, 'POSTED_BY', companyId);

        expect(() => {
          db.mergeEdge(jobId, 'POSTED_BY', companyId, { status: 'updated' });
        }).not.toThrow();
      });
    });

    describe('Edge cases', () => {
      it('should throw on invalid from node', () => {
        expect(() => {
          db.mergeEdge(999999, 'POSTED_BY', companyId);
        }).toThrow();
      });

      it('should throw on invalid to node', () => {
        expect(() => {
          db.mergeEdge(jobId, 'POSTED_BY', 999999);
        }).toThrow();
      });

      it('should throw on invalid edge type', () => {
        expect(() => {
          db.mergeEdge(jobId, '', companyId);
        }).toThrow();
      });
    });
  });

  describe('Index Management', () => {
    describe('createPropertyIndex()', () => {
      it('should create single-property index', () => {
        db.createPropertyIndex('Job', 'url');

        const indexes = db.listIndexes();
        const created = indexes.find(idx => idx.name === 'idx_merge_Job_url');

        expect(created).toBeDefined();
        expect(created?.table).toBe('nodes');
      });

      it('should create unique index when specified', () => {
        db.createPropertyIndex('Job', 'url', true);

        const indexes = db.listIndexes();
        const created = indexes.find(idx => idx.name === 'idx_merge_Job_url');

        expect(created).toBeDefined();
        expect(created?.unique).toBe(true);
      });

      it('should be idempotent (no error on duplicate)', () => {
        db.createPropertyIndex('Job', 'url');

        expect(() => {
          db.createPropertyIndex('Job', 'url');
        }).not.toThrow();
      });
    });

    describe('dropIndex()', () => {
      it('should drop existing index', () => {
        db.createPropertyIndex('Job', 'url');
        db.dropIndex('idx_merge_Job_url');

        const indexes = db.listIndexes();
        const found = indexes.find(idx => idx.name === 'idx_merge_Job_url');

        expect(found).toBeUndefined();
      });

      it('should be idempotent (no error if index does not exist)', () => {
        expect(() => {
          db.dropIndex('idx_nonexistent');
        }).not.toThrow();
      });
    });

    describe('listIndexes()', () => {
      it('should list custom merge indexes', () => {
        db.createPropertyIndex('Job', 'url');
        db.createPropertyIndex('Company', 'name');

        const indexes = db.listIndexes();

        expect(indexes.length).toBeGreaterThanOrEqual(2);
        expect(indexes.some(idx => idx.name === 'idx_merge_Job_url')).toBe(true);
        expect(indexes.some(idx => idx.name === 'idx_merge_Company_name')).toBe(true);
      });

      it('should only return merge indexes', () => {
        db.createPropertyIndex('Job', 'url');

        const indexes = db.listIndexes();

        // Should only include idx_merge_* indexes
        expect(indexes.every(idx => idx.name.startsWith('idx_merge_'))).toBe(true);
      });
    });
  });
});
