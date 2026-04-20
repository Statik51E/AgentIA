import { Router } from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import db from '../db.js';
import { detectFinanceAnomalies } from '../services/scoring.js';
import { analyzeStatement } from '../services/aiProvider.js';
import { monthlyStats, monthlyHistory } from '../services/stats.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const uid = (req) => req.user.uid;

// ----- TRANSACTIONS (avec filtres) -------------------------------------
router.get('/', (req, res) => {
  const u = uid(req);
  const { type, categorie, accountId, from, to, q, limit = 500 } = req.query;
  const where = ['user_id = ?'];
  const params = [u];
  if (type === 'revenu' || type === 'depense') { where.push('type = ?'); params.push(type); }
  if (categorie) { where.push('categorie = ?'); params.push(String(categorie).toLowerCase()); }
  if (accountId) { where.push('account_id = ?'); params.push(Number(accountId)); }
  if (from) { where.push('date >= ?'); params.push(from); }
  if (to)   { where.push('date <= ?'); params.push(to); }
  if (q)    { where.push('(LOWER(COALESCE(note,"")) LIKE ? OR LOWER(COALESCE(categorie,"")) LIKE ?)');
              params.push(`%${String(q).toLowerCase()}%`, `%${String(q).toLowerCase()}%`); }
  const sql = `SELECT * FROM finances WHERE ${where.join(' AND ')} ORDER BY date DESC LIMIT ?`;
  params.push(Math.min(Number(limit) || 500, 2000));
  res.json(db.prepare(sql).all(...params));
});

router.get('/summary', (req, res) => {
  const u = uid(req);
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='revenu'  THEN montant END),0) AS revenus,
      COALESCE(SUM(CASE WHEN type='depense' THEN montant END),0) AS depenses
    FROM finances WHERE user_id = ?
  `).get(u);
  const byCat = db.prepare(`
    SELECT categorie, type, SUM(montant) AS total
    FROM finances WHERE user_id = ?
    GROUP BY categorie, type
    ORDER BY total DESC
  `).all(u);
  const solde = (totals.revenus || 0) - (totals.depenses || 0);
  const anomalies = detectFinanceAnomalies(db, u);
  const charges_fixes = db.prepare(`
    SELECT COALESCE(SUM(montant), 0) AS total FROM fixed_expenses WHERE actif = 1 AND user_id = ?
  `).get(u).total;
  res.json({ ...totals, solde, byCat, anomalies, charges_fixes, solde_apres_charges: solde - charges_fixes });
});

router.post('/', (req, res) => {
  const { type, montant, categorie, note, date, account_id } = req.body || {};
  if (!['revenu', 'depense'].includes(type)) return res.status(400).json({ error: 'type invalide' });
  if (typeof montant !== 'number' || montant <= 0) return res.status(400).json({ error: 'montant invalide' });
  const info = db.prepare(`
    INSERT INTO finances (user_id, type, montant, categorie, note, date, account_id)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?)
  `).run(uid(req), type, montant, categorie ? String(categorie).toLowerCase() : null, note || null, date || null, account_id ? Number(account_id) : null);
  res.status(201).json(db.prepare('SELECT * FROM finances WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM finances WHERE id = ? AND user_id = ?').get(req.params.id, uid(req));
  if (!row) return res.status(404).json({ error: 'introuvable' });
  const { type, montant, categorie, note, date, account_id } = req.body || {};
  db.prepare(`
    UPDATE finances SET
      type       = COALESCE(?, type),
      montant    = COALESCE(?, montant),
      categorie  = COALESCE(?, categorie),
      note       = COALESCE(?, note),
      date       = COALESCE(?, date),
      account_id = COALESCE(?, account_id)
    WHERE id = ? AND user_id = ?
  `).run(
    type && ['revenu','depense'].includes(type) ? type : null,
    typeof montant === 'number' && montant > 0 ? montant : null,
    typeof categorie === 'string' ? categorie.toLowerCase() : null,
    typeof note === 'string' ? note : null,
    typeof date === 'string' ? date : null,
    account_id !== undefined ? (account_id ? Number(account_id) : null) : null,
    req.params.id, uid(req),
  );
  res.json(db.prepare('SELECT * FROM finances WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM finances WHERE id = ? AND user_id = ?').run(req.params.id, uid(req));
  res.json({ ok: true });
});

// ----- EXPORT CSV ------------------------------------------------------
router.get('/export.csv', (req, res) => {
  const rows = db.prepare(`
    SELECT f.date, f.type, f.montant, f.categorie, f.note, a.nom AS compte
    FROM finances f LEFT JOIN accounts a ON a.id = f.account_id
    WHERE f.user_id = ? ORDER BY f.date DESC
  `).all(uid(req));
  const head = 'date,type,montant,categorie,note,compte\n';
  const body = rows.map(r => [
    r.date, r.type, r.montant,
    csv(r.categorie), csv(r.note), csv(r.compte),
  ].join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send(head + body);
});

function csv(s) {
  if (s == null) return '';
  const v = String(s);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ----- CHARGES FIXES ---------------------------------------------------
router.get('/fixed', (req, res) => {
  res.json(db.prepare('SELECT * FROM fixed_expenses WHERE user_id = ? ORDER BY date DESC').all(uid(req)));
});

router.post('/fixed', (req, res) => {
  const { libelle, montant, categorie, jour_mois, actif } = req.body || {};
  if (!libelle || typeof libelle !== 'string') return res.status(400).json({ error: 'libelle requis' });
  if (typeof montant !== 'number' || montant <= 0) return res.status(400).json({ error: 'montant invalide' });
  const info = db.prepare(`
    INSERT INTO fixed_expenses (user_id, libelle, montant, categorie, jour_mois, actif)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uid(req), libelle.trim(), montant, categorie || null, Number.isInteger(jour_mois) ? jour_mois : null, actif === false ? 0 : 1);
  res.status(201).json(db.prepare('SELECT * FROM fixed_expenses WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/fixed/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM fixed_expenses WHERE id = ? AND user_id = ?').get(req.params.id, uid(req));
  if (!row) return res.status(404).json({ error: 'introuvable' });
  const { libelle, montant, categorie, jour_mois, actif } = req.body || {};
  const next = {
    libelle: typeof libelle === 'string' ? libelle.trim() : row.libelle,
    montant: typeof montant === 'number' ? montant : row.montant,
    categorie: categorie !== undefined ? categorie : row.categorie,
    jour_mois: jour_mois !== undefined ? jour_mois : row.jour_mois,
    actif: typeof actif === 'boolean' ? (actif ? 1 : 0) : row.actif,
  };
  db.prepare(`
    UPDATE fixed_expenses SET libelle=?, montant=?, categorie=?, jour_mois=?, actif=?
    WHERE id=? AND user_id=?
  `).run(next.libelle, next.montant, next.categorie, next.jour_mois, next.actif, req.params.id, uid(req));
  res.json(db.prepare('SELECT * FROM fixed_expenses WHERE id = ?').get(req.params.id));
});

