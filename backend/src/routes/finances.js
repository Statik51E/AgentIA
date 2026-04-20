import { Router } from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import db from '../db.js';
import { detectFinanceAnomalies } from '../services/scoring.js';
import { analyzeStatement } from '../services/aiProvider.js';
import { monthlyStats } from '../services/stats.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const uid = (req) => req.user.uid;

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM finances WHERE user_id = ? ORDER BY date DESC').all(uid(req));
  res.json(rows);
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
  const solde_apres_charges = solde - charges_fixes;
  res.json({ ...totals, solde, byCat, anomalies, charges_fixes, solde_apres_charges });
});

router.post('/', (req, res) => {
  const { type, montant, categorie, note, date } = req.body || {};
  if (!['revenu', 'depense'].includes(type)) return res.status(400).json({ error: 'type invalide' });
  if (typeof montant !== 'number' || montant <= 0) return res.status(400).json({ error: 'montant invalide' });
  const info = db.prepare(`
    INSERT INTO finances (user_id, type, montant, categorie, note, date)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
  `).run(uid(req), type, montant, categorie || null, note || null, date || null);
  res.status(201).json(db.prepare('SELECT * FROM finances WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM finances WHERE id = ? AND user_id = ?').run(req.params.id, uid(req));
  res.json({ ok: true });
});

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

// ----- STATISTIQUES + BUDGETS ------------------------------------------
router.get('/stats', (req, res) => {
  res.json(monthlyStats(db, uid(req)));
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
  const { transactions = [], depenses_fixes = [] } = req.body || {};
  if (!Array.isArray(transactions) && !Array.isArray(depenses_fixes)) {
    return res.status(400).json({ error: 'transactions ou depenses_fixes requis' });
  }
  const insertTx = db.prepare(`
    INSERT INTO finances (user_id, type, montant, categorie, note, date)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
  `);
  const insertFixed = db.prepare(`
    INSERT INTO fixed_expenses (user_id, libelle, montant, categorie, jour_mois)
    VALUES (?, ?, ?, ?, ?)
  `);
  let txCount = 0, fixedCount = 0;
  const trx = db.transaction(() => {
    for (const t of transactions) {
      if (!t?.montant || !['revenu', 'depense'].includes(t?.type)) continue;
      insertTx.run(u, t.type, Math.abs(Number(t.montant)), t.categorie || null, t.libelle || null, t.date || null);
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
