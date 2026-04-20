import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import db from './db.js';
import { requireAuth } from './middleware/auth.js';
import financesRouter from './routes/finances.js';
import projectsRouter from './routes/projects.js';
import ideasRouter from './routes/ideas.js';
import aiRouter from './routes/ai.js';
import suggestionsRouter from './routes/suggestions.js';
import actionsRouter from './routes/actions.js';
import { startSuggestionsLoop } from './services/suggestionsEngine.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Toutes les routes métier exigent un ID token Firebase valide
app.use('/finances', requireAuth, financesRouter);
app.use('/projects', requireAuth, projectsRouter);
app.use('/ideas', requireAuth, ideasRouter);
app.use('/ai', requireAuth, aiRouter);
app.use('/suggestions', requireAuth, suggestionsRouter);
app.use('/actions', requireAuth, actionsRouter);

app.use((err, _req, res, _next) => {
  console.error('[CORE]', err);
  res.status(500).json({ error: err.message || 'Erreur serveur' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`[CORE IA ULTIMATE] backend prêt sur http://localhost:${port}`);
  console.log(`[DB] ${db.name}`);
  startSuggestionsLoop();
});