router.delete('/fixed/:id', (req, res) => {
  db.prepare('DELETE FROM fixed_expenses WHERE id = ? AND user_id = ?').run(req.params.id, uid(req));
  res.json({ ok: true });
});

// ----- STATS + HISTORIQUE + BUDGETS ------------------------------------
router.get('/stats', (req, res) => {
  res.json(monthlyStats(db, uid(req), req.query.month || null));
});

router.get('/history', (req, res) => {
  const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 24);
  res.json(monthlyHistory(db, uid(req), months));
});

router.get('/budgets', (req, res) => {
  res.json(db.prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY categorie').all(uid(req)));
});

router.post('/budgets', (req, res) => {
  const { categorie, limite_mensuelle } = req.body || {};
  if (!categorie || typeof categorie !== 'string') return res.status(400).json({ error: 'categorie requise' });
  if (typeof limite_mensuelle !== 'number' || limite_mensuelle <= 0) return res.status(400).json({ error: 'limite invalide' });
  try {
    const info = db.prepare(
      `INSERT INTO budgets (user_id, categorie, limite_mensuelle) VALUES (?, ?, ?)`
    ).run(uid(req), categorie.trim().toLowerCase(), limite_mensuelle);
    res.status(201).json(db.prepare('SELECT * FROM budgets WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'budget déjà défini pour cette catégorie' });
    throw e;
  }
});

router.patch('/budgets/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(req.params.id, uid(req));
  if (!row) return res.status(404).json({ error: 'introuvable' });
  const { limite_mensuelle, actif, categorie } = req.body || {};
  db.prepare(`
    UPDATE budgets SET
      categorie = COALESCE(?, categorie),
      limite_mensuelle = COALESCE(?, limite_mensuelle),
      actif = COALESCE(?, actif)
    WHERE id = ? AND user_id = ?
  `).run(
    typeof categorie === 'string' ? categorie.trim().toLowerCase() : null,
    typeof limite_mensuelle === 'number' ? limite_mensuelle : null,
    typeof actif === 'boolean' ? (actif ? 1 : 0) : null,
    req.params.id, uid(req),
  );
  res.json(db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id));
});

router.delete('/budgets/:id', (req, res) => {
  db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(req.params.id, uid(req));
  res.json({ ok: true });
});

// ----- COMPTES ---------------------------------------------------------
router.get('/accounts', (req, res) => {
  const u = uid(req);
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY date').all(u);
  const balances = db.prepare(`
    SELECT account_id,
      COALESCE(SUM(CASE WHEN type='revenu'  THEN montant END),0) AS entrees,
      COALESCE(SUM(CASE WHEN type='depense' THEN montant END),0) AS sorties
    FROM finances WHERE user_id = ? AND account_id IS NOT NULL
    GROUP BY account_id
  `).all(u);
  const map = Object.fromEntries(balances.map(b => [b.account_id, b]));
  res.json(accounts.map(a => {
    const m = map[a.id] || { entrees: 0, sorties: 0 };
    const solde = (a.solde_initial || 0) + m.entrees - m.sorties;
    return { ...a, entrees: m.entrees, sorties: m.sorties, solde: +solde.toFixed(2) };
  }));
});

router.post('/accounts', (req, res) => {
  const { nom, type, solde_initial, couleur } = req.body || {};
  if (!nom || typeof nom !== 'string') return res.status(400).json({ error: 'nom requis' });
  const t = ['courant','epargne','espece','credit','autre'].includes(type) ? type : 'courant';
  const info = db.prepare(`
    INSERT INTO accounts (user_id, nom, type, solde_initial, couleur)
    VALUES (?, ?, ?, ?, ?)
  `).run(uid(req), nom.trim(), t, Number(solde_initial) || 0, couleur || null);
  res.status(201).json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/accounts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(req.params.id, uid(req));
  if (!row) return res.status(404).json({ error: 'introuvable' });
  const { nom, type, solde_initial, couleur } = req.body || {};
  db.prepare(`
    UPDATE accounts SET
      nom           = COALESCE(?, nom),
      type          = COALESCE(?, type),
      solde_initial = COALESCE(?, solde_initial),
      couleur       = COALESCE(?, couleur)
    WHERE id = ? AND user_id = ?
  `).run(
    typeof nom === 'string' ? nom.trim() : null,
    type && ['courant','epargne','espece','credit','autre'].includes(type) ? type : null,
    typeof solde_initial === 'number' ? solde_initial : null,
    couleur !== undefined ? couleur : null,
    req.params.id, uid(req),
  );
  res.json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id));
});

