#!/bin/bash
# apply-oc-upgrades.sh — Run this after every Google AI Studio → GitHub publish
# Usage: cd meta-prompt-architect && bash apply-oc-upgrades.sh

set -e

echo "=== Applying OC Faculty Prompt Lab Upgrades ==="

if [ ! -f "package.json" ]; then
    echo "Error: Must run from project root"
    exit 1
fi

BACKUP_DIR="$HOME/oc-upgrades/meta-prompt"

echo "Copying OC components..."
cp "$BACKUP_DIR/FacultyPresets.tsx" src/components/
cp "$BACKUP_DIR/OCSplashScreen.tsx" src/components/
cp "$BACKUP_DIR/index.oc-theme.css" src/

if ! grep -q "oc-theme.css" src/main.tsx; then
    echo "Adding theme CSS import to main.tsx..."
    sed -i '' "s|import './index.css'|import './index.css'\nimport './index.oc-theme.css'|" src/main.tsx
fi

echo "=== Done! Run 'npm run dev' to test ==="
