# CineFinder

TMDB-powered movie discovery website with a protected admin panel. No Firebase.

## Requirements
- Node.js 20 or newer
- A TMDB account and API Read Access Token

## Setup on Windows
1. Install Node.js LTS from https://nodejs.org/
2. Open the `CineFinder` folder in VS Code.
3. Open Terminal in VS Code and run:
   ```bash
   npm install
   ```
4. Copy `.env.example` to a new file named `.env`.
5. Create a TMDB account at https://www.themoviedb.org/ and open Settings → API to request/view your API Read Access Token. Put it in `TMDB_ACCESS_TOKEN` in `.env`.
6. Generate a password hash. In the terminal, run:
   ```bash
   node -e "require('bcryptjs').hash('ChooseYourOwnStrongPassword', 12).then(console.log)"
   ```
   Replace the example password in that command with your own password, run it, then copy the resulting hash into `ADMIN_PASSWORD_HASH`. Do not share the password or hash.
7. Set `ADMIN_USERNAME` to your chosen username.
8. Set `SESSION_SECRET` to a long random secret string (at least 32 random characters). Keep `.env private.
9. Start the site:
   ```bash
   npm start
   ```
10. Open http://localhost:3000

## What it includes
- Trending movies and TMDB search/pagination
- Movie detail view: overview, release year, runtime, genres and rating
- Three optional link slots for each movie
- Admin login; only authenticated admin can save links
- SQLite file at `data/cinefinder.sqlite`; no Firebase

## Important deployment note
For a public deployment, use a Node.js host that supports persistent disk/storage for `data/cinefinder.sqlite`, or replace SQLite with a managed database. Ephemeral server filesystems can reset the database after redeploy/restart. Set the environment variables in the host dashboard instead of uploading `.env`. Use HTTPS in production and set `NODE_ENV=production`.

TMDB API documentation: https://developer.themoviedb.org/docs/authentication-application
TMDB requires attribution. This product uses the TMDB API but is not endorsed or certified by TMDB. Follow TMDB's current terms and branding requirements.

Only add official or legally available viewing links. CineFinder does not host movie files.
