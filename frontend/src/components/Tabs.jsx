export function Tabs({ tabs, active, onChange }) {
  return (
    <div style={wrap}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`btn ${active === t.id ? '' : 'ghost'} small`}
          style={{ whiteSpace: 'nowrap' }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const wrap = { display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 };
