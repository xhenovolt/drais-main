# TiDB Cloud & Vercel Deployment Guide

## Overview

Your DRAIS application is now configured for:
- ✅ **TiDB Cloud** - Primary database (cloud MySQL)
- ✅ **Local MySQL** - Fallback database (development)
- ✅ **Vercel** - Production deployment platform
- ✅ **Dahua Device Integration** - Fingerprint access control

## Quick Start

### 1. Set Up TiDB Cloud Connection

Your `.env.local` already has TiDB credentials:
```
TIDB_HOST=gateway01.eu-central-1.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=2qzYvPUSbNa3RNc.root
TIDB_PASSWORD=Gn4OSg1m8sSMSRMq
TIDB_DB=test
```

### 2. Import Database to TiDB

Run the setup script:
```bash
bash scripts/setup-tidb.sh
```

Or manually import:
```bash
# This will prompt for TiDB password
mysql -h gateway01.eu-central-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u '2qzYvPUSbNa3RNc.root' \
  -p'Gn4OSg1m8sSMSRMq' \
  --ssl-mode=REQUIRED \
  test < database_export.sql
```

### 3. Add Dahua Device Tables to TiDB

```bash
mysql -h gateway01.eu-central-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u '2qzYvPUSbNa3RNc.root' \
  -p'Gn4OSg1m8sSMSRMq' \
  --ssl-mode=REQUIRED \
  test < database/dahua_tidb_schema.sql
```

### 4. Test Locally

```bash
# Install dependencies
npm install

# Build the application (tests TiDB connection)
npm run build

# Run development server
npm run dev
```

Application will:
1. **Try TiDB Cloud first** ✅
2. **Fall back to local MySQL if TiDB fails** ✅
3. **Work seamlessly in either configuration**

## Database Connection Logic

### How It Works

The application automatically:
1. Attempts to connect to TiDB Cloud
2. Falls back to local MySQL if TiDB is unavailable
3. Logs which database is being used
4. Works with both configurations transparently

### Configuration Files

**Primary Database (TiDB Cloud):**
- `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DB`

**Fallback Database (Local MySQL):**
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_DB`, etc.

**Code Location:**
- `src/lib/db.ts` - Database connection logic

## Deploy to Vercel

### Prerequisites

1. Create Vercel account: https://vercel.com
2. Connect your GitHub repository
3. Add environment variables to Vercel project

### Step 1: Connect GitHub

```bash
# Push your code to GitHub
git add .
git commit -m "Ready for Vercel deployment"
git push
```

### Step 2: Deploy to Vercel

1. Go to https://vercel.com/import
2. Select your GitHub repository
3. Configure build settings (already set in `vercel.json`):
   - Framework: Next.js 15.5.0
   - Build Command: `npm run build`
   - Output Directory: `.next`

### Step 3: Set Environment Variables

In Vercel project settings → Environment Variables, add:

```
# TiDB Cloud (Production Database)
TIDB_HOST=gateway01.eu-central-1.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=2qzYvPUSbNa3RNc.root
TIDB_PASSWORD=Gn4OSg1m8sSMSRMq
TIDB_DB=test

# Node Environment
NODE_ENV=production

# Application
NEXT_PUBLIC_APP_NAME=DRAIS
NEXT_PUBLIC_APP_VERSION=1.0.0

# Security (generate new values for production)
JWT_SECRET=<generate-new-jwt-secret>
REFRESH_SECRET=<generate-new-refresh-secret>
DEVICE_ENCRYPTION_KEY=<generate-new-encryption-key>
```

Generate secure secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Deploy

1. Click "Deploy" in Vercel
2. Wait for build to complete
3. Your app is live at: `https://your-project-name.vercel.app`

## Vercel Production Checklist

- [ ] All environment variables set in Vercel
- [ ] TiDB Cloud database imported
- [ ] Dahua device tables created
- [ ] Build succeeds locally: `npm run build`
- [ ] Development server works: `npm run dev`
- [ ] Database connection shows TiDB in logs
- [ ] API endpoints respond correctly
- [ ] Authentication flows work
- [ ] Next.js Image optimization configured
- [ ] CORS headers properly set (if needed)

## Monitoring & Debugging

### Check Database Connection

```bash
# In development
npm run dev

# Look for logs:
# [Database] Connected to TiDB Cloud ✅
# or
# [Database] Connected using Local MySQL
```

### View Vercel Deployment Logs

1. Go to https://vercel.com/dashboard
2. Select your project
3. Click "Deployments"
4. Click on a deployment
5. View build and runtime logs

