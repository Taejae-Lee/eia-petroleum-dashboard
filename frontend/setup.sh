#!/bin/bash
# Run this script from the frontend/ directory to complete the setup.
set -e

echo "=== Step 1: Installing dependencies ==="
npm install

echo ""
echo "=== Step 2: Creating placeholder PNG icons ==="
python3 scripts/make-icons.py

echo ""
echo "=== Step 3: TypeScript check ==="
npx tsc --noEmit

echo ""
echo "=== Done! ==="
echo "Run 'npm run dev' to start the development server."
