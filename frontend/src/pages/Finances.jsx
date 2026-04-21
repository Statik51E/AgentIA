import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';
import { Tabs } from '../components/Tabs.jsx';
import ChatWidget from '../components/ChatWidget.jsx';

import Overview from './finances/Overview.jsx';
import Transactions from './finances/Transactions.jsx';
import Accounts from './finances/Accounts.jsx';
import Goals from './finances/Goals.jsx';
import Evolution from './finances/Evolution.jsx';
import FixedExpenses from './finances/FixedExpenses.jsx';
import Statement from './finances/Statement.jsx';
import OverdraftPlan from './finances/OverdraftPlan.jsx';

const TABS = [
  { id: 'overview',     label: 'Vue d\'ensemble' },
  { id: 'transactions', label: 'Mouvements' },
  { id: 'accounts',     label: 'Comptes' },
  { id: 'goals',        label: 'Objectifs' },
  { id: 'evolution',    label: 'Évolution' },
  { id: 'fixed',        label: 'Charges fixes' },
  { id: 'overdraft',    label: 'Plan anti-découvert' },
  { id: 'statement',    label: 'Import relevé' },
];

export default function Finances() {
  const [tab, setTab] = useState('overview');
  const [month, setMonth] = useState(''); // '' = mois courant
  const [summary, setSummary] = useState(null);
  const [stats, setStats] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [fixed, setFixed] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [advice, setAdvice] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ categorie: '', limite_mensuelle: '' });
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [sum, st, bg, fx, ac, gl] = await Promise.all([
        api.finances.summary(),
        api.finances.stats(month),
        api.finances.listBudgets(),
        api.finances.listFixed(),
        api.finances.listAccounts(),
        api.finances.listGoals(),
      ]);
      setSummary(sum); setStats(st); setBudgets(bg); setFixed(fx); setAccounts(ac); setGoals(gl);
    } catch (e) { setErr(e.message); }
  };
  const loadAdvice = async () => {
    setLoadingAdvice(true);
    try { setAdvice(await api.ai.advice()); }
    catch (e) { setErr(e.message); }
    finally { setLoadingAdvice(false); }
  };
  useEffect(() => { load(); loadAdvice(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (stats !== null) load(); /* eslint-disable-next-line */ }, [month]);

  const addBudget = async (e) => {
    e.preventDefault();
    const limite = parseFloat(budgetForm.limite_mensuelle);
    const cat = budgetForm.categorie.trim().toLowerCase();
    if (!cat || !limite || limite <= 0) return;
    try { await api.finances.addBudget({ categorie: cat, limite_mensuelle: limite }); }
    catch (ex) { setErr(ex.message); }
    setBudgetForm({ categorie: '', limite_mensuelle: '' });
    load(); loadAdvice();
  };
  const delBudget = async (id) => { await api.finances.delBudget(id); load(); loadAdvice(); };

  const shiftMonth = (delta) => {
    const base = stats?.mois ? new Date(stats.mois + '-01') : new Date();
    base.setMonth(base.getMonth() + delta);
    const y = base.getFullYear(); const m = String(base.getMonth() + 1).padStart(2, '0');
    setMonth(`${y}-${m}`);
  };

  return (
    <>
      <TopBar
        title="Finances"
        sub={stats ? `${stats.isCurrent ? 'Mois courant' : 'Mois consulté'} : ${stats.mois} · J${stats.jour}/${stats.joursDansMois}` : 'Chargement…'}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ghost small" onClick={() => shiftMonth(-1)}>◀</button>
            <button className="btn ghost small" onClick={() => setMonth('')} disabled={stats?.isCurrent}>Mois courant</button>
            <button className="btn ghost small" onClick={() => shiftMonth(1)} disabled={stats?.isCurrent}>▶</button>
          </div>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {err && <div className="empty" style={{ color: 'var(--err)', marginBottom: 10 }}>Erreur : {err}</div>}

      {tab === 'overview' && (
        <Overview
          stats={stats} summary={summary} advice={advice}
          loadingAdvice={loadingAdvice} onReloadAdvice={loadAdvice}
          budgets={budgets} budgetForm={budgetForm} setBudgetForm={setBudgetForm}
          onAddBudget={addBudget} onDelBudget={delBudget}
        />
      )}
      {tab === 'transactions' && <Transactions accounts={accounts} onChanged={() => { load(); loadAdvice(); }} />}
      {tab === 'accounts'     && <Accounts accounts={accounts} onChanged={load} />}
      {tab === 'goals'        && <Goals goals={goals} accounts={accounts} onChanged={load} />}
      {tab === 'evolution'    && <Evolution />}
      {tab === 'fixed'        && <FixedExpenses fixed={fixed} onChanged={() => { load(); loadAdvice(); }} />}
      {tab === 'overdraft'    && <OverdraftPlan />}
      {tab === 'statement'    && <Statement accounts={accounts} onChanged={() => { load(); loadAdvice(); }} />}

      <ChatWidget expertise="finance" />
    </>
  );
}