### Common Issues

**Issue: TiDB connection timeout**
- Check if gateway01.eu-central-1.prod.aws.tidbcloud.com is accessible
- Verify credentials in .env.local
- Try connecting locally first: `mysql -h gateway01... -u user -p -e "SELECT 1;"`

**Issue: Local fallback not working**
- Ensure local MySQL is running: `mysql -u root -e "SELECT 1;"`
- Check DB_HOST, DB_USER, DB_NAME in .env.local

**Issue: Vercel build fails**
- Check build logs in Vercel dashboard
- Make sure all required environment variables are set
- Verify TypeScript compilation: `npm run build` locally

**Issue: API endpoints return 500 errors**
- Check if TiDB is reachable from Vercel infrastructure
- Add console logs to track database selection
- Review TiDB Cloud firewall settings (may need IP whitelisting)

## Database Backup & Recovery

### Backup TiDB

```bash
# Export from TiDB
mysqldump -h gateway01.eu-central-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u '2qzYvPUSbNa3RNc.root' \
  -p'Gn4OSg1m8sSMSRMq' \
  --ssl-mode=REQUIRED \
  test > tidb_backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore from Backup

```bash
# Restore to TiDB
mysql -h gateway01.eu-central-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u '2qzYvPUSbNa3RNc.root' \
  -p'Gn4OSg1m8sSMSRMq' \
  --ssl-mode=REQUIRED \
  test < tidb_backup_YYYYMMDD_HHMMSS.sql
```

## Performance Tips

1. **Use TiDB Connection Pooling:**
   - Already configured in `src/lib/db.ts`
   - Connection limit: 10 (adjustable)

2. **Optimize Queries:**
   - Use indexes (already created)
   - Pagination for large result sets

3. **Monitor Performance:**
   - TiDB Cloud console → Insights
   - Check slow query logs
   - Monitor response times

4. **Database Maintenance:**
   - Archive old device logs periodically
   - Delete old connection history entries
   - Run `ANALYZE TABLE` after bulk imports

## Security Best Practices

1. **Credentials:**
   - Use Vercel environment variables (not .env.local)
   - Rotate TiDB Cloud password periodically
   - Don't commit secrets to Git

2. **TLS/SSL:**
   - All TiDB Cloud connections use SSL
   - Vercel automatically provides HTTPS

3. **Database Access:**
   - Only Vercel IPs can access TiDB from production
   - Local development uses separate credentials
   - Enable TiDB Cloud firewall if available

4. **Application:**
   - Keep dependencies updated: `npm update`
   - Use JWT tokens for authentication
   - Validate all inputs
   - Use HTTPS only in production

## Troubleshooting Checklist

### Build Fails
- [ ] `npm install` runs without errors
- [ ] `npm run build` succeeds locally
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] All environment variables set correctly
- [ ] Database URL is accessible

### App Won't Start
- [ ] Try local database first: `npm run dev` with local MySQL
- [ ] Check database connection logs
- [ ] Verify database credentials
- [ ] Ensure tables exist

### Slow Performance
- [ ] Check TiDB slow query logs
- [ ] Add missing database indexes
- [ ] Reduce query payload sizes
- [ ] Use pagination for large datasets

### 404 or API Errors
- [ ] Verify API routes exist
- [ ] Check database connection from logs
- [ ] Validate request parameters
- [ ] Review Vercel function logs

## Next Steps

1. ✅ TiDB Cloud configured in code
2. ✅ Vercel configuration files created
3. ℹ️ **Next: Import database to TiDB Cloud**
   - Run: `bash scripts/setup-tidb.sh`
4. ℹ️ **Then: Test locally**
   - Run: `npm run dev`
5. ℹ️ **Finally: Deploy to Vercel**
   - Push to GitHub → Vercel auto-deploys

## Support & Resources

- **TiDB Cloud Docs:** https://docs.pingcap.com/tidbcloud
- **Vercel Docs:** https://vercel.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **MySQL Docs:** https://dev.mysql.com/doc

## Project Files Updated

- ✅ `.env.local` - TiDB credentials added
- ✅ `src/lib/db.ts` - TiDB connection logic with SSL
- ✅ `vercel.json` - Vercel build configuration
- ✅ `.vercelignore` - Files to exclude from deployment
- ✅ `package.json` - New scripts added
- ✅ `scripts/setup-tidb.sh` - Database setup script
- ✅ `database/dahua_tidb_schema.sql` - Dahua tables for TiDB

---

**Status:** ✅ Ready for TiDB Cloud & Vercel Deployment
**Last Updated:** Today
