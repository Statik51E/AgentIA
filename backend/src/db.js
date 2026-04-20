import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'core.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS finances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK(type IN ('revenu','depense')),
  montant REAL NOT NULL,
  categorie TEXT,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '',
  nom TEXT NOT NULL,
  description TEXT,
  statut TEXT NOT NULL DEFAULT 'todo' CHECK(statut IN ('todo','en_cours','termine')),
  priorite INTEGER NOT NULL DEFAULT 0,
  date TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '',
  project_id INTEGER NOT NULL,
  titre TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'todo' CHECK(statut IN ('todo','en_cours','termine')),
  priorite INTEGER NOT NULL DEFAULT 0,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '',
  contenu TEXT NOT NULL,
  structure TEXT,
  tags TEXT,
  date TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  contenu TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  payload TEXT,
  statut TEXT NOT NULL DEFAULT 'suggere' CHECK(statut IN ('suggere','valide','rejete','execute')),
  date TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fixed_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '',
  libelle TEXT NOT NULL,
  montant REAL NOT NULL,
  categorie TEXT,
  jour_mois INTEGER,
  actif INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '',
  categorie TEXT NOT NULL,
  limite_mensuelle REAL NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, categorie)
);
`);

// Migration : ajoute user_id aux tables existantes si absent
const TABLES = ['finances', 'projects', 'tasks', 'ideas', 'ai_logs', 'ai_actions', 'fixed_expenses', 'budgets'];
for (const t of TABLES) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all();
  if (!cols.some(c => c.name === 'user_id')) {
    try {
      db.exec(`ALTER TABLE ${t} ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
      console.log(`[DB] migration : user_id ajouté à ${t}`);
    } catch (e) { console.warn(`[DB] migration ${t} ignorée :`, e.message); }
  }
}

// Migration : rebuilder `budgets` si la contrainte UNIQUE n'est pas (user_id, categorie)
try {
  const idxList = db.prepare(`PRAGMA index_list(budgets)`).all();
  const needsRebuild = !idxList.some(i => {
    if (!i.unique) return false;
    const cols = db.prepare(`PRAGMA index_info(${i.name})`).all().map(c => c.name).sort();
    return cols.length === 2 && cols[0] === 'categorie' && cols[1] === 'user_id';
  });
  if (needsRebuild) {
    db.exec(`
      CREATE TABLE budgets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT '',
        categorie TEXT NOT NULL,
        limite_mensuelle REAL NOT NULL,
        actif INTEGER NOT NULL DEFAULT 1,
        date TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, categorie)
      );
      INSERT INTO budgets_new (id, user_id, categorie, limite_mensuelle, actif, date)
        SELECT id, COALESCE(user_id,''), categorie, limite_mensuelle, actif, date FROM budgets;
      DROP TABLE budgets;
      ALTER TABLE budgets_new RENAME TO budgets;
    `);
    console.log('[DB] budgets reconstruite avec UNIQUE(user_id, categorie)');
  }
} catch (e) { console.warn('[DB] rebuild budgets ignoré :', e.message); }

// Index utiles pour scoper par user_id
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_finances_user ON finances(user_id);
  CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_user    ON tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_ideas_user    ON ideas(user_id);
  CREATE INDEX IF NOT EXISTS idx_ai_logs_user  ON ai_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_ai_actions_user ON ai_actions(user_id);
  CREATE INDEX IF NOT EXISTS idx_fixed_user    ON fixed_expenses(user_id);
  CREATE INDEX IF NOT EXISTS idx_budgets_user  ON budgets(user_id);
`);

export default db;
