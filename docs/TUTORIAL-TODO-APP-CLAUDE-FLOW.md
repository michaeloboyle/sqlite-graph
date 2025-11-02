# Building a Todo App with Claude Code & Claude Flow

A hands-on tutorial for learning Test-Driven Development with AI-powered tooling.

## Prerequisites

1. **Install Claude Code** (VS Code extension)
2. **Install Node.js** (v18 or higher)
3. **Basic understanding** of JavaScript/TypeScript

## Setup Claude Flow MCP Server

```bash
# Add Claude Flow MCP server to Claude Code
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Verify installation
npx claude-flow@alpha --version
```

## Project Structure

```
todo-app/
├── src/
│   ├── todo.js          # Todo class and logic
│   ├── storage.js       # Persistence layer
│   └── cli.js           # Command-line interface
├── tests/
│   ├── todo.test.js     # Todo tests
│   ├── storage.test.js  # Storage tests
│   └── cli.test.js      # CLI tests
├── docs/
│   └── architecture.md  # Design decisions
├── package.json
├── .gitignore
└── CLAUDE.md           # Claude Code configuration
```

## Step 1: Initialize Project

Ask Claude Code:

```
Create a new todo-app project with:
- Node.js + Jest for testing
- ESM module support
- Git repository
- Claude Flow configuration
```

**What Claude Code will do:**
- Create directory structure
- Initialize npm project
- Setup Jest configuration
- Create CLAUDE.md for project instructions
- Initialize git repository

## Step 2: Design with SPARC (Specification)

Ask Claude Code:

```
Use SPARC methodology to design a todo app with:
- Add, complete, delete, list todos
- Persistent storage (JSON file)
- CLI interface
- Full test coverage

Start with specification phase.
```

**What happens:**
- Claude Flow spawns a `specification` agent
- Creates requirements document
- Identifies core features and constraints
- Produces detailed specification in `docs/`

## Step 3: Architecture Phase

Ask Claude Code:

```
Run SPARC architecture phase for the todo app
```

**What happens:**
- Spawns `architecture` agent
- Designs class structure
- Plans data flow
- Creates architecture document
- Identifies testing strategy

## Step 4: Test-Driven Development (TDD)

Ask Claude Code:

```
Use SPARC TDD workflow to implement the Todo class with:
- Add todo with title and description
- Mark todo as complete
- Get all todos
- Filter by status
```

**What happens in parallel:**
1. **Tester agent** writes failing tests first
2. **Coder agent** implements minimal code to pass tests
3. **Reviewer agent** checks code quality
4. **Coordinator** ensures all agents sync via hooks

**The TDD Cycle:**
```
Red → Green → Refactor
├─ Write failing test
├─ Implement minimal code
├─ Test passes
└─ Refactor and improve
```

## Step 5: Add Persistence

Ask Claude Code:

```
Add persistent storage using JSON file with TDD approach
```

**What happens:**
- Tests written first for storage layer
- Implementation follows tests
- File I/O handled safely
- Error cases covered

## Step 6: Build CLI Interface

Ask Claude Code:

```
Create CLI interface using commander.js with TDD
```

**What happens:**
- CLI tests using mocked I/O
- Command parsing implementation
- User-friendly error messages
- Help documentation

## Step 7: Integration Testing

Ask Claude Code:

```
Run SPARC integration phase to test the complete system
```

**What happens:**
- End-to-end test scenarios
- Integration between components
- Edge case validation
- Performance checks

## Understanding Claude Flow Coordination

### How Agents Coordinate

**Before each task:**
```bash
npx claude-flow@alpha hooks pre-task --description "implement todo add"
```

**After changes:**
```bash
npx claude-flow@alpha hooks post-edit --file "src/todo.js"
```

**After task completes:**
```bash
npx claude-flow@alpha hooks post-task --task-id "todo-add"
```

### Memory Sharing Between Agents

Agents share context via memory:
```javascript
// Tester agent stores test expectations
memory.store("todo/tests/add", { expects: "returns todo object" })

// Coder agent reads expectations
memory.retrieve("todo/tests/add")
```

## Key Learning Concepts

