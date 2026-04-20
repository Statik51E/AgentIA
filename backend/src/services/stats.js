/**
 * Statistiques financières scopées par user_id.
 * monthlyStats(db, uid, monthYYYYMM?) — stats d'un mois donné (défaut : courant)
 * monthlyHistory(db, uid, N)         — N derniers mois : revenus/dépenses
 */

export function monthlyStats(db, userId, monthStr = null) {
  const { monthStart, monthEnd, daysInMonth, dayOfMonth, isCurrent } = monthRange(monthStr);
  const daysRemaining = Math.max(0, daysInMonth - dayOfMonth);

  const perCatRows = db.prepare(`
    SELECT COALESCE(categorie, '(non catégorisé)') AS categorie, SUM(montant) AS total, COUNT(*) AS count
    FROM finances
    WHERE type='depense' AND user_id = ? AND date >= ? AND date < ?
      AND COALESCE(categorie, '') != 'transfert'
    GROUP BY COALESCE(categorie, '(non catégorisé)')
    ORDER BY total DESC
  `).all(userId, monthStart, monthEnd);

  const depenseMois = perCatRows.reduce((s, r) => s + (r.total || 0), 0);
  const revenuMois = db.prepare(
    `SELECT COALESCE(SUM(montant),0) AS t FROM finances
     WHERE type='revenu' AND user_id = ? AND date >= ? AND date < ?
       AND COALESCE(categorie, '') != 'transfert'`
  ).get(userId, monthStart, monthEnd).t;

  const budgets = db.prepare(`SELECT * FROM budgets WHERE actif = 1 AND user_id = ?`).all(userId);
  const byCategory = {};
  for (const b of budgets) {
    byCategory[b.categorie] = {
      categorie: b.categorie, limite: b.limite_mensuelle, budgetId: b.id,
      depense: 0, count: 0, pourcentage: 0, reste: b.limite_mensuelle,
    };
  }
  for (const c of perCatRows) {
    const key = c.categorie;
    if (!byCategory[key]) {
      byCategory[key] = { categorie: key, limite: null, depense: 0, count: 0, pourcentage: null, reste: null };
    }
    byCategory[key].depense = c.total;
    byCategory[key].count = c.count;
    if (byCategory[key].limite) {
      byCategory[key].pourcentage = Math.round((c.total / byCategory[key].limite) * 100);
      byCategory[key].reste = byCategory[key].limite - c.total;
    }
  }

  const chargesFixes = db.prepare(
    `SELECT COALESCE(SUM(montant),0) AS t FROM fixed_expenses WHERE actif = 1 AND user_id = ?`
  ).get(userId).t;

  const fixedByCatRows = db.prepare(`
    SELECT COALESCE(categorie, '(non catégorisé)') AS categorie, SUM(montant) AS total, COUNT(*) AS count
    FROM fixed_expenses
    WHERE actif = 1 AND user_id = ?
    GROUP BY COALESCE(categorie, '(non catégorisé)')
    ORDER BY total DESC
  `).all(userId);

  const totauxMap = {};
  for (const c of perCatRows) {
    totauxMap[c.categorie] = {
      categorie: c.categorie,
      variable: +(c.total || 0).toFixed(2),
      nbVariable: c.count || 0,
      fixe: 0, nbFixe: 0,
      total: +(c.total || 0).toFixed(2),
    };
  }
  for (const f of fixedByCatRows) {
    const key = f.categorie;
    if (!totauxMap[key]) totauxMap[key] = { categorie: key, variable: 0, nbVariable: 0, fixe: 0, nbFixe: 0, total: 0 };
    totauxMap[key].fixe = +(f.total || 0).toFixed(2);
    totauxMap[key].nbFixe = f.count || 0;
    totauxMap[key].total = +(totauxMap[key].variable + totauxMap[key].fixe).toFixed(2);
  }
  const totauxParCategorie = Object.values(totauxMap).sort((a, b) => b.total - a.total);

  const projectionMois = isCurrent && dayOfMonth > 0
    ? Math.round((depenseMois / dayOfMonth) * daysInMonth)
    : +depenseMois.toFixed(2);
  const budgetDisponible = revenuMois - depenseMois - chargesFixes;

  const depassements = [];
  const alertes = [];
  for (const v of Object.values(byCategory)) {
    if (v.limite && v.depense > v.limite) {
      depassements.push({ categorie: v.categorie, depasse: +(v.depense - v.limite).toFixed(2), limite: v.limite, depense: v.depense });
    } else if (v.limite && v.pourcentage >= 80) {
      alertes.push({ categorie: v.categorie, pourcentage: v.pourcentage, reste: +v.reste.toFixed(2) });
    }
  }

  return {
    mois: monthStart.slice(0, 7),
    jour: dayOfMonth,
    joursDansMois: daysInMonth,
    joursRestants: daysRemaining,
    isCurrent,
    revenuMois,
    depenseMois: +depenseMois.toFixed(2),
    chargesFixes,
    budgetDisponible: +budgetDisponible.toFixed(2),
    projectionMois,
    perCategorie: Object.values(byCategory).sort((a, b) => (b.depense || 0) - (a.depense || 0)),
    totauxParCategorie,
    chargesFixesParCategorie: fixedByCatRows.map(r => ({ categorie: r.categorie, total: +(r.total || 0).toFixed(2), count: r.count || 0 })),
    depassements,
    alertes,
  };
}

export function monthlyHistory(db, userId, months = 12) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = toMonthStart(d);
    const endD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const end = toMonthStart(endD);
    const t = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='revenu'  THEN montant END),0) AS revenus,
        COALESCE(SUM(CASE WHEN type='depense' THEN montant END),0) AS depenses,
        COUNT(*) AS nb
      FROM finances
      WHERE user_id = ? AND date >= ? AND date < ?
        AND COALESCE(categorie, '') != 'transfert'
    `).get(userId, start, end);
    out.push({
      mois: start.slice(0, 7),
      label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      revenus: +t.revenus.toFixed(2),
      depenses: +t.depenses.toFixed(2),
      solde: +(t.revenus - t.depenses).toFixed(2),
      nb: t.nb,
    });
  }
  return out;
}

function monthRange(monthStr) {
  const now = new Date();
  let d;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split('-').map(Number);
    d = new Date(y, m - 1, 1);
  } else {
    d = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const monthStart = toMonthStart(d);
  const endD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const monthEnd = toMonthStart(endD);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const isCurrent = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const dayOfMonth = isCurrent ? now.getDate() : daysInMonth;
  return { monthStart, monthEnd, daysInMonth, dayOfMonth, isCurrent };
}

function toMonthStart(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;
}
