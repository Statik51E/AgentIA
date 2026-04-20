import { Router } from 'express';
import db from '../db.js';
import { analyzeEntry, detectEntryType, generateFinanceAdvice } from '../services/aiProvider.js';
import { dailyScores } from '../services/scoring.js';
import { monthlyStats } from '../services/stats.js';

const router = Router();
const uid = (req) => req.user.uid;

router.post('/analyze', async (req, res) => {
  const { entree } = req.body || {};
  if (!entree || typeof entree !== 'string') return res.status(400).json({ error: 'entree requise' });
  const type = detectEntryType(entree);
  const result = await analyzeEntry(entree, type);
  db.prepare('INSERT INTO ai_logs (user_id, type, contenu) VALUES (?, ?, ?)').run(uid(req), type, JSON.stringify({ entree, result }));
  res.json({ type, ...result });
});

router.get('/logs', (req, res) => {
  const rows = db.prepare('SELECT * FROM ai_logs WHERE user_id = ? ORDER BY date DESC LIMIT 100').all(uid(req));
  res.json(rows.map(r => ({ ...r, contenu: safeParse(r.contenu) })));
});

router.get('/daily', (req, res) => {
  res.json(dailyScores(db, uid(req)));
});

router.get('/advice', async (req, res, next) => {
  try {
    const stats = monthlyStats(db, uid(req));
    const advice = await generateFinanceAdvice(stats);
    res.json({ stats, ...advice });
  } catch (e) { next(e); }
});

function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }

export default router;