router.delete('/accounts/:id', (req, res) => {
  db.prepare('UPDATE finances SET account_id = NULL WHERE account_id = ? AND user_id = ?').run(req.params.id, uid(req));
  db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(req.params.id, uid(req));
  res.json({ ok: true });
});

// Transfert entre comptes = 1 dépense + 1 revenu
router.post('/accounts/transfer', (req, res) => {
  const { from_id, to_id, montant, note } = req.body || {};
  const from = Number(from_id), to = Number(to_id);
  const m = Number(montant);
  if (!from || !to || from === to) return res.status(400).json({ error: 'comptes invalides' });
  if (!m || m <= 0) return res.status(400).json({ error: 'montant invalide' });
  const u = uid(req);
  const exists = db.prepare('SELECT id FROM accounts WHERE id IN (?, ?) AND user_id = ?').all(from, to, u);
  if (exists.length !== 2) return res.status(404).json({ error: 'un des comptes est introuvable' });
  const label = note ? String(note).slice(0, 120) : 'transfert';
  const trx = db.transaction(() => {
    db.prepare(`INSERT INTO finances (user_id, type, montant, categorie, note, account_id)
                VALUES (?, 'depense', ?, 'transfert', ?, ?)`).run(u, m, label, from);
    db.prepare(`INSERT INTO finances (user_id, type, montant, categorie, note, account_id)
                VALUES (?, 'revenu',  ?, 'transfert', ?, ?)`).run(u, m, label, to);
  });
  trx();
  res.json({ ok: true, transferre: m });
});

// ----- OBJECTIFS D'ÉPARGNE ---------------------------------------------
router.get('/goals', (req, res) => {
  res.json(db.prepare('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY date DESC').all(uid(req)));
});

