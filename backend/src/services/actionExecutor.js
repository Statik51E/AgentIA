/**
 * Exécuteur d'actions validées. Toutes les mutations sont scopées par user_id.
 */

import { structureProjectFromIdea } from './aiProvider.js';

export async function executeAction(db, action, userId) {
  const { type, payload } = action;

  switch (type) {
    case 'projet_stagnant': {
      if (!payload?.projectId) return { noop: true };
      db.prepare(`
        UPDATE projects SET statut = 'en_cours', priorite = MIN(5, priorite + 1)
        WHERE id = ? AND user_id = ?
      `).run(payload.projectId, userId);
      return { effect: 'projet relancé', projectId: payload.projectId };
    }

    case 'archiver_projet': {
      if (!payload?.projectId) return { noop: true };
      db.prepare(`UPDATE projects SET statut = 'termine' WHERE id = ? AND user_id = ?`).run(payload.projectId, userId);
      return { effect: 'projet archivé', projectId: payload.projectId };
    }

    case 'creer_projet': {
      const nom = String(payload?.nom || '').slice(0, 200).trim();
      if (!nom) return { noop: true };
      const description = String(payload?.description || '');
      const priorite = clamp(payload?.priorite ?? 2, 0, 5);
      const info = db.prepare(
        `INSERT INTO projects (user_id, nom, description, priorite) VALUES (?, ?, ?, ?)`
      ).run(userId, nom, description, priorite);
      return { effect: 'projet créé', projectId: info.lastInsertRowid };
    }

    case 'creer_tache': {
      const projectId = Number(payload?.projectId);
      const titre = String(payload?.titre || '').slice(0, 200).trim();
      if (!projectId || !titre) return { noop: true };
      const exists = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
      if (!exists) return { noop: true, reason: 'projet introuvable' };
      const priorite = clamp(payload?.priorite ?? 1, 0, 5);
      const info = db.prepare(
        `INSERT INTO tasks (user_id, project_id, titre, priorite) VALUES (?, ?, ?, ?)`
      ).run(userId, projectId, titre, priorite);
      return { effect: 'tâche créée', taskId: info.lastInsertRowid };
    }

    case 'idee_a_convertir': {
      if (!payload?.ideaId) return { noop: true };
      const idea = db.prepare('SELECT * FROM ideas WHERE id = ? AND user_id = ?').get(payload.ideaId, userId);
      if (!idea) return { noop: true };
      let blueprint = null;
      try { blueprint = await structureProjectFromIdea(idea.contenu); } catch {}
      const nom = blueprint?.nom || (idea.contenu || '').split('\n')[0].slice(0, 80) || "Projet issu d'une idée";
      const description = blueprint?.description || idea.structure || idea.contenu || '';
      const priorite = clamp(blueprint?.priorite ?? 3, 0, 5);
      const info = db.prepare(
        `INSERT INTO projects (user_id, nom, description, priorite) VALUES (?, ?, ?, ?)`
      ).run(userId, nom, description, priorite);
      const projectId = info.lastInsertRowid;
      const insertTask = db.prepare(`INSERT INTO tasks (user_id, project_id, titre) VALUES (?, ?, ?)`);
      for (const t of (blueprint?.taches || [])) {
        if (!t) continue;
        insertTask.run(userId, projectId, String(t).slice(0, 200));
      }
      db.prepare('DELETE FROM ideas WHERE id = ? AND user_id = ?').run(payload.ideaId, userId);
      return { effect: 'idée → projet', projectId, taches: (blueprint?.taches || []).length };
    }

    case 'categoriser_finance': {
      const financeId = Number(payload?.financeId);
      const categorie = String(payload?.categorie || '').slice(0, 80).trim();
      if (!financeId || !categorie) return { noop: true };
      const exists = db.prepare('SELECT id FROM finances WHERE id = ? AND user_id = ?').get(financeId, userId);
      if (!exists) return { noop: true, reason: 'finance introuvable' };
      db.prepare(`UPDATE finances SET categorie = ? WHERE id = ? AND user_id = ?`).run(categorie, financeId, userId);
      return { effect: 'catégorie mise à jour', financeId, categorie };
    }

    case 'marquer_depense_fixe': {
      const libelle = String(payload?.libelle || '').slice(0, 120).trim();
      const montant = Number(payload?.montant);
      if (!libelle || !montant || montant <= 0) return { noop: true };
      const jour_mois = Number.isInteger(payload?.jour_mois) ? Math.min(31, Math.max(1, payload.jour_mois)) : null;
      const info = db.prepare(`
        INSERT INTO fixed_expenses (user_id, libelle, montant, categorie, jour_mois)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, libelle, Math.abs(montant), payload?.categorie || null, jour_mois);
      return { effect: 'charge fixe créée', fixedId: info.lastInsertRowid };
    }

    case 'finance_anomalie':
    case 'optim_finance':
    case 'optim_productivite':
      return { effect: 'acknowledged', type };

    default:
      return { effect: 'logged', type };
  }
}

function clamp(v, lo, hi) {
  const n = Number(v);
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
