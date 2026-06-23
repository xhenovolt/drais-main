# DRAIS — Transfer to another PC and run from a LOCAL `drais` database

Goal: move DRAIS to a computer with XAMPP, import the database, build the `.exe`,
and run in **Local mode** starting **exactly where online is — no data loss**.

## 1. Export the online database (on the dev machine)
```
npm run db:export:full
```
Produces `database/exports/drais-<version>.sql` (schema **+ all data**, ~48 MB).
This file creates a database named **`drais`** and every table/row. It is
gitignored (contains real data — never commit it). Re-run any time to refresh
the snapshot to the latest online state.

## 2. On the target PC
1. Install **XAMPP**, start **MySQL** (Apache optional).
2. Open **phpMyAdmin** → **Import** → choose `drais-<version>.sql` → Go.
   (Or CLI: `mysql -u root < drais-<version>.sql`)
   This creates the `drais` database with all data.
   - Big file note: in `php.ini` raise `upload_max_filesize` + `post_max_size`
     above ~60 MB, or use the CLI import.
3. Copy the DRAIS project folder to the PC and `npm install`.

## 3. Tell the app to use the local DB
Create the desktop config so Local mode is allowed and points at XAMPP. Either
ship it bundled at `build/.env.production`, or after install edit
`%APPDATA%/DRAIS/drais.env`. Contents:
```
# keep online creds too, so the user can switch back to Online
TIDB_HOST=gateway01.eu-central-1.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=...
TIDB_PASSWORD=...
TIDB_DB=drais

# local (XAMPP) — enables the "Local Server" switch
DRAIS_ALLOW_LOCAL=true
DRAIS_DB_MODE=local
LOCAL_MYSQL_HOST=127.0.0.1
LOCAL_MYSQL_PORT=3306
LOCAL_MYSQL_USER=root
LOCAL_MYSQL_PASSWORD=
LOCAL_MYSQL_DATABASE=drais
```

## 4. Build + run
```
npm run dist:win
```
Run the installer/`.exe`. On the login screen (and navbar) pick **Local Server**
— the app now reads/writes the local `drais` database, which is a full copy of
online. Switch back to **Online Cloud** any time (it re-checks reachability).

## CLI alternative (instead of phpMyAdmin)
```
npm run db:local:init      # creates `drais` locally + applies the newest export
npm run db:local:verify    # confirms core tables + row counts
```
These read `LOCAL_MYSQL_*` from `.env.local`.

## Keeping local in sync later
Local and online are independent after import. Re-run `db:export:full` + re-import
to refresh local from online. (Two-way sync is a separate, future feature.)
