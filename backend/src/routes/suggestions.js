import { Router } from 'express';
import db from '../db.js';
import { generateSuggestions } from '../services/suggestionsEngine.js';

const router = Router();
const uid = (req) => req.user.uid;

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM ai_actions
    WHERE statut = 'suggere' AND user_id = ?
    ORDER BY date DESC
  `).all(uid(req));
  res.json(rows.map(r => ({ ...r, payload: safeParse(r.payload) })));
});

router.post('/run', async (req, res) => {
  const created = await generateSuggestions(db, uid(req));
  res.json({ created });
});

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

export default router;
