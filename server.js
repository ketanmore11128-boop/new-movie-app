require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const token = process.env.TMDB_ACCESS_TOKEN;
const adminUser = process.env.ADMIN_USERNAME || "admin";
const passwordHash = process.env.ADMIN_PASSWORD_HASH;
const sessionSecret = process.env.SESSION_SECRET;

if (!token || !passwordHash || !sessionSecret ||
    token.includes("paste_your") || passwordHash.includes("paste_") ||
    sessionSecret.includes("replace_with")) {
  console.error("Missing setup: fill TMDB_ACCESS_TOKEN, ADMIN_PASSWORD_HASH and SESSION_SECRET in .env");
  process.exit(1);
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "cinefinder.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS movie_links (
    movie_id INTEGER PRIMARY KEY,
    link1 TEXT NOT NULL DEFAULT '',
    link2 TEXT NOT NULL DEFAULT '',
    link3 TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(session({
  name: "cinefinder.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false });
app.use("/api", apiLimiter);

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Admin login required." });
}
function validHttpUrl(value) {
  if (value === "") return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch { return false; }
}
async function tmdb(pathname) {
  const r = await fetch("https://api.themoviedb.org/3" + pathname, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" }
  });
  if (!r.ok) {
    const err = new Error(`TMDB returned ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/movies/trending", async (req, res) => {
  try {
    const page = Math.max(1, Math.min(500, Number(req.query.page) || 1));
    res.json(await tmdb(`/trending/movie/week?language=en-US&page=${page}`));
  } catch (e) { res.status(502).json({ error: "Could not load movies from TMDB. Check the token and connection." }); }
});
app.get("/api/movies/search", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  if (!q) return res.json({ results: [] });
  try {
    const page = Math.max(1, Math.min(500, Number(req.query.page) || 1));
    res.json(await tmdb(`/search/movie?query=${encodeURIComponent(q)}&include_adult=false&language=en-US&page=${page}`));
  } catch { res.status(502).json({ error: "Movie search failed. Check TMDB setup or try again." }); }
});
app.get("/api/movies/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid movie ID." });
  try {
    const movie = await tmdb(`/movie/${id}?language=en-US`);
    const links = db.prepare("SELECT link1, link2, link3 FROM movie_links WHERE movie_id = ?").get(id) || { link1: "", link2: "", link3: "" };
    res.json({ ...movie, links });
  } catch { res.status(404).json({ error: "Movie not found or TMDB is unavailable." }); }
});

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const username = String(req.body.username || "");
  const password = String(req.body.password || "");
  const ok = username === adminUser && await bcrypt.compare(password, passwordHash);
  if (!ok) return res.status(401).json({ error: "Incorrect username or password." });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start session." });
    req.session.isAdmin = true;
    req.session.save(err2 => {
      if (err2) return res.status(500).json({ error: "Could not save session." });
      res.json({ ok: true });
    });
  });
});
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("cinefinder.sid");
    res.json({ ok: true });
  });
});
app.get("/api/admin/me", (req, res) => res.json({ isAdmin: !!req.session?.isAdmin }));

app.put("/api/admin/movies/:id/links", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid movie ID." });
  const links = ["link1", "link2", "link3"].map(k => String(req.body[k] || "").trim());
  if (links.some(x => x.length > 1500 || !validHttpUrl(x))) {
    return res.status(400).json({ error: "Each link must be a valid HTTP/HTTPS URL (or left blank), under 1500 characters." });
  }
  db.prepare(`
    INSERT INTO movie_links(movie_id, link1, link2, link3, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(movie_id) DO UPDATE SET
      link1=excluded.link1, link2=excluded.link2, link3=excluded.link3,
      updated_at=CURRENT_TIMESTAMP
  `).run(id, ...links);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`CineFinder running at http://localhost:${PORT}`));
