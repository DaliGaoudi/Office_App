import { useState, useEffect } from 'react';
import { Shield, TrendingUp, AlertCircle, FileText, Calendar as CalendarIcon, Clock } from 'lucide-react';
import API_BASE from '../config';
import CalendarComponent from '../components/CalendarComponent';

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [todayEvents, setTodayEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    const token = localStorage.getItem('token');
    try {
      const [calRes, todayRes] = await [
        fetch(`${API_BASE}/calendar?limit=50`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE}/calendar/today`, { headers: { 'Authorization': `Bearer ${token}` } })
      ];
      
      const calData = await (await fetch(`${API_BASE}/calendar?limit=50`, { headers: { 'Authorization': `Bearer ${token}` } })).json();
      const todayData = await (await fetch(`${API_BASE}/calendar/today`, { headers: { 'Authorization': `Bearer ${token}` } })).json();
      
      setEvents(calData.data || []);
      setTodayEvents(todayData.data || []);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade">
      <div className="dashboard-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <StatCard title="Total Registres" value="1,248" icon={<FileText size={20} />} color="#3b82f6" />
        <StatCard title="Aujourd'hui" value={todayEvents.length} icon={<Clock size={20} />} color="#10b981" />
        <StatCard title="En attente" value="24" icon={<AlertCircle size={20} />} color="#f59e0b" />
        <StatCard title="Saisie Court" value="+12%" icon={<TrendingUp size={20} />} color="#8b5cf6" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '20px' }}>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:'1.5rem'}}>
            <h3><Clock size={20} style={{verticalAlign:'middle', marginRight:'8px'}}/> Agenda du jour</h3>
            <span style={{fontSize:'0.8rem', opacity:0.6}}>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
          
          <div className="today-list">
            {todayEvents.length > 0 ? todayEvents.map((e, idx) => (
              <div key={idx} className="today-item glass" style={{padding:'1rem', marginBottom:'0.8rem', borderLeft:'4px solid var(--primary)'}}>
                 <div style={{display:'flex', justifyContent:'space-between'}}>
                    <span style={{fontWeight:'600'}}>{e.sujet || 'Sans sujet'}</span>
                    <span style={{fontSize:'0.75rem', opacity:0.6}}>{new Date(e.fin_date).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</span>
                 </div>
                 <div style={{fontSize:'0.85rem', opacity:0.6, marginTop:'4px'}}>{e.location || 'Lieu non spécifié'}</div>
              </div>
            )) : (
              <div style={{textAlign:'center', padding:'3rem', opacity:0.5}}>
                <Clock size={40} style={{marginBottom:'1rem'}}/>
                <p>Aucun événement prévu pour aujourd'hui</p>
              </div>
            )}
          </div>
        </div>

        <div className="mini-calendar-container">
           <CalendarComponent events={events} mini={true} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <div className="glass" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{ padding: '0.75rem', background: `${color}22`, color: color, borderRadius: '12px' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>{title}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{value}</div>
      </div>
    </div>
  );
}
