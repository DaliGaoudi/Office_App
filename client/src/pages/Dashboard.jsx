import { Shield } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="glass" style={{ padding: '2rem' }}>
      <h2>Vue d'ensemble</h2>
      <p style={{ marginBottom: '2rem' }}>Bienvenue sur votre espace de gestion d'étude d'huissier.</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <div className="glass" style={{ padding: '1.5rem', borderLeft: '4px solid var(--primary)' }}>
          <h3>Aujourd'hui</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>5 <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>Actes</span></p>
        </div>
        <div className="glass" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent)' }}>
          <h3>En attente</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>12 <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>Dossiers</span></p>
        </div>
      </div>
    </div>
  );
}
