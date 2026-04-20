import { Router } from 'express';
import db from '../db.js';
import { executeAction } from '../services/actionExecutor.js';

const router = Router();
const uid = (req) => req.user.uid;

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM ai_actions WHERE user_id = ? ORDER BY date DESC LIMIT 200').all(uid(req));
  res.json(rows.map(r => ({ ...r, payload: safeParse(r.payload) })));
});

router.post('/:id/validate', async (req, res, next) => {
  try {
    const action = db.prepare('SELECT * FROM ai_actions WHERE id = ? AND user_id = ?').get(req.params.id, uid(req));
    if (!action) return res.status(404).json({ error: 'action introuvable' });
    const parsed = { ...action, payload: safeParse(action.payload) };
    const result = await executeAction(db, parsed, uid(req));
    db.prepare(`UPDATE ai_actions SET statut = 'execute' WHERE id = ? AND user_id = ?`).run(req.params.id, uid(req));
    res.json({ ok: true, result });
  } catch (e) { next(e); }
});

router.post('/:id/reject', (req, res) => {
  db.prepare(`UPDATE ai_actions SET statut = 'rejete' WHERE id = ? AND user_id = ?`).run(req.params.id, uid(req));
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { type, description, payload } = req.body || {};
  if (!type || !description) return res.status(400).json({ error: 'type + description requis' });
  const info = db.prepare(`
    INSERT INTO ai_actions (user_id, type, description, payload) VALUES (?, ?, ?, ?)
  `).run(uid(req), type, description, payload ? JSON.stringify(payload) : null);
  res.status(201).json(db.prepare('SELECT * FROM ai_actions WHERE id = ?').get(info.lastInsertRowid));
});

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

export default router;
