# Platform Status Monitoring Dashboard

Internal monitoring and incident-management dashboard for the startup's products and services.

It is designed for a single production VM or droplet:
- Next.js app UI and APIs
- SQLite for persistent status history and incidents
- in-process health-check scheduler by default
- PM2 for process supervision
- Nginx reverse proxy
- nightly SQLite backups with retention
- optional off-droplet backup upload to S3-compatible storage

## What It Does

The platform monitors configured services, stores health-check history, creates incidents when services stay unhealthy, and provides an internal dashboard for operations.

Current capabilities include:
- project-level landing page with aggregated health
- per-project service dashboards
- live health updates over SSE with cached dashboard payloads
- manual health checks
- incidents, timeline updates, acknowledgements, and on-call ownership
- maintenance windows and service ownership
- assignment workflow for incident tasks
- Slack and email alerting
- reminder emails and escalation emails for unresolved failures
- adaptive token-aware probing (tiered intervals, incident acceleration, daily budgets)
- nightly SQLite backups on a single droplet

## How It Works

### Service Monitoring Flow

1. Services are defined in the service config layer.
2. The scheduler computes adaptive intervals per service (core vs token-metered probes).
3. Token-metered probes are budget-gated with emergency reserve for active incidents.
4. Results are stored in SQLite.
5. If failures continue across the configured threshold, an incident is opened.
6. Alerts, reminders, and escalations are processed from the latest results.
7. The dashboard reads the latest state from the database and cached event-bus payload.

### Main Runtime Pieces

- `src/lib/services-config.ts`
  Contains monitored service definitions and project grouping.
- `src/lib/health-checker.ts`
  Performs actual HTTP, keyword, and JSON-path health checks.
- `src/lib/scheduler.ts`
  Runs checks in-process on a single app instance.
- `src/lib/probe-policy.ts`
  Applies tiered probe cadence and token budget policy.
- `src/lib/database.ts`
  Stores health checks, incidents, assignments, maintenance windows, alert state, and daily token-probe usage in SQLite.
- `src/lib/alerting.ts`
  Sends Slack/email alerts, reminders, escalations, and assignment emails.
- `src/lib/event-bus.ts`
  Maintains the cached dashboard payload and broadcasts live refreshes.
- `src/proxy.ts`
  Enforces dashboard auth, API auth, and HTTPS redirect behavior in production.

## Monitoring Contract Framework

This repo now includes a generalized monitoring contract package that service
teams can adopt directly.

Contract assets:
- `monitoring-contract/monitoring-contract-v1.md`
- `monitoring-contract/schemas/*.json`
- `src/lib/monitoring-contract.ts`
- `src/scripts/monitoring-conformance.ts`
- `monitoring-contract/templates/github-actions-monitoring-conformance.yml`

What this gives you:
- a versioned endpoint contract (`monitoring-contract/v1`)
- standardized required endpoints by service profile
- reusable payload validator
- CI-ready conformance runner template for service repos

### Endpoint Profiles

- `generic`: `/health/live`, `/health/ready`, `/health/detailed`
- `llm`: generic + `/health/journey`
- `rag`: generic + `/health/journey`
- `agent-platform`: generic + `/health/journey`

### Run Conformance Locally

```bash
npm run monitoring:conformance -- \
  --base-url https://service.example.com \
  --profile rag \
  --require-healthy false \
  --retries 2 \
  --max-latency-ms 2000 \
  --max-age-seconds 300 \
  --probe-mode true \
  --output-json ./monitoring-conformance-report.json
```

Useful optional flags:
- `--auth-bearer-token <token>`
- `--auth-header-name X-Internal-Key --auth-header-value <value>`
- `--require-release true`
- `--enforce-latency true`
- `--endpoints /health/live,/health/ready,/health/detailed`

## Single-Droplet Deployment Model

This repository is now tuned for a single DigitalOcean droplet.

Production assumptions:
- one droplet
- one PM2 app instance
- one SQLite database file
- one scheduler instance
- nightly local backups
- optional offsite backup copy for disaster recovery

This is not a multi-instance HA setup. It is intentionally optimized for a single-host internal operations deployment.

## Required Production Settings

Set these in `.env.local` before exposing the dashboard:

```bash
DASHBOARD_USERNAME=ops
DASHBOARD_PASSWORD=replace-with-a-long-random-password
CHECK_RUNNER_MODE=scheduler
DATABASE_PATH=/home/dashuser/status-dashboard-data/status.db
DATABASE_BACKUP_DIR=/home/dashuser/status-dashboard-backups
DATABASE_BACKUP_RETENTION_DAYS=14
DATABASE_BACKUP_CRON=15 2 * * *
```

Recommended optional settings:

```bash
API_KEY=optional-api-key-for-automation
SLACK_WEBHOOK_URL=...
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
ALERT_EMAIL_FROM=...
ALERT_EMAIL_TO=...
# ALERT_ESCALATION_EMAIL_TO=...

# Token-aware probe policy
MONITOR_TOKEN_PROBE_GENERATION_INTERVAL_SECONDS=900
MONITOR_TOKEN_PROBE_SYNTHETIC_INTERVAL_SECONDS=1800
MONITOR_TOKEN_PROBE_INCIDENT_INTERVAL_SECONDS=120
MONITOR_TOKEN_PROBE_DEPLOYMENT_WINDOW_MINUTES=20
MONITOR_TOKEN_PROBE_DEPLOYMENT_INTERVAL_SECONDS=300
MONITOR_TOKEN_BUDGET_ENFORCED=true
MONITOR_TOKEN_BUDGET_DAILY=200000
MONITOR_TOKEN_BUDGET_PER_SERVICE_DAILY=60000
MONITOR_TOKEN_BUDGET_EMERGENCY_DAILY=40000

# Optional off-droplet backups (DigitalOcean Spaces / S3-compatible)
DATABASE_BACKUP_REMOTE_BUCKET=...
DATABASE_BACKUP_REMOTE_PREFIX=platform-status-dashboard
DATABASE_BACKUP_REMOTE_ENDPOINT=https://sgp1.digitaloceanspaces.com
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=sgp1
```