router.post('/goals', (req, res) => {
  const { nom, cible, actuel, deadline, account_id } = req.body || {};
  if (!nom || typeof nom !== 'string') return res.status(400).json({ error: 'nom requis' });
  if (typeof cible !== 'number' || cible <= 0) return res.status(400).json({ error: 'cible invalide' });
  const info = db.prepare(`
    INSERT INTO savings_goals (user_id, nom, cible, actuel, deadline, account_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uid(req), nom.trim(), cible, Number(actuel) || 0, deadline || null, account_id ? Number(account_id) : null);
  res.status(201).json(db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/goals/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(req.params.id, uid(req));
  if (!row) return res.status(404).json({ error: 'introuvable' });
  const { nom, cible, actuel, deadline, account_id } = req.body || {};
  db.prepare(`
    UPDATE savings_goals SET
      nom        = COALESCE(?, nom),
      cible      = COALESCE(?, cible),
      actuel     = COALESCE(?, actuel),
      deadline   = COALESCE(?, deadline),
      account_id = COALESCE(?, account_id)
    WHERE id = ? AND user_id = ?
  `).run(
    typeof nom === 'string' ? nom.trim() : null,
    typeof cible === 'number' ? cible : null,
    typeof actuel === 'number' ? actuel : null,
    typeof deadline === 'string' ? deadline : null,
    account_id !== undefined ? (account_id ? Number(account_id) : null) : null,
    req.params.id, uid(req),
  );
  res.json(db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(req.params.id));
});

router.post('/goals/:id/contribute', (req, res) => {
  const row = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(req.params.id, uid(req));
  if (!row) return res.status(404).json({ error: 'introuvable' });
  const m = Number(req.body?.montant);
  if (!m) return res.status(400).json({ error: 'montant requis' });
  const newActuel = Math.max(0, (row.actuel || 0) + m);
  db.prepare('UPDATE savings_goals SET actuel = ? WHERE id = ? AND user_id = ?').run(newActuel, req.params.id, uid(req));
  res.json(db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(req.params.id));
});

router.delete('/goals/:id', (req, res) => {
  db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').run(req.params.id, uid(req));
  res.json({ ok: true });
});

// ----- RELEVÉ DE COMPTE ------------------------------------------------
router.post('/statement/analyze', async (req, res, next) => {
  try {
    const { texte } = req.body || {};
    if (!texte || typeof texte !== 'string' || texte.length < 20) {
      return res.status(400).json({ error: 'texte du relevé requis (20 car min)' });
    }
    const result = await analyzeStatement(texte);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/statement/pdf', upload.single('file'), async (req, res, next) => {
  let parser;
  try {
    if (!req.file) return res.status(400).json({ error: 'fichier PDF requis (champ "file")' });
    if (req.file.mimetype && !req.file.mimetype.includes('pdf')) {
      return res.status(400).json({ error: 'le fichier doit être un PDF' });
    }
    parser = new PDFParse({ data: req.file.buffer });
    const parsed = await parser.getText();
    const texte = (parsed?.text || '').trim();
    if (texte.length < 20) return res.status(400).json({ error: 'PDF vide ou illisible (texte extrait trop court)' });
    const result = await analyzeStatement(texte);
    res.json({ ...result, texte_extrait_apercu: texte.slice(0, 400) });
  } catch (e) { next(e); }
  finally { try { await parser?.destroy(); } catch {} }
});

router.post('/statement/import', (req, res) => {
  const u = uid(req);
  const { transactions = [], depenses_fixes = [], account_id } = req.body || {};
  if (!Array.isArray(transactions) && !Array.isArray(depenses_fixes)) {
    return res.status(400).json({ error: 'transactions ou depenses_fixes requis' });
  }
  const accId = account_id ? Number(account_id) : null;
  const insertTx = db.prepare(`
    INSERT INTO finances (user_id, type, montant, categorie, note, date, account_id)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?)
  `);
  const insertFixed = db.prepare(`
    INSERT INTO fixed_expenses (user_id, libelle, montant, categorie, jour_mois)
    VALUES (?, ?, ?, ?, ?)
  `);
  let txCount = 0, fixedCount = 0;
  const trx = db.transaction(() => {
    for (const t of transactions) {
      if (!t?.montant || !['revenu', 'depense'].includes(t?.type)) continue;
      insertTx.run(u, t.type, Math.abs(Number(t.montant)), t.categorie ? String(t.categorie).toLowerCase() : null, t.libelle || null, t.date || null, accId);
      txCount++;
    }
    for (const f of depenses_fixes) {
      if (!f?.libelle || !f?.montant) continue;
      insertFixed.run(u, String(f.libelle).slice(0, 120), Math.abs(Number(f.montant)), f.categorie || null, Number.isInteger(f.jour_mois) ? f.jour_mois : null);
      fixedCount++;
    }
  });
  trx();
  res.json({ transactions_importees: txCount, charges_fixes_ajoutees: fixedCount });
});

export default router;