### 1. Test-First Development
```javascript
// ❌ Wrong: Write code first
function addTodo(title) {
  return { title, completed: false }
}

// ✅ Right: Write test first
test('addTodo should create todo with title', () => {
  const todo = addTodo('Buy milk')
  expect(todo.title).toBe('Buy milk')
  expect(todo.completed).toBe(false)
})
```

### 2. Parallel Agent Execution

Claude Code spawns multiple agents concurrently:
```javascript
// Single message spawns all agents in parallel:
Task("Tester", "Write tests for Todo class", "tester")
Task("Coder", "Implement Todo class", "coder")
Task("Reviewer", "Review implementation", "reviewer")
```

### 3. Coordination via Hooks

Agents stay synchronized automatically:
- Pre-task hooks assign work by file type
- Post-edit hooks update shared memory
- Post-task hooks train neural patterns

### 4. Incremental Development

Build features one at a time:
1. Add todo ✓
2. Complete todo ✓
3. Delete todo ✓
4. List todos ✓
5. Filter todos ✓
6. Persistent storage ✓
7. CLI interface ✓

## Common Commands During Development

### Run Tests
```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # Coverage report
```

### SPARC Commands
```bash
npx claude-flow sparc tdd "add todo feature"
npx claude-flow sparc run architect
npx claude-flow sparc modes  # List available modes
```

### Check Agent Status
```bash
npx claude-flow@alpha mcp start  # Start coordination server
```

## Tips for Learning

1. **Start Simple**: Begin with one feature, make it work
2. **Tests First**: Always write failing tests before code
3. **Small Commits**: Commit after each feature
4. **Ask Questions**: Claude Code explains decisions
5. **Review Code**: Ask "why did you implement it this way?"
6. **Iterate**: Refactor after tests pass

## Example Session Transcript

```
You: Create a todo app project with Jest testing

Claude: I'll create the project structure with:
- npm init with Jest
- Directory structure (src/, tests/, docs/)
- Basic package.json with test scripts
- Git repository initialization

[Creates all files in parallel]

You: Use SPARC to design the Todo class

Claude: I'll spawn a specification agent to analyze requirements...

[Specification document created in docs/]

You: Now implement with TDD

Claude: I'll spawn agents in parallel:
- Tester: Writing tests for Todo.add()
- Coder: Implementing Todo class
- Reviewer: Checking code quality

[All agents work concurrently with coordination]

You: Run the tests

Claude: Running npm test...
✓ All 8 tests passing
Coverage: 95%
```

## What Makes Claude Flow Powerful

### Traditional Development:
```
Design → Code → Test → Debug → Refactor
(Serial, slow, manual coordination)
```

### Claude Flow Development:
```
Design (Architect)
   ↓
Test (Tester) → Code (Coder) → Review (Reviewer)
   ↓              ↓               ↓
   └──────── Coordination ────────┘
(Parallel, fast, automatic coordination)
```

## Next Steps After Todo App

1. **Add Features**: Due dates, priorities, tags
2. **Web Interface**: React frontend
3. **API Backend**: Express REST API
4. **Database**: Replace JSON with SQLite
5. **Authentication**: User accounts
6. **Deployment**: Docker + CI/CD

## Troubleshooting

### Tests Failing
```
Ask: "Why is this test failing? Show me the test and implementation."
```

### Agent Not Coordinating
```bash
# Check hooks are installed
ls node_modules/.bin/claude-flow

# Verify MCP server
claude mcp list
```

### Want to Understand Code
```
Ask: "Explain how the storage layer works and why you chose this approach"
```

## Resources

- **Claude Flow Docs**: https://github.com/ruvnet/claude-flow
- **SPARC Methodology**: Run `npx claude-flow sparc info <mode>`
- **Testing with Jest**: https://jestjs.io/docs/getting-started
- **Node.js Best Practices**: https://github.com/goldbergyoni/nodebestpractices

## Key Takeaways

1. **TDD creates better code**: Tests define behavior first
2. **Parallel agents are faster**: 2.8-4.4x speedup
3. **Coordination is automatic**: Hooks handle synchronization
4. **AI explains decisions**: Learn why, not just what
5. **Incremental is better**: Build feature by feature

---

**Start your learning journey:**
```bash
mkdir todo-app && cd todo-app
# Open in VS Code with Claude Code
# Ask: "Help me build a todo app using Claude Flow and TDD"
```

Good luck! 🚀