## Deploy on a DigitalOcean Droplet

### 1. Create the droplet

Recommended:
- Ubuntu 22.04 or 24.04
- at least 2 GB RAM
- a static IP if you plan to attach a domain

### 2. Run the setup script

On the new droplet:

```bash
ssh root@YOUR_DROPLET_IP
curl -sSL https://raw.githubusercontent.com/riteshthawkar/platform-status-monitoring-dashboard/main/deploy/setup.sh | bash
```

What the setup script does:
- installs Node.js, PM2, Nginx, certbot, sqlite3, and awscli
- creates user `dashuser`
- clones the app to `/home/dashuser/app`
- builds the app
- creates persistent directories:
  - `/home/dashuser/status-dashboard-data`
  - `/home/dashuser/status-dashboard-backups`
- writes `DATABASE_PATH` and `DATABASE_BACKUP_DIR` into `.env.local`
- starts the app with PM2
- installs nightly backup cron
- installs log rotation cron

### 3. Edit production env vars

```bash
sudo -u dashuser nano /home/dashuser/app/.env.local
```

At minimum set:
- `DASHBOARD_USERNAME`
- `DASHBOARD_PASSWORD`

Then restart:

```bash
sudo -u dashuser bash -lc 'cd /home/dashuser/app && pm2 restart status-dashboard'
```

### 4. Add SSL

Point your domain to the droplet, then run:

```bash
sudo bash /home/dashuser/app/deploy/setup-ssl.sh status.yourdomain.com
```

After that, Nginx and certbot will serve HTTPS and the app will redirect non-local HTTP traffic to HTTPS in production.

## Update / Redeploy

From the app directory:

```bash
bash deploy/update.sh
```

What this does:
- creates a pre-update SQLite snapshot before changing code
- pulls latest code
- installs dependencies
- rebuilds the app
- restarts PM2
- verifies `/api/health-status`
- removes legacy cron health checker if the app is using scheduler mode

Your SQLite data survives redeploy because the database file is stored outside the repo tree.

## Backup and Restore

### Automatic Backups

Nightly backup cron is installed by default.

Default schedule:
- `02:15` server time

Default backup directory:
- `/home/dashuser/status-dashboard-backups`

Each backup:
- uses SQLite `.backup`
- runs `PRAGMA integrity_check`
- writes a compressed `.sqlite3.gz`
- writes a `.meta` file with checksum and details
- prunes backups older than the configured retention period

If remote backup upload is configured, each backup also uploads the archive and
metadata file to your S3-compatible bucket. Remote retention should be handled
with bucket lifecycle rules.

### Run a Manual Backup

```bash
cd /home/dashuser/app
npm run backup:db
```

Optional labeled snapshot:

```bash
cd /home/dashuser/app
bash src/scripts/backup-database.sh --label pre-maintenance
```

### Restore a Backup

Stop the app first:

```bash
pm2 stop status-dashboard
```

Restore:

```bash
cd /home/dashuser/app
npm run restore:db -- /home/dashuser/status-dashboard-backups/status-YYYYMMDDTHHMMSSZ.sqlite3.gz
```

Then start the app again:

```bash
pm2 start status-dashboard
```

The restore script:
- verifies the backup integrity before restore
- creates a `pre-restore` copy of the current DB if one exists
- replaces the live DB file

## Useful Operations Commands

App status:

```bash
sudo -u dashuser pm2 status
```

App logs:

```bash
sudo -u dashuser pm2 logs status-dashboard
```

Backup logs:

```bash
tail -f /home/dashuser/app/logs/database-backup.log
```

Health endpoint:

```bash
curl http://localhost:3000/api/health-status
```

Manual one-time check run:

```bash
cd /home/dashuser/app
npm run check:once
```

## Security Model

Production behavior is fail-closed by default:
- if dashboard credentials are not configured, the dashboard returns `503`
- browser access requires HTTP Basic Auth
- API routes accept either dashboard credentials or `API_KEY`
- `/api/health-status` remains unauthenticated for liveness checks
- non-local production traffic redirects to HTTPS unless explicitly disabled

Important:
- do not expose the dashboard publicly without setting `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD`
- use SSL before sharing the dashboard internally

## Runner Modes

Use only one runner mode in production.

Recommended:

```bash
CHECK_RUNNER_MODE=scheduler
```

Alternative:

```bash
CHECK_RUNNER_MODE=cron
```

If you explicitly want cron mode:

```bash
bash src/scripts/setup-cron.sh
```

Do not run scheduler mode and cron mode together.

## Limits of This Deployment Model

This deployment is good for:
- one internal operations dashboard
- one droplet
- one SQLite database
- one scheduler

It is not designed for:
- multiple app instances
- shared database clustering
- HA failover
- zero-downtime multi-node deployments

If you later need multi-instance or HA, the next step is moving from SQLite and process-local live state to shared infrastructure such as Postgres and a shared pub/sub layer.
