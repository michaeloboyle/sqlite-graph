#!/bin/bash
# Import historical data into AgentDB

echo "Importing historical benchmark data..."

# Import Node.js baseline benchmarks
if [ -f "experiments/browser-poc/benchmark-node.json" ]; then
  cp experiments/browser-poc/benchmark-node.json .agentdb/memory/benchmark-baseline-$(date +%Y%m%d).json
  echo "✅ Imported benchmark baseline"
fi

# Import implementation status
if [ -f "docs/IMPLEMENTATION-STATUS.md" ]; then
  # Extract completed tasks and patterns
  grep -E "✅|COMPLETE" docs/IMPLEMENTATION-STATUS.md > .agentdb/memory/completed-tasks.txt
  echo "✅ Imported implementation status"
fi

# Import browser POC learnings
if [ -f "experiments/browser-poc/poc-summary.md" ]; then
  # Extract key findings
  grep -A 5 "Key Findings" experiments/browser-poc/poc-summary.md > .agentdb/memory/browser-poc-findings.txt
  echo "✅ Imported POC findings"
fi

echo "Historical data import complete!"
