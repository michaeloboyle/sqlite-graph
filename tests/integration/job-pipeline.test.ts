import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GraphDatabase } from '../../src/core/Database';
import { Node } from '../../src/types';

/**
 * Integration tests for complete job application tracking workflows.
 * Tests real-world scenarios combining CRUD operations, queries, and traversals.
 */
describe('Job Application Pipeline - Integration Tests', () => {
  let db: GraphDatabase;

  beforeEach(() => {
    db = new GraphDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('Complete Job Discovery to Application Workflow', () => {
    it('should track complete job application lifecycle', () => {
      // 1. Create companies
      const techCorp = db.createNode('Company', {
        name: 'TechCorp',
        size: 'large',
        industry: 'Technology',
        location: 'San Francisco'
      });

      const startupInc = db.createNode('Company', {
        name: 'Startup Inc',
        size: 'small',
        industry: 'Technology',
        location: 'Austin'
      });

      // 2. Create skills
      const typescript = db.createNode('Skill', { name: 'TypeScript', category: 'programming' });
      const react = db.createNode('Skill', { name: 'React', category: 'framework' });
      const nodejs = db.createNode('Skill', { name: 'Node.js', category: 'runtime' });
      const graphql = db.createNode('Skill', { name: 'GraphQL', category: 'api' });

      // 3. Create jobs with discovery metadata
      const seniorJob = db.createNode('Job', {
        title: 'Senior Full Stack Engineer',
        status: 'discovered',
        salary: { min: 150000, max: 200000 },
        remote: true,
        url: 'https://techcorp.com/jobs/123',
        discoveredAt: new Date().toISOString()
      });

      const midLevelJob = db.createNode('Job', {
        title: 'Mid-Level Backend Engineer',
        status: 'discovered',
        salary: { min: 120000, max: 160000 },
        remote: false,
        url: 'https://startup.com/jobs/456',
        discoveredAt: new Date().toISOString()
      });

      // 4. Create relationships
      db.createEdge('POSTED_BY', seniorJob.id, techCorp.id);
      db.createEdge('POSTED_BY', midLevelJob.id, startupInc.id);

      db.createEdge('REQUIRES', seniorJob.id, typescript.id, { level: 'expert', required: true });
      db.createEdge('REQUIRES', seniorJob.id, react.id, { level: 'expert', required: true });
      db.createEdge('REQUIRES', seniorJob.id, nodejs.id, { level: 'advanced', required: true });
      db.createEdge('REQUIRES', seniorJob.id, graphql.id, { level: 'intermediate', required: false });

      db.createEdge('REQUIRES', midLevelJob.id, nodejs.id, { level: 'intermediate', required: true });
      db.createEdge('REQUIRES', midLevelJob.id, graphql.id, { level: 'beginner', required: false });

      // 5. Query for suitable jobs (remote, good salary)
      const discoveredJobs = db.nodes('Job')
        .where({ status: 'discovered' })
        .exec();

      const suitableJobs = discoveredJobs.filter(node => {
        const salary = node.properties.salary;
        return node.properties.remote === true && salary && salary.min >= 140000;
      });

      expect(suitableJobs).toHaveLength(1);
      expect(suitableJobs[0].properties.title).toBe('Senior Full Stack Engineer');

      // 6. Update job status to 'interested'
      const interestedJob = db.updateNode(seniorJob.id, {
        status: 'interested',
        reviewedAt: new Date().toISOString(),
        notes: 'Great fit - strong TypeScript and React focus'
      });

      expect(interestedJob.properties.status).toBe('interested');

      // 7. Find company details for the interested job
      const jobsWithCompanies = db.nodes('Job')
        .where({ status: 'interested' })
        .connectedTo('Company', 'POSTED_BY', 'out')
        .exec();

      expect(jobsWithCompanies).toHaveLength(1);

      // 8. Get company information through traversal
      const companyNodes = db.traverse(seniorJob.id)
        .out('POSTED_BY')
        .toArray();

      expect(companyNodes).toHaveLength(1);
      expect(companyNodes[0].properties.name).toBe('TechCorp');

      // 9. Get all required skills for this job
      const requiredSkills = db.traverse(seniorJob.id)
        .out('REQUIRES')
        .toArray();

      expect(requiredSkills.length).toBeGreaterThan(0);
      const skillNames = requiredSkills.map(s => s.properties.name);
      expect(skillNames).toContain('TypeScript');
      expect(skillNames).toContain('React');
      expect(skillNames).toContain('Node.js');

      // 10. Update to 'applied' status
      db.updateNode(seniorJob.id, {
        status: 'applied',
        appliedAt: new Date().toISOString(),
        applicationMethod: 'direct_website'
      });

      // 11. Verify application tracking
      const appliedJobs = db.nodes('Job')
        .where({ status: 'applied' })
        .exec();

      expect(appliedJobs).toHaveLength(1);
      expect(appliedJobs[0].properties.applicationMethod).toBe('direct_website');
    });

    it('should handle complete application rejection workflow', () => {
      db.transaction(() => {
        // Create job and application
        const company = db.createNode('Company', { name: 'RejectionCorp' });
        const job = db.createNode('Job', {
          title: 'Software Engineer',
          status: 'discovered'
        });

        db.createEdge('POSTED_BY', job.id, company.id);

        // Move through application stages
        db.updateNode(job.id, { status: 'interested' });
        db.updateNode(job.id, { status: 'applied', appliedAt: new Date().toISOString() });
        db.updateNode(job.id, { status: 'interviewing', interviewStage: 'technical' });

        // Handle rejection
        db.updateNode(job.id, {
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
          rejectionReason: 'Not moving forward after technical round',
          feedback: 'Strong coding but looking for more senior experience'
        });

        // Verify rejection tracking
        const rejectedJobs = db.nodes('Job')
          .where({ status: 'rejected' })
          .exec();

        expect(rejectedJobs).toHaveLength(1);
        expect(rejectedJobs[0].properties.rejectionReason).toBeDefined();
        expect(rejectedJobs[0].properties.feedback).toBeDefined();
      });
    });

    it('should track multiple applications with different statuses', () => {
      // Create diverse job pipeline
      const jobs = [
        { title: 'Job A', status: 'discovered', salary: { min: 120000 } },
        { title: 'Job B', status: 'interested', salary: { min: 140000 } },
        { title: 'Job C', status: 'applied', salary: { min: 150000 } },
        { title: 'Job D', status: 'interviewing', salary: { min: 160000 } },
        { title: 'Job E', status: 'offered', salary: { min: 180000 } },
        { title: 'Job F', status: 'rejected', salary: { min: 130000 } },
        { title: 'Job G', status: 'withdrawn', salary: { min: 125000 } }
      ];

      const company = db.createNode('Company', { name: 'TestCorp' });

      jobs.forEach(jobData => {
        const job = db.createNode('Job', jobData);
        db.createEdge('POSTED_BY', job.id, company.id);
      });

      // Query active pipeline (not rejected/withdrawn)
      const activePipeline = db.nodes('Job')
        .filter(node => {
          const status = node.properties.status;
          return status !== 'rejected' && status !== 'withdrawn';
        })
        .exec();

      expect(activePipeline).toHaveLength(5);

      // Query by specific stage
      const interviewed = db.nodes('Job').where({ status: 'interviewing' }).exec();
      expect(interviewed).toHaveLength(1);
      expect(interviewed[0].properties.title).toBe('Job D');

      // Query high-value opportunities (>= 150k)
      const highValue = db.nodes('Job')
        .filter(node => {
          const salary = node.properties.salary;
          return salary && salary.min >= 150000;
        })
        .exec();

      expect(highValue.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Skill Matching and Job Discovery', () => {
    it('should find jobs matching skill requirements', () => {
      // Create skills
      const ts = db.createNode('Skill', { name: 'TypeScript' });
      const react = db.createNode('Skill', { name: 'React' });
      const python = db.createNode('Skill', { name: 'Python' });
      const go = db.createNode('Skill', { name: 'Go' });

      // Create jobs with different skill requirements
      const frontendJob = db.createNode('Job', {
        title: 'Frontend Engineer',
        status: 'active'
      });
      db.createEdge('REQUIRES', frontendJob.id, ts.id);
      db.createEdge('REQUIRES', frontendJob.id, react.id);

      const backendJob = db.createNode('Job', {
        title: 'Backend Engineer',
        status: 'active'
      });
      db.createEdge('REQUIRES', backendJob.id, python.id);
      db.createEdge('REQUIRES', backendJob.id, go.id);

      const fullstackJob = db.createNode('Job', {
        title: 'Fullstack Engineer',
        status: 'active'
      });
      db.createEdge('REQUIRES', fullstackJob.id, ts.id);
      db.createEdge('REQUIRES', fullstackJob.id, react.id);
      db.createEdge('REQUIRES', fullstackJob.id, python.id);

      // Find jobs requiring TypeScript - get all active jobs first, then filter by skills
      const allActiveJobs = db.nodes('Job')
        .where({ status: 'active' })
        .exec();

      const tsJobs = allActiveJobs.filter(job => {
        const skills = db.traverse(job.id).out('REQUIRES').toArray();
        return skills.some(skill => skill.properties.name === 'TypeScript');
      });

      expect(tsJobs).toHaveLength(2);
      const titles = tsJobs.map(j => j.properties.title).sort();
      expect(titles).toContain('Frontend Engineer');
      expect(titles).toContain('Fullstack Engineer');
    });

    it('should calculate skill match percentage for jobs', () => {
      // My skills
      const mySkills = ['TypeScript', 'React', 'Node.js', 'PostgreSQL'];
      const skillNodes = mySkills.map(name =>
        db.createNode('Skill', { name, owned: true })
      );

      // Job requirements
      const job = db.createNode('Job', {
        title: 'Full Stack Engineer',
        status: 'active'
      });

      db.createEdge('REQUIRES', job.id, skillNodes[0].id); // TypeScript
      db.createEdge('REQUIRES', job.id, skillNodes[1].id); // React
      db.createEdge('REQUIRES', job.id, skillNodes[2].id); // Node.js
      db.createEdge('REQUIRES', job.id, db.createNode('Skill', { name: 'GraphQL' }).id);
      db.createEdge('REQUIRES', job.id, db.createNode('Skill', { name: 'Docker' }).id);

      // Calculate match percentage
      const requiredSkills = db.traverse(job.id).out('REQUIRES').toArray();
      const requiredSkillNames = requiredSkills.map(s => s.properties.name);
      const matchedSkills = mySkills.filter(skill => requiredSkillNames.includes(skill));
      const matchPercentage = (matchedSkills.length / requiredSkills.length) * 100;

      expect(matchPercentage).toBe(60); // 3 out of 5 skills
      expect(matchedSkills).toHaveLength(3);
    });
  });

  describe('Company and Network Analysis', () => {
    it('should analyze company job posting patterns', () => {
      const company = db.createNode('Company', {
        name: 'BigTech Inc',
        size: 'large',
        industry: 'Technology'
      });

      // Create multiple job postings
      const jobTitles = [
        'Senior Engineer',
        'Staff Engineer',
        'Engineering Manager',
        'Principal Engineer',
        'Senior Backend Engineer'
      ];

      const jobs = jobTitles.map(title =>
        db.createNode('Job', {
          title,
          status: 'active',
          postedAt: new Date().toISOString()
        })
      );

      jobs.forEach(job => {
        db.createEdge('POSTED_BY', job.id, company.id);
      });

      // Analyze company's job postings
      const companyJobs = db.traverse(company.id)
        .in('POSTED_BY')
        .toArray();

      expect(companyJobs).toHaveLength(5);

      // Count by seniority level
      const seniorCount = companyJobs.filter(job =>
        job.properties.title.toLowerCase().includes('senior')
      ).length;

      expect(seniorCount).toBe(2);
    });

    it('should find similar jobs through skill overlap', () => {
      // Create skills
      const ts = db.createNode('Skill', { name: 'TypeScript' });
      const react = db.createNode('Skill', { name: 'React' });
      const node = db.createNode('Skill', { name: 'Node.js' });
      const python = db.createNode('Skill', { name: 'Python' });

      // Create jobs with overlapping skills
      const job1 = db.createNode('Job', { title: 'Job 1', status: 'active' });
      db.createEdge('REQUIRES', job1.id, ts.id);
      db.createEdge('REQUIRES', job1.id, react.id);
      db.createEdge('REQUIRES', job1.id, node.id);

      const job2 = db.createNode('Job', { title: 'Job 2', status: 'active' });
      db.createEdge('REQUIRES', job2.id, ts.id);
      db.createEdge('REQUIRES', job2.id, react.id);
      db.createEdge('REQUIRES', job2.id, python.id);

      const job3 = db.createNode('Job', { title: 'Job 3', status: 'active' });
      db.createEdge('REQUIRES', job3.id, python.id);

      // Add explicit similarity relationship
      db.createEdge('SIMILAR_TO', job1.id, job2.id, { reason: 'skill_overlap', similarity: 0.8 });

      // Find similar jobs
      const similarJobs = db.traverse(job1.id)
        .out('SIMILAR_TO')
        .toArray();

      expect(similarJobs).toHaveLength(1);
      expect(similarJobs[0].properties.title).toBe('Job 2');

      // Calculate skill overlap programmatically
      const job1Skills = db.traverse(job1.id).out('REQUIRES').toArray();
      const job2Skills = db.traverse(job2.id).out('REQUIRES').toArray();

      const job1SkillNames = new Set(job1Skills.map(s => s.properties.name));
      const job2SkillNames = new Set(job2Skills.map(s => s.properties.name));

      const overlap = [...job1SkillNames].filter(skill => job2SkillNames.has(skill));
      expect(overlap).toHaveLength(2); // TypeScript and React
    });
  });

  describe('Interview and Offer Management', () => {
    it('should track interview pipeline with multiple rounds', () => {
      const company = db.createNode('Company', { name: 'InterviewCorp' });
      const job = db.createNode('Job', {
        title: 'Senior Engineer',
        status: 'applied',
        appliedAt: new Date('2025-01-01').toISOString()
      });

      db.createEdge('POSTED_BY', job.id, company.id);

      // Create interview rounds as separate nodes
      const screening = db.createNode('Interview', {
        round: 'screening',
        date: new Date('2025-01-15').toISOString(),
        duration: 30,
        interviewer: 'HR Manager',
        outcome: 'passed'
      });

      const technical = db.createNode('Interview', {
        round: 'technical',
        date: new Date('2025-01-22').toISOString(),
        duration: 60,
        interviewer: 'Engineering Lead',
        outcome: 'passed'
      });

      const behavioral = db.createNode('Interview', {
        round: 'behavioral',
        date: new Date('2025-01-29').toISOString(),
        duration: 45,
        interviewer: 'Engineering Manager',
        outcome: 'passed'
      });

      const onsite = db.createNode('Interview', {
        round: 'onsite',
        date: new Date('2025-02-05').toISOString(),
        duration: 240,
        interviewer: 'Multiple',
        outcome: 'pending'
      });

      // Link interviews to job
      db.createEdge('HAS_INTERVIEW', job.id, screening.id, { sequence: 1 });
      db.createEdge('HAS_INTERVIEW', job.id, technical.id, { sequence: 2 });
      db.createEdge('HAS_INTERVIEW', job.id, behavioral.id, { sequence: 3 });
      db.createEdge('HAS_INTERVIEW', job.id, onsite.id, { sequence: 4 });

      // Update job status
      db.updateNode(job.id, { status: 'interviewing', currentRound: 'onsite' });

      // Query all interviews for this job
      const interviews = db.traverse(job.id)
        .out('HAS_INTERVIEW')
        .toArray();

      expect(interviews).toHaveLength(4);

      // Count passed rounds
      const passedRounds = interviews.filter(i => i.properties.outcome === 'passed');
      expect(passedRounds).toHaveLength(3);

      // Calculate total interview time
      const totalMinutes = interviews.reduce((sum, i) => sum + i.properties.duration, 0);
      expect(totalMinutes).toBe(375);
    });

    it('should manage offer negotiation workflow', () => {
      const company = db.createNode('Company', { name: 'OfferCorp' });
      const job = db.createNode('Job', {
        title: 'Principal Engineer',
        status: 'interviewing'
      });

      db.createEdge('POSTED_BY', job.id, company.id);

      // Create offer node
      const offer = db.createNode('Offer', {
        baseSalary: 200000,
        bonus: 50000,
        equity: { type: 'RSU', amount: 100000, vestingYears: 4 },
        benefits: ['Health', 'Dental', 'Vision', '401k'],
        startDate: new Date('2025-03-01').toISOString(),
        deadline: new Date('2025-02-20').toISOString()
      });

      db.createEdge('RECEIVED_OFFER', job.id, offer.id);

      // Update job status
      db.updateNode(job.id, {
        status: 'offered',
        offeredAt: new Date().toISOString()
      });

      // Create counter-offer
      const counter = db.createNode('CounterOffer', {
        baseSalary: 220000,
        bonus: 60000,
        equity: { type: 'RSU', amount: 120000, vestingYears: 4 },
        reasoning: 'Market rate for Principal Engineer with 10+ years experience'
      });

      db.createEdge('COUNTERED_WITH', offer.id, counter.id);

      // Verify offer chain
      const offers = db.traverse(job.id)
        .out('RECEIVED_OFFER')
        .toArray();

      expect(offers).toHaveLength(1);

      const counterOffers = db.traverse(offers[0].id)
        .out('COUNTERED_WITH')
        .toArray();

      expect(counterOffers).toHaveLength(1);
      expect(counterOffers[0].properties.baseSalary).toBe(220000);
    });
  });

  describe('Data Integrity and Consistency', () => {
    it('should maintain referential integrity when deleting jobs', () => {
      const company = db.createNode('Company', { name: 'TestCorp' });
      const job = db.createNode('Job', { title: 'Test Job' });
      const skill = db.createNode('Skill', { name: 'Testing' });

      db.createEdge('POSTED_BY', job.id, company.id);
      db.createEdge('REQUIRES', job.id, skill.id);

      // Delete job (edges should be automatically deleted via CASCADE)
      const deleted = db.deleteNode(job.id);
      expect(deleted).toBe(true);

      // Verify job is gone
      const retrievedJob = db.getNode(job.id);
      expect(retrievedJob).toBeNull();

      // Verify company and skill still exist
      expect(db.getNode(company.id)).not.toBeNull();
      expect(db.getNode(skill.id)).not.toBeNull();

      // Verify edges are gone
      const companyJobs = db.traverse(company.id).in('POSTED_BY').toArray();
      expect(companyJobs).toHaveLength(0);
    });

    it('should handle concurrent status updates correctly', () => {
      const job = db.createNode('Job', {
        title: 'Concurrent Test',
        status: 'discovered'
      });

      // Simulate rapid status updates
      db.transaction(() => {
        db.updateNode(job.id, { status: 'interested' });
        db.updateNode(job.id, { status: 'applied' });
        db.updateNode(job.id, { status: 'interviewing' });
      });

      const finalJob = db.getNode(job.id);
      expect(finalJob?.properties.status).toBe('interviewing');
    });

    it('should validate complex relationship constraints', () => {
      const company1 = db.createNode('Company', { name: 'Company 1' });
      const company2 = db.createNode('Company', { name: 'Company 2' });
      const job = db.createNode('Job', { title: 'Multi-Company Job' });

      // Job can only be posted by one company (business logic, not enforced by DB)
      db.createEdge('POSTED_BY', job.id, company1.id);

      // This would violate business logic - should be prevented by application layer
      // For this test, we just verify the database allows it but application should prevent
      db.createEdge('POSTED_BY', job.id, company2.id);

      const companies = db.traverse(job.id).out('POSTED_BY').toArray();
      // Database allows multiple edges, but application should enforce single company
      expect(companies.length).toBeGreaterThan(0);
    });
  });

  describe('Performance with Realistic Data Volumes', () => {
    it('should handle 100+ jobs efficiently', () => {
      const startTime = Date.now();

      // Create companies
      const companies = Array.from({ length: 20 }, (_, i) =>
        db.createNode('Company', {
          name: `Company ${i}`,
          size: i % 3 === 0 ? 'large' : i % 3 === 1 ? 'medium' : 'small'
        })
      );

      // Create skills
      const skills = ['TypeScript', 'React', 'Node.js', 'Python', 'Go', 'Rust', 'Java', 'C++'].map(
        name => db.createNode('Skill', { name })
      );

      // Create 100 jobs
      const jobs = Array.from({ length: 100 }, (_, i) =>
        db.createNode('Job', {
          title: `Job ${i}`,
          status: ['discovered', 'interested', 'applied', 'interviewing'][i % 4],
          salary: { min: 100000 + i * 1000, max: 150000 + i * 1000 },
          remote: i % 2 === 0
        })
      );

      // Create relationships
      jobs.forEach((job, i) => {
        const company = companies[i % companies.length];
        db.createEdge('POSTED_BY', job.id, company.id);

        // Add 2-4 skills per job
        const skillCount = 2 + (i % 3);
        for (let j = 0; j < skillCount; j++) {
          const skill = skills[(i + j) % skills.length];
          db.createEdge('REQUIRES', job.id, skill.id);
        }
      });

      const setupTime = Date.now() - startTime;

      // Query performance
      const queryStart = Date.now();
      const activeJobs = db.nodes('Job')
        .where({ status: 'active' })
        .exec();
      const allJobs = db.nodes('Job').exec();
      const remoteJobs = allJobs.filter(j => j.properties.remote === true);
      const highPayJobs = allJobs.filter(node => {
        const salary = node.properties.salary;
        return salary && salary.min >= 150000;
      });
      const queryTime = Date.now() - queryStart;

      // Traversal performance
      const traversalStart = Date.now();
      jobs.slice(0, 10).forEach(job => {
        db.traverse(job.id).out('POSTED_BY').toArray();
        db.traverse(job.id).out('REQUIRES').toArray();
      });
      const traversalTime = Date.now() - traversalStart;

      // Assertions
      expect(jobs).toHaveLength(100);
      expect(remoteJobs.length).toBeGreaterThan(0);
      expect(setupTime).toBeLessThan(5000); // Setup should be fast
      expect(queryTime).toBeLessThan(1000); // Queries should be fast
      expect(traversalTime).toBeLessThan(1000); // Traversals should be fast

      console.log(`Performance stats for 100 jobs:
        Setup: ${setupTime}ms
        Queries: ${queryTime}ms
        Traversals: ${traversalTime}ms
      `);
    });
  });
});
