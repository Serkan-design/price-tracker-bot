#!/bin/bash

# Fiyat Botu - Ubuntu Deployment Script
echo "ğŸš€ Starting Deployment..."

# 1. Root dependencies
echo "ğŸ“¦ Installing backend dependencies..."
npm install

# 2. Panel dependencies and build
echo "ğŸ“¦ Installing panel dependencies..."
cd panel
npm install
echo "âš’ï¸ Building React Dashboard..."
npm run build
cd ..

# 3. Start/Restart with PM2 (if available)
if command -v pm2 &> /dev/null
then
    echo "âœ… PM2 detected. Restarting server..."
    pm2 delete fiyat-bot 2>/dev/null
    pm2 start server.js --name fiyat-bot
    pm2 save
else
    echo "âš ï¸ PM2 not found. Starting with standard Node.js..."
    echo "💡 Tip: Install PM2 for background running: npm install -g pm2"
    node server.js
fi

echo "âœ… Deployment Finished!"
echo "ğŸ”— Admin Panel: http://$(hostname -I | awk '{print $1}'):3001"
