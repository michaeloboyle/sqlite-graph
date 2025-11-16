#!/bin/bash
# Create initial GitHub issues from documentation analysis

echo "Creating GitHub issues from documentation..."

# Issue 1: Browser Testing
gh issue create \
  --title "Validate browser adapter in Chrome, Firefox, Safari" \
  --label "browser-support,testing,skill-ready" \
  --milestone "v1.0.0" \
  --body "## Browser Testing

Run test.html and benchmark.html across all major browsers to validate BrowserAdapter implementation.

### Browsers
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)

### VFS Backends
- [ ] OPFS (Origin Private File System)
- [ ] IndexedDB (Fallback)
- [ ] Memory (In-memory)

### Success Criteria
- All 19 tests pass in each browser
- OPFS detection works correctly
- IndexedDB fallback functions properly
- Performance within 2.5x Node.js baseline

### AgentDB Info
**Pattern:** browser-testing-sqlite-graph
**Estimated Time:** 15-20 minutes (automated via Playwright)
**Can be automated with:** \`agentdb-browser-test\` skill

### Commands
\`\`\`bash
cd experiments/browser-poc
npx http-server . -p 8080
open http://localhost:8080/test.html
open http://localhost:8080/benchmark.html
\`\`\`

See [benchmark-results.md](experiments/browser-poc/docs/benchmark-results.md) for details."

# Issue 2: Setup CI/CD
gh issue create \
  --title "Setup GitHub Actions CI/CD pipeline" \
  --label "ci-cd,automation,skill-ready" \
  --milestone "v1.0.0" \
  --body "## GitHub Actions CI/CD Setup

Create comprehensive CI/CD workflow for automated testing and deployment.

### Required Workflows

- [ ] **Linting** - ESLint + Prettier
- [ ] **Testing** - Jest test suite (all 234+ tests)
- [ ] **Build** - TypeScript compilation
- [ ] **Browser Testing** - Playwright automation
- [ ] **Coverage** - Test coverage reporting
- [ ] **Benchmarks** - Performance regression detection
- [ ] **npm Publish** - Automated release on tag

### Success Criteria
- All PRs must pass CI before merge
- Coverage >80%
- Benchmarks within 10% of baseline
- Automated npm publish on version tags

### AgentDB Info
**Pattern:** ci-cd-setup
**Estimated Time:** 60-90 minutes
**Complexity:** Medium

### Related
- AgentDB learning pipeline: [agentdb-learning.yml](.github/workflows/agentdb-learning.yml)
- Browser test template: [browser-testing.yml](.github/ISSUE_TEMPLATE/browser-testing.yml)"

# Issue 3: Fix Database.test.ts
gh issue create \
  --title "Fix failing Database.test.ts test suite" \
  --label "bug,testing,needs-investigation" \
  --milestone "v1.0.0" \
  --body "## Bug: Database.test.ts Failures

One test suite in Database.test.ts is failing and needs investigation.

### Current Status
- ✅ 29+ other tests passing
- ❌ Database.test.ts has failures

### Steps to Reproduce
\`\`\`bash
npm test -- Database.test.ts
\`\`\`

### Expected Behavior
All Database.test.ts tests should pass

### Investigation Needed
- [ ] Identify specific failing test(s)
- [ ] Determine root cause
- [ ] Fix implementation or test
- [ ] Verify no regressions

### AgentDB Info
**Pattern:** test-debugging
**Similar Issues:** AgentDB will search for similar test failures
**Can analyze with:** \`agentdb-issue-analyzer\` skill"

# Issue 4: Generate API Documentation
gh issue create \
  --title "Generate API documentation with TypeDoc" \
  --label "docs,skill-ready" \
  --milestone "v1.0.0" \
  --body "## API Documentation Generation

Generate comprehensive API documentation from JSDoc comments using TypeDoc.

### Tasks
- [ ] Install TypeDoc
- [ ] Configure typedoc.json
- [ ] Generate docs from src/**/*.ts
- [ ] Deploy to GitHub Pages
- [ ] Update README with docs link

### Output Location
\`docs/api/\` (git ignored, deployed to gh-pages branch)

### Success Criteria
- All public APIs documented
- Examples included
- Searchable documentation
- Auto-generated on releases

### References
- Existing JSDoc comments in codebase
- TypeDoc: https://typedoc.org/

### AgentDB Info
**Pattern:** documentation-generation
**Estimated Time:** 30-45 minutes"

# Issue 5: Implement Async Database API
gh issue create \
  --title "Implement async Database API (breaking change)" \
  --label "breaking-change,browser-support,sparc-ready" \
  --milestone "v1.0.0" \
  --body "## Breaking Change: Async Database API

Convert all Database methods from sync to async for browser compatibility.

### Rationale
- Browser WASM requires async (no sync file I/O)
- Universal API works everywhere
- No breaking changes concern (pre-v1.0, zero adoption)

### Scope
- [ ] \`Database.create()\` - Factory method
- [ ] \`createNode()\`, \`createEdge()\` - CRUD ops
- [ ] \`nodes()\`, \`edges()\` - Query builders
- [ ] \`transaction()\` - Transaction handling
- [ ] All NodeQuery methods
- [ ] All TraversalQuery methods
- [ ] Update all tests (234+ tests)
- [ ] Update all examples
- [ ] Update all documentation

### Migration Example
\`\`\`typescript
// Before (v0.x - sync)
const db = new GraphDatabase('./graph.db');
const node = db.createNode('Job', { title: 'Engineer' });

// After (v1.0 - async)
const db = await GraphDatabase.create('./graph.db');
const node = await db.createNode('Job', { title: 'Engineer' });
\`\`\`

### AgentDB Info
**Pattern:** async-api-migration
**Complexity:** High (4-6 hours estimated)
**Recommended Approach:** SPARC multi-agent swarm
**Agents Needed:** specification, architect, coder (2x parallel), tester, reviewer

### References
- Adapter pattern: [experiments/browser-poc/](experiments/browser-poc/)
- NodeAdapter: sync wrapper for better-sqlite3
- BrowserAdapter: native async for wa-sqlite"

echo "✅ Created 5 initial GitHub issues"
echo "Run: gh issue list --milestone 'v1.0.0' to see all issues"
