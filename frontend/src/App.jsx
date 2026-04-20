import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Finances from './pages/Finances.jsx';
import Projets from './pages/Projets.jsx';
import Idees from './pages/Idees.jsx';
import IA from './pages/IA.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import { useAuth } from './lib/auth.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--txt-soft)' }}>
        Chargement…
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="app">
      <Sidebar />
      <main>
        <Routes>
          <Route path="/"         element={<Dashboard />} />
          <Route path="/finances" element={<Finances />} />
          <Route path="/projets"  element={<Projets />} />
          <Route path="/idees"    element={<Idees />} />
          <Route path="/ia"       element={<IA />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
