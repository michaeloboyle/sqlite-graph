#!/bin/bash
# Diagnostic script for GitHub Actions VSCode extension

echo "🔍 Diagnosing GitHub Actions Extension..."
echo ""

# Check if gh CLI is authenticated
echo "1️⃣ GitHub CLI Authentication:"
gh auth status 2>&1 | head -5
echo ""

# Check repository access
echo "2️⃣ Repository Access:"
gh repo view michaeloboyle/sqlite-graph --json nameWithOwner,url,isPrivate
echo ""

# Check workflows
echo "3️⃣ Available Workflows:"
gh workflow list --repo michaeloboyle/sqlite-graph
echo ""

# Check recent runs
echo "4️⃣ Recent CI Runs:"
gh run list --repo michaeloboyle/sqlite-graph --workflow=CI --limit 3
echo ""

# Check VSCode settings
echo "5️⃣ VSCode GitHub Actions Settings:"
if [ -f .vscode/settings.json ]; then
    echo "Found .vscode/settings.json"
    grep -A 3 "github-actions" .vscode/settings.json || echo "No github-actions settings found"
else
    echo "No .vscode/settings.json found"
fi
echo ""

# Extension files check
echo "6️⃣ Extension State:"
VSCODE_EXT_DIR="$HOME/.vscode/extensions"
if [ -d "$VSCODE_EXT_DIR" ]; then
    ls -la "$VSCODE_EXT_DIR" | grep github.vscode-github-actions || echo "Extension not found in extensions directory"
else
    echo "VSCode extensions directory not found"
fi
echo ""

echo "✅ Diagnosis complete!"
echo ""
echo "📝 Next steps if extension still not working:"
echo "   1. Click Accounts icon (bottom-left in VSCode)"
echo "   2. Sign in with GitHub"
echo "   3. Authorize VSCode in browser"
echo "   4. Reload VSCode window (Cmd+Shift+P -> Reload Window)"
