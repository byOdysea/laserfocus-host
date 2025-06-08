#!/bin/bash

# Build script for alpha releases
set -e

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Generate alpha version with timestamp
TIMESTAMP=$(date +"%Y%m%d%H%M")
ALPHA_VERSION="${CURRENT_VERSION}-alpha.${TIMESTAMP}"

echo "Building alpha version: $ALPHA_VERSION"

# Update package.json with alpha version
npm version $ALPHA_VERSION --no-git-tag-version

# Clean and build
yarn clean
yarn build

# Package for macOS
yarn package-mac-alpha

# Restore original version
git checkout package.json

echo "✅ Alpha build complete!"
echo "📦 DMG file location: release/Laserfocus-${ALPHA_VERSION}-arm64.dmg"
echo "📦 ZIP file location: release/Laserfocus-${ALPHA_VERSION}-arm64-mac.zip" 