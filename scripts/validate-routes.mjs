#!/usr/bin/env node

/**
 * Sidebar Route Validation Script
 * Checks all sidebar navigation routes for proper configuration
 * 
 * Usage: node scripts/validate-routes.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

/**
 * Check if a page route exists
 */
function checkPageRoute(routePath) {
  const cleanPath = routePath.replace(/^\//, '').split('?')[0];
  if (!cleanPath) return true; // Root always exists

  // Check for page.tsx
  const pagePath = path.join(projectRoot, 'src/app', cleanPath, 'page.tsx');
  if (fs.existsSync(pagePath)) {
    return { exists: true, fileFound: pagePath };
  }

  // Check directory itself (folder-based route)
  const dirPath = path.join(projectRoot, 'src/app', cleanPath);
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    // Check for layout.tsx or other files
    const files = fs.readdirSync(dirPath);
    if (files.length > 0) {
      return { exists: true, fileFound: dirPath };
    }
  }

  return { exists: false };
}

/**
 * Extract routes from navigationConfig
 */
function extractRoutesFromConfig() {
  const configPath = path.join(projectRoot, 'src/lib/navigationConfig.tsx');
  
  if (!fs.existsSync(configPath)) {
    console.error('❌ navigationConfig.tsx not found');
    return [];
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  
  // Simple regex to extract href values
  const hrefMatches = content.match(/href:\s*['"]([^'"]+)['"]/g) || [];
  const routes = hrefMatches
    .map(match => match.replace(/href:\s*['"]|['"]/g, ''))
    .filter(route => route && !route.startsWith('http')); // Exclude external links

  return [...new Set(routes)]; // Remove duplicates
}

/**
 * Validate all routes
 */
function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 DRAIS SIDEBAR ROUTE VALIDATION');
  console.log('='.repeat(80));

  const routes = extractRoutesFromConfig();
  console.log(`\n📋 Found ${routes.length} routes in navigationConfig\n`);

  let validCount = 0;
  let missingCount = 0;
  const missingRoutes = [];

  // Check each route
  for (const route of routes) {
    const check = checkPageRoute(route);
    const status = check.exists ? '✅' : '❌';
    
    if (check.exists) {
      validCount++;
      console.log(`${status} ${route.padEnd(40)} FOUND`);
    } else {
      missingCount++;
      missingRoutes.push(route);
      console.log(`${status} ${route.padEnd(40)} MISSING`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total Routes    : ${routes.length}`);
  console.log(`  ✅ Valid Routes  : ${validCount}`);
  console.log(`  ❌ Missing Routes: ${missingCount}`);
  console.log(`  Success Rate    : ${((validCount / routes.length) * 100).toFixed(1)}%`);
  console.log();

  if (missingCount > 0) {
    console.log('⚠️  MISSING ROUTES (Need to implement):');
    for (const route of missingRoutes) {
      console.log(`   - ${route} → Create src/app${route}/page.tsx`);
    }
    console.log();
  }

  console.log(
    missingCount === 0
      ? '✅ All sidebar routes are properly configured!\n'
      : `⚠️  ${missingCount} route(s) need to be implemented.\n`
  );

  console.log('💡 NEXT STEPS:');
  console.log('   1. For missing routes, create src/app/[route]/page.tsx files');
  console.log('   2. For placeholder pages, use /not-implemented route');
  console.log('   3. Remove routes from navigationConfig that are not needed\n');

  process.exit(missingCount > 0 ? 1 : 0);
}

main();
