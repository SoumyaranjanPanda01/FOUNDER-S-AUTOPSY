const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = path.join(__dirname, "leaderboard.db");

let db = null;
let dbReady = false;

function initializeDb() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error("Database connection error:", err);
        return reject(err);
      }
      
      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS leaderboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            cash INTEGER NOT NULL,
            sales INTEGER NOT NULL,
            burn INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            console.error("Table creation error:", err);
            return reject(err);
          }
          dbReady = true;
          resolve();
        });
      });
    });
    
    db.on("error", (err) => {
      console.error("Database error:", err);
      dbReady = false;
    });
  });
}

initializeDb().catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});

app.use(express.json({ limit: "64kb" }));
app.use(express.static(__dirname));

app.use((req, res, next) => {
  res.header("Cache-Control", "no-cache, no-store, must-revalidate");
  res.header("Pragma", "no-cache");
  res.header("Expires", "0");
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, db: dbReady });
});

app.get("/api/leaderboard", (_req, res) => {
  if (!dbReady || !db) {
    return res.status(503).json({ error: "Database not ready." });
  }
  
  const sql = `
    SELECT name, cash, sales, burn, created_at AS createdAt
    FROM leaderboard
    ORDER BY cash DESC, sales DESC, burn ASC, id ASC
    LIMIT 50
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Leaderboard query error:", err);
      return res.status(500).json({ error: "Failed to load leaderboard." });
    }
    res.json(rows || []);
  });
});

app.post("/api/leaderboard", (req, res) => {
  if (!dbReady || !db) {
    return res.status(503).json({ error: "Database not ready." });
  }
  
  const nameRaw = typeof req.body?.name === "string" ? req.body.name : "";
  const name = nameRaw.replace(/\s+/g, " ").trim().slice(0, 32);
  const cash = Number(req.body?.cash);
  const sales = Number(req.body?.sales);
  const burn = Number(req.body?.burn);

  if (!name) return res.status(400).json({ error: "Name is required." });
  if (![cash, sales, burn].every(Number.isFinite)) {
    return res.status(400).json({ error: "cash, sales, burn must be numbers." });
  }

  const sql = "INSERT INTO leaderboard (name, cash, sales, burn) VALUES (?, ?, ?, ?)";
  db.run(sql, [name, Math.round(cash), Math.round(sales), Math.round(burn)], function onInsert(err) {
    if (err) {
      console.error("Leaderboard insert error:", err);
      return res.status(500).json({ error: "Failed to save leaderboard entry." });
    }
    res.status(201).json({ ok: true, id: this.lastID });
  });
});

app.delete("/api/leaderboard", (_req, res) => {
  if (!dbReady || !db) {
    return res.status(503).json({ error: "Database not ready." });
  }
  
  db.run("DELETE FROM leaderboard", [], function onDelete(err) {
    if (err) {
      console.error("Leaderboard delete error:", err);
      return res.status(500).json({ error: "Failed to reset leaderboard." });
    }
    res.json({ ok: true, deleted: this.changes || 0 });
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "18-months-gauntlet.html"));
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`SQLite DB: ${DB_PATH}`);
});

server.on("error", (err) => {
  console.error("Server error:", err);
  process.exit(1);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing gracefully...");
  server.close(() => {
    if (db) db.close();
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, closing gracefully...");
  server.close(() => {
    if (db) db.close();
    process.exit(0);
  });
});
