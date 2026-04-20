import { useState } from 'react';
import { api } from '../../lib/api.js';

export default function Statement({ accounts, onChanged }) {
  const [statement, setStatement] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const analyze = async () => {
    if (statement.trim().length < 20) return;
    setLoading(true); setErr(''); setAnalysis(null);
    try { setAnalysis(await api.finances.analyzeStatement(statement)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  const analyzePDF = async (file) => {
    if (!file) return;
    setLoading(true); setErr(''); setAnalysis(null); setStatement('');
    try { setAnalysis(await api.finances.analyzeStatementPDF(file)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  const importAll = async () => {
    if (!analysis) return;
    await api.finances.importStatement({
      transactions: analysis.transactions || [],
      depenses_fixes: analysis.depenses_fixes || [],
      account_id: accountId || null,
    });
    setAnalysis(null); setStatement('');
    onChanged?.();
  };
  const importFixedOnly = async () => {
    if (!analysis?.depenses_fixes?.length) return;
    await api.finances.importStatement({
      transactions: [],
      depenses_fixes: analysis.depenses_fixes,
    });
    setAnalysis(null); setStatement('');
    onChanged?.();
  };

  return (
    <div className="card">
      <h3>Analyser un relevé de compte</h3>
      <p style={{ margin: '4px 0 10px', color: 'var(--txt-soft)', fontSize: 13 }}>
        Uploade le PDF <b>OU</b> colle le texte. L'IA détecte les transactions et les charges fixes récurrentes.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <label className="btn ghost" style={{ cursor: 'pointer' }}>
          {loading ? 'Analyse…' : '📄 Importer un PDF'}
          <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} disabled={loading}
                 onChange={e => analyzePDF(e.target.files?.[0])} />
        </label>
        <select className="select" value={accountId} onChange={e => setAccountId(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">— Compte destination —</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
        </select>
        <span style={{ color: 'var(--txt-soft)', fontSize: 12 }}>ou colle le texte ci-dessous</span>
      </div>

      <textarea className="textarea" placeholder="Copie/colle ton relevé bancaire ici…"
                value={statement} onChange={e => setStatement(e.target.value)} style={{ minHeight: 100 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={analyze} disabled={loading || statement.trim().length < 20}>
          {loading ? 'Analyse IA…' : 'Analyser le texte'}
        </button>
        {analysis?.depenses_fixes?.length > 0 && (
          <button className="btn" onClick={importFixedOnly} style={{ background: 'var(--ok)' }}>
            Importer les {analysis.depenses_fixes.length} charges fixes
          </button>
        )}
        {analysis && (
          <button className="btn ghost" onClick={importAll}>
            Tout importer ({analysis.transactions?.length || 0} tx + {analysis.depenses_fixes?.length || 0} fixes)
          </button>
        )}
      </div>
      {err && <div className="empty" style={{ color: 'var(--err)' }}>Erreur : {err}</div>}

      {analysis && (
        <div className="fade-in" style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          {analysis.resume && <div style={{ color: 'var(--txt-dim)', lineHeight: 1.55 }}>{analysis.resume}</div>}
          {analysis.transactions?.length > 0 && (
            <div>
              <h4 style={miniTitle}>Transactions détectées ({analysis.transactions.length})</h4>
              <div className="list">
                {analysis.transactions.slice(0, 20).map((t, i) => (
                  <div key={i} className="row">
                    <div>
                      <div className="title">
                        <span className={`badge ${t.type === 'revenu' ? 'ok' : 'err'}`}>{t.type}</span>{' '}
                        {fmt(t.montant)} € {t.categorie && <span style={{ color: 'var(--txt-soft)' }}>· {t.categorie}</span>}
                      </div>
                      <div className="meta">{t.date} — {t.libelle}</div>
                    </div>
                  </div>
                ))}
                {analysis.transactions.length > 20 && <div className="empty">+ {analysis.transactions.length - 20} autres</div>}
              </div>
            </div>
          )}
          {analysis.depenses_fixes?.length > 0 && (
            <div>
              <h4 style={miniTitle}>Charges fixes détectées ({analysis.depenses_fixes.length})</h4>
              <div className="list">
                {analysis.depenses_fixes.map((f, i) => (
                  <div key={i} className="row">
                    <div>
                      <div className="title">{f.libelle} — {fmt(f.montant)} €</div>
                      <div className="meta">{f.categorie || '—'}{f.jour_mois ? ` · le ${f.jour_mois}` : ''}</div>
                    </div>
                    <span className="badge acc">récurrent</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const miniTitle = { margin: '0 0 10px', color: 'var(--txt-dim)', textTransform: 'uppercase', fontSize: 12, letterSpacing: .6 };
function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
