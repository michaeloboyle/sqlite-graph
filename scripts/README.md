# sqlite-graph Demo Scripts

## Automated Demo Runner

Interactive split-screen demonstration of newly implemented features using tmux.

### Quick Start

```bash
# Run complete demo
./scripts/automated-demo.sh all

# Fast mode (no typing effect)
./scripts/automated-demo.sh --fast all

# Recording mode (slower, better for screen recording)
./scripts/automated-demo.sh --record all

# Run specific scene
./scripts/automated-demo.sh 2  # TransactionContext demo
```

### Features Demonstrated

1. **TransactionContext API** - Manual commit/rollback with savepoints
2. **Bidirectional Queries** - 'both' direction support in NodeQuery
3. **paths() Wrapper** - Convenient path-finding API

### Requirements

- **tmux** - `brew install tmux` (macOS) or `apt install tmux` (Linux)
- **ts-node** - Installed automatically via npx
- **Terminal** - At least 120 columns wide recommended

### Usage

The script creates a split-screen tmux session:
- **Left Pane**: Code examples and documentation
- **Right Pane**: Live execution and output

### Scene Breakdown

1. **Introduction** - Project overview and feature list
2. **TransactionContext** - Manual transaction control demo
3. **Bidirectional Queries** - 'both' direction demonstration
4. **paths() Wrapper** - Path finding API showcase
5. **Summary** - Test results and completion status

### Keyboard Controls

- `Ctrl+B, D` - Detach from tmux session (keeps running)
- `Ctrl+C` - Stop demo and exit
- `tmux attach -t sqlite-graph-demo` - Reattach to session

### Tips for Recording

Use recording mode for clean screen recordings:

```bash
./scripts/automated-demo.sh --record all
```

This mode:
- Slower typing effect (0.08s per character)
- Longer pauses between commands (3s)
- Better pacing for video

### Troubleshooting

**tmux not found:**
```bash
brew install tmux  # macOS
apt install tmux   # Linux
```

**Window too small:**
Resize terminal to at least 120 columns wide.

**Demo hangs:**
Press `Ctrl+C` and run cleanup:
```bash
tmux kill-session -t sqlite-graph-demo
```
