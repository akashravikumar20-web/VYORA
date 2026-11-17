# VYORA — Free hosting setup

This project is prepared for a free Render web service and a free Neon PostgreSQL database. Free services may sleep when idle and may have usage/storage limits. This is suitable for initial testing, not a guarantee of always-on production service.

## What is already configured
- Render Blueprint file (`render.yaml`) for the Node web service.
- Render health check at `/api/health`.
- A generated production JWT secret in Render.
- Database URL is kept as a private environment variable (never commit it).
- VYORA name and tagline in the browser app and install manifest.

## One-time external setup still required
1. Create a free Neon project and database. Enable the PostGIS extension if it is not already enabled for the project. Copy the pooled or direct PostgreSQL connection string, keeping SSL enabled (`?sslmode=require`).
2. Push this project to a private or public GitHub repository.
3. In Render, create a new Blueprint and connect that repository. Render reads `render.yaml` and creates the free web service.
4. In the Render service environment, set `DATABASE_URL` to the Neon connection string. Keep it secret.
5. Wait for deployment, then open `https://YOUR-RENDER-SERVICE.onrender.com/api/health`. A healthy result should show `ok: true` and `service: VYORA`.
6. Open the service URL on two real phones, allow location permission, create accounts, and test room sharing. Use HTTPS only.

## Important
- Render free web services can spin down after inactivity, so the first request can take a while.
- Neon/Render free-tier limits and availability can change. Check current provider terms before relying on this for public launch.
- Never share database URLs, passwords, or JWT secrets in chat or source control.
- Real phone GPS and live-sharing tests have not been performed by this package build.
