#!/bin/bash
set -e

echo "Running post-merge setup..."
npm install --prefer-offline
echo "Post-merge setup complete."
