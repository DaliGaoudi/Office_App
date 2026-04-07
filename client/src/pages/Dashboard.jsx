import { useState, useEffect } from 'react';
import { 
  Shield, 
  FileText, 
  Gavel, 
  Users, 
  CalendarDays, 
  ChevronRight, 
  Clock, 
  Bell,
  Activity,
  ArrowUpRight,
  Plus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API_BASE from '../config';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/dashboard/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const StatCard = ({ title, value, icon: Icon, color, link }) => (
    <div 
      className="glass" 
      style={{ 
        padding: '1.5rem', 
        borderRight: `4px solid ${color}`, 
        cursor: link ? 'pointer' : 'default',
        transition: 'transform 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}
      onClick={() => link && navigate(link)}
      onMouseEnter={(e) => link && (e.currentTarget.style.transform = 'translateY(-5px)')}
      onMouseLeave={(e) => link && (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</h3>
        <Icon size={20} style={{ color: color }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{value}</p>
        <span style={{ fontSize: '0.8rem', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
          <ArrowUpRight size={14} /> +2%
        </span>
      </div>
    </div>
  );

  return (
    <div className="animate-fade">
      <div className="topbar">
        <div>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--primary)', marginBottom: '0.2rem' }}>نظرة عامة</h2>
        </div>
        <div className="glass" style={{ padding: '0.6rem 1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <Bell size={20} style={{ color: 'var(--text-muted)' }} />
          <div style={{ width: '1px', height: '20px', background: 'var(--card-border)' }}></div>
          <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>{new Date().toLocaleDateString('fr-FR')}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <StatCard 
          title="المحاضر العامة" 
          value={data?.stats?.acts || 0} 
          icon={FileText} 
          color="var(--primary)" 
          link="/general" 
        />
        <StatCard 
          title="ملفات التنفيذ" 
          value={data?.stats?.execution || 0} 
          icon={Gavel} 
          color="#f59e0b" 
          link="/execution" 
        />
        <StatCard 
          title="دليل الهاتف" 
          value={data?.stats?.contacts || 0} 
          icon={Users} 
          color="#10b981" 
          link="/telephone" 
        />
        <StatCard 
          title="الجلسات القادمة" 
          value={data?.stats?.upcomingCount || 0} 
          icon={CalendarDays} 
          color="#8b5cf6" 
          link="/calendar" 
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Upcoming Audiences Section */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CalendarDays size={20} style={{ color: 'var(--primary)' }} /> الجلسات القريبة
            </h3>
            <button className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => navigate('/calendar')}>عرض الكل</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data?.upcomingEvents?.length > 0 ? (
              data.upcomingEvents.map(event => (
                <div key={event.id_even} className="glass" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', textAlign: 'center', minWidth: '50px' }}>
                      <span style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>{new Date(event.start).toLocaleDateString('fr-FR', { month: 'short' })}</span>
                      <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: 'bold' }}>{new Date(event.start).getDate()}</span>
                    </div>
                    <div>
                      <h4 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{event.title}</h4>
                      <p style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={12} /> {event.time_even || '--:--'} • {event.tribunal_even || 'Lieu non spécifié'}</p>
                    </div>
                  </div>
                  <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                لا توجد جلسات مجدولة قريباً.
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions / Recent Activity */}
        <div className="glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Activity size={20} style={{ color: 'var(--accent)' }} /> إجراءات سريعة
          </h3>
          <button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigate('/record/registre/new')}>
             <Plus size={18} /> محضر جديد
          </button>
          <button className="btn" style={{ width: '100%', justifyContent: 'flex-start', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--card-border)' }} onClick={() => navigate('/telephone')}>
             <Users size={18} /> إضافة جهة اتصال
          </button>
        </div>
      </div>
    </div>
  );
}
