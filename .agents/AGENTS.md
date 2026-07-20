# Workspace Rules for MedOPS

## Code Modifications & Changes Policy
- **ASK FOR PERMISSION FIRST**: Always present planned changes and obtain user approval before executing any file modifications, code changes, tool installations, or system-level actions.

## Deployment & Branch Pipeline Architecture
Maintain strict separation across the 3-stage environment pipeline:
1. **Local Machine / `main` Branch**: Primary codebase for feature development and local testing.
2. **`test_environment` Branch**: Staging environment hosted on Render Free Tier + Vercel Free Plan.
3. **`production` Branch**: Live public application hosted on Render Starter Tier ($7/mo with Persistent Storage at `/var/data/medops.db`) + Vercel Free Plan (Custom Domain).

## Production Safety & Database Rules (CRITICAL)
- **EXTREME CAUTION ON `production` BRANCH**:
  - Never execute destructive database scripts, raw drop commands, or `prisma db push --accept-data-loss` on or targeting production storage.
  - The live production database `/var/data/medops.db` contains real patient records and medical inventory history.
- **Persistent Storage Protection**:
  - Always preserve `boot.js` startup logic in production. It checks `userCount === 0` so that live database files are NEVER overwritten or re-seeded on server boot/re-deploy.
- **Admin Credentials**:
  - Default administrative account for new system initialization: Username: `admin` | Password: `shepkira123`.
