# Hive Mind Collective Intelligence System

## Overview

The Hive Mind system provides collective intelligence coordination for the sqlite-graph project using Claude Flow's advanced orchestration capabilities.

## Initialization

The system has been initialized with the following configuration:

### System Configuration

- **Version**: 2.0.0
- **Topology**: Hierarchical (Queen-led coordination)
- **Max Workers**: 8 agents
- **Consensus Algorithm**: Majority voting
- **Auto-scaling**: Enabled
- **MCP Tools**: Enabled with parallel execution

### Directory Structure

```
.hive-mind/
├── hive.db              # Main SQLite coordination database
├── config.json          # System configuration
├── memory/              # Persistent memory storage
├── sessions/            # Session snapshots
├── backups/             # Database backups
├── logs/                # Operation logs
└── templates/           # Agent templates

.swarm/
├── state.json           # Current state checkpoint
├── global/              # Global coordination data
├── agents/              # Agent-specific state
├── notebooks/           # Development notebooks
└── sessions/            # Session-isolated data (gitignored)
```

## Usage

### Check System Status

```bash
npx claude-flow@alpha hive-mind status
```

### Spawn a Coordinated Swarm

```bash
npx claude-flow@alpha hive-mind spawn --topology hierarchical --agents 8
```

### Interactive Setup

```bash
npx claude-flow@alpha hive-mind wizard
```

## Coordination Protocol

All agents in the Hive Mind follow this protocol:

### 1. Pre-Task Hook
```bash
npx claude-flow@alpha hooks pre-task --description "[task description]"
npx claude-flow@alpha hooks session-restore --session-id "swarm-[id]"
```

### 2. During Execution
```bash
npx claude-flow@alpha hooks post-edit --file "[file]" --memory-key "swarm/[agent]/[step]"
npx claude-flow@alpha hooks notify --message "[status update]"
```

### 3. Post-Task Hook
```bash
npx claude-flow@alpha hooks post-task --task-id "[task]"
npx claude-flow@alpha hooks session-end --export-metrics true
```

## Memory Persistence

The system maintains state across sessions:

- **State Checkpoint**: `.swarm/state.json` (committed)
- **Memory Database**: `.hive-mind/hive.db` (committed)
- **Session Data**: `.swarm/sessions/` (gitignored)

### State Tracking

After every significant operation, update the state:

```bash
echo '{"current_task": "...", "last_checkpoint": "'$(date -Iseconds)'"}' > .swarm/state.json
git add .swarm/state.json && git commit -m "Swarm: [Component] [Action] [Result]"
```

## Resume Protocol

When resuming work:

```bash
# Check last state
cat .swarm/state.json

# Review recent swarm commits
git log --grep="Swarm:" -10

# Continue from checkpoint
```

## Benefits

- **Cross-session persistence**: Never lose context
- **Collective intelligence**: Agents coordinate through shared memory
- **Consensus mechanisms**: Democratic decision-making
- **Auto-scaling**: Dynamic agent allocation
- **Performance optimization**: Parallel execution with hooks
- **Audit trail**: Complete operation history

## Integration with Claude Code

The Hive Mind coordinates execution while Claude Code's Task tool performs the actual work:

1. **MCP Tools**: Set up coordination topology (optional for complex tasks)
2. **Task Tool**: Spawn actual agents that execute work
3. **Hooks**: Agents use hooks for coordination and memory sharing
4. **Memory**: Shared state via `.swarm/` and `.hive-mind/`

## Next Steps

1. Spawn your first coordinated swarm for sqlite-graph development
2. Use memory persistence for cross-session knowledge
3. Enable hooks for automatic coordination
4. Monitor system status and performance

## Support

- Documentation: [Claude Flow Docs](https://github.com/ruvnet/claude-flow)
- Issues: [GitHub Issues](https://github.com/ruvnet/claude-flow/issues)
