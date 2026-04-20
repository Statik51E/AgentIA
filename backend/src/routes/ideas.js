import { Router } from 'express';
import db from '../db.js';
import { structureIdea } from '../services/aiProvider.js';

const router = Router();
const uid = (req) => req.user.uid;

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM ideas WHERE user_id = ? ORDER BY date DESC').all(uid(req)));
});

router.post('/', async (req, res) => {
  const { contenu } = req.body || {};
  if (!contenu || typeof contenu !== 'string') return res.status(400).json({ error: 'contenu requis' });
  const { structure, tags } = await structureIdea(contenu);
  const info = db.prepare(`
    INSERT INTO ideas (user_id, contenu, structure, tags) VALUES (?, ?, ?, ?)
  `).run(uid(req), contenu.trim(), structure, JSON.stringify(tags || []));
  res.status(201).json(db.prepare('SELECT * FROM ideas WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM ideas WHERE id = ? AND user_id = ?').run(req.params.id, uid(req));
  res.json({ ok: true });
});

router.post('/:id/convert', (req, res) => {
  const idea = db.prepare('SELECT * FROM ideas WHERE id = ? AND user_id = ?').get(req.params.id, uid(req));
  if (!idea) return res.status(404).json({ error: 'idée introuvable' });
  const nom = (idea.contenu || '').split('\n')[0].slice(0, 80);
  const info = db.prepare(`
    INSERT INTO projects (user_id, nom, description, priorite) VALUES (?, ?, ?, ?)
  `).run(uid(req), nom || 'Projet issu d\'une idée', idea.structure || idea.contenu, 3);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
  db.prepare('DELETE FROM ideas WHERE id = ? AND user_id = ?').run(req.params.id, uid(req));
  res.json({ project });
});

export default router;
