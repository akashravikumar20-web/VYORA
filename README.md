# VYORA — Your World, Your Way

A full-stack location and spatial companion starter with a MapLibre 3D-style map, browser GPS, accounts, consent-based live sharing rooms, journey recording, PostgreSQL/PostGIS persistence, and Docker deployment support.

## Free hosting path
See [FREE_HOSTING_GUIDE.md](FREE_HOSTING_GUIDE.md). The included `render.yaml` prepares a free Render Node service; a separate PostgreSQL database (for example, a free Neon project with PostGIS enabled) is required. Free hosting may sleep and has limits.

## Local run
Requirements: Node.js 20+, Docker (or PostgreSQL with PostGIS).
1. Copy `.env.example` to `.env` and set a unique `JWT_SECRET` (at least 32 characters) and database credentials.
2. Start PostgreSQL/PostGIS.
3. Run `npm install` and `npm start`.
4. Open `http://localhost:3000` and allow location permission.

## Included
- MapLibre interactive map using OpenFreeMap Liberty style; 3D building extrusion is enabled when available in the style.
- GPS location and accuracy display.
- Journey recording to PostGIS.
- Account registration/login with bcrypt password hashing and JWT sessions.
- Temporary room codes for consent-based live location sharing over Socket.IO.
- Device compass where supported and an installable PWA shell.

## Not yet complete
This is not a deployed public service. No real-phone end-to-end test has been performed. Before public launch, add rate limiting, email verification, password reset, abuse reporting, audit logging, backups, monitoring, automated tests, and a privacy/retention policy. Review map tile/style provider terms, quotas, attribution and commercial-use licensing. Browser GPS depends on device, permissions, connectivity and environment.

Location sharing is consent-based: each participant must create an account and explicitly join a temporary room. This app does not secretly locate a person from their phone number.
