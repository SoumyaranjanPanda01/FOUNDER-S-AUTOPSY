const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = path.join(__dirname, "leaderboard.db");

const db = new sqlite3.Database(DB_PATH);

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
  `);
});

app.use(express.json({ limit: "64kb" }));
app.use(express.static(__dirname));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/leaderboard", (_req, res) => {
  const sql = `
    SELECT name, cash, sales, burn, created_at AS createdAt
    FROM leaderboard
    ORDER BY cash DESC, sales DESC, burn ASC, id ASC
    LIMIT 50
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to load leaderboard." });
    res.json(rows || []);
  });
});

app.post("/api/leaderboard", (req, res) => {
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
    if (err) return res.status(500).json({ error: "Failed to save leaderboard entry." });
    res.status(201).json({ ok: true, id: this.lastID });
  });
});

app.delete("/api/leaderboard", (_req, res) => {
  db.run("DELETE FROM leaderboard", [], function onDelete(err) {
    if (err) return res.status(500).json({ error: "Failed to reset leaderboard." });
    res.json({ ok: true, deleted: this.changes || 0 });
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "18-months-gauntlet.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`SQLite DB: ${DB_PATH}`);
});
