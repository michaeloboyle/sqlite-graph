#!/bin/bash

# Simple test to verify the demo script is executable and properly formatted

set -e

echo "🧪 Testing automated demo script..."

# Test 1: Script is executable
if [ -x "./scripts/automated-demo.sh" ]; then
    echo "✅ Script is executable"
else
    echo "❌ Script is not executable"
    exit 1
fi

# Test 2: Check for proper bash shebang
if head -1 scripts/automated-demo.sh | grep -q "^#!/bin/bash"; then
    echo "✅ Has proper bash shebang"
else
    echo "❌ Missing bash shebang"
    exit 1
fi

# Test 3: Verify no C-m syntax remains
if grep -q "C-m" scripts/automated-demo.sh; then
    echo "❌ Still contains C-m syntax (should use Enter)"
    exit 1
else
    echo "✅ Uses correct Enter syntax for tmux"
fi

# Test 4: Check required commands exist
if command -v tmux >/dev/null 2>&1; then
    echo "✅ tmux is installed"
else
    echo "❌ tmux is not installed (required)"
    exit 1
fi

if command -v npm >/dev/null 2>&1; then
    echo "✅ npm is installed"
else
    echo "❌ npm is not installed (required)"
    exit 1
fi

if command -v ts-node >/dev/null 2>&1 || npx ts-node --version >/dev/null 2>&1; then
    echo "✅ ts-node is available"
else
    echo "❌ ts-node is not available (required)"
    exit 1
fi

# Test 5: Verify demo script has proper structure
if grep -q "setup_tmux()" scripts/automated-demo.sh && \
   grep -q "exec_cmd()" scripts/automated-demo.sh && \
   grep -q "type_command()" scripts/automated-demo.sh; then
    echo "✅ All required functions present"
else
    echo "❌ Missing required functions"
    exit 1
fi

# Test 6: Check that demo files exist
if [ -f "examples/demo-new-features.ts" ]; then
    echo "✅ Demo TypeScript file exists"
else
    echo "❌ Demo file missing"
    exit 1
fi

# Test 7: Verify script can be parsed
if bash -n scripts/automated-demo.sh 2>/dev/null; then
    echo "✅ Script syntax is valid"
else
    echo "❌ Script has syntax errors"
    exit 1
fi

echo ""
echo "🎉 All tests passed!"
echo ""
echo "To run the demo interactively:"
echo "  ./scripts/automated-demo.sh all              # Full demo"
echo "  ./scripts/automated-demo.sh --fast all       # Fast mode"
echo "  ./scripts/automated-demo.sh --record all     # Recording mode"
echo "  ./scripts/automated-demo.sh 1                # Scene 1 only"
echo ""
echo "Note: The demo requires an interactive terminal with tmux support."
echo "      It won't work in non-interactive environments or CI/CD."
