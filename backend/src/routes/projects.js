import { Router } from 'express';
import db from '../db.js';
import { computePriority } from '../services/scoring.js';

const router = Router();
const uid = (req) => req.user.uid;

router.get('/', (req, res) => {
  const u = uid(req);
  const projects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY priorite DESC, date DESC').all(u);
  const tasksStmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND user_id = ? ORDER BY priorite DESC, date DESC');
  res.json(projects.map(p => ({ ...p, tasks: tasksStmt.all(p.id, u) })));
});

router.post('/', (req, res) => {
  const { nom, description } = req.body || {};
  if (!nom || typeof nom !== 'string') return res.status(400).json({ error: 'nom requis' });
  const priorite = computePriority({ nom, description });
  const info = db.prepare(`
    INSERT INTO projects (user_id, nom, description, priorite) VALUES (?, ?, ?, ?)
  `).run(uid(req), nom.trim(), description || null, priorite);
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const { nom, description, statut } = req.body || {};
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, uid(req));
  if (!existing) return res.status(404).json({ error: 'projet introuvable' });
  db.prepare(`
    UPDATE projects SET
      nom = COALESCE(?, nom),
      description = COALESCE(?, description),
      statut = COALESCE(?, statut)
    WHERE id = ? AND user_id = ?
  `).run(nom ?? null, description ?? null, statut ?? null, req.params.id, uid(req));
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, uid(req));
  res.json({ ok: true });
});

router.post('/:id/tasks', (req, res) => {
  const { titre } = req.body || {};
  if (!titre) return res.status(400).json({ error: 'titre requis' });
  const owns = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, uid(req));
  if (!owns) return res.status(404).json({ error: 'projet introuvable' });
  const priorite = computePriority({ nom: titre });
  const info = db.prepare(`
    INSERT INTO tasks (user_id, project_id, titre, priorite) VALUES (?, ?, ?, ?)
  `).run(uid(req), req.params.id, titre.trim(), priorite);
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:pid/tasks/:tid', (req, res) => {
  const { titre, statut } = req.body || {};
  db.prepare(`
    UPDATE tasks SET
      titre = COALESCE(?, titre),
      statut = COALESCE(?, statut)
    WHERE id = ? AND project_id = ? AND user_id = ?
  `).run(titre ?? null, statut ?? null, req.params.tid, req.params.pid, uid(req));
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.tid));
});

router.delete('/:pid/tasks/:tid', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ? AND project_id = ? AND user_id = ?')
    .run(req.params.tid, req.params.pid, uid(req));
  res.json({ ok: true });
});

export default router;
