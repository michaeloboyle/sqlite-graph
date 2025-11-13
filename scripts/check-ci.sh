#!/bin/bash
# Quick CI status checker for sqlite-graph

echo "🔍 Checking CI status for sqlite-graph..."
echo ""

# Get latest CI run
LATEST=$(gh run list --repo michaeloboyle/sqlite-graph --workflow=CI --limit 1 --json status,conclusion,displayTitle,createdAt,databaseId)

# Parse and display
STATUS=$(echo "$LATEST" | jq -r '.[0].status')
CONCLUSION=$(echo "$LATEST" | jq -r '.[0].conclusion')
TITLE=$(echo "$LATEST" | jq -r '.[0].displayTitle')
CREATED=$(echo "$LATEST" | jq -r '.[0].createdAt')
RUN_ID=$(echo "$LATEST" | jq -r '.[0].databaseId')

# Color output
if [ "$STATUS" = "completed" ]; then
    if [ "$CONCLUSION" = "success" ]; then
        echo "✅ Status: SUCCESS"
    else
        echo "❌ Status: FAILED ($CONCLUSION)"
    fi
else
    echo "⏳ Status: $STATUS"
fi

echo "📝 Commit: $TITLE"
echo "🕐 Started: $CREATED"
echo "🔗 URL: https://github.com/michaeloboyle/sqlite-graph/actions/runs/$RUN_ID"
echo ""

# Offer to view logs if failed
if [ "$STATUS" = "completed" ] && [ "$CONCLUSION" != "success" ]; then
    echo "View failure logs? (y/n)"
    read -r response
    if [ "$response" = "y" ]; then
        gh run view $RUN_ID --log-failed
    fi
fi
