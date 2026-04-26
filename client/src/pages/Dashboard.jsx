import { useState, useEffect } from 'react';
import { 
  FileText, 
  Gavel, 
  Users, 
  CalendarDays, 
  ChevronRight, 
  ChevronLeft,
  Clock, 
  Activity,
  Plus,
  Search,
  Filter,
  DollarSign,
  AlertCircle,
  X,
  ExternalLink,
  MapPin,
  CheckCircle2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API_BASE from '../config';

const MiniCalendar = ({ deadlines }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(null);
  
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const monthNames = ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const dayNames = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];

  const deadlinesByDate = {};
  deadlines?.forEach(dl => {
    if (!dl.date_echeance) return;
    const dateStr = dl.date_echeance.split('T')[0];
    if (!deadlinesByDate[dateStr]) deadlinesByDate[dateStr] = [];
    deadlinesByDate[dateStr].push(dl);
  });

  const renderDays = () => {
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} style={{ padding: '0.5rem' }}></div>);
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayDeadlines = deadlinesByDate[dateStr] || [];
      const isToday = dateStr === new Date().toISOString().split('T')[0];
      
      days.push(
        <div 
          key={d} 
          style={{ 
            padding: '0.4rem', 
            borderRadius: '8px',
            background: selectedDateStr === dateStr ? 'var(--primary)' : isToday ? 'var(--primary-light, rgba(23, 118, 210, 0.1))' : 'transparent',
            border: isToday && selectedDateStr !== dateStr ? '1px solid var(--primary)' : '1px solid transparent',
            color: selectedDateStr === dateStr ? '#fff' : 'inherit',
            cursor: dayDeadlines.length > 0 ? 'pointer' : 'default',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative'
          }}
          title={dayDeadlines.map(dl => `#${dl.ref} - ${dl.nom_cl1}`).join('\n')}
          onClick={() => {
            if (dayDeadlines.length > 0) {
              setSelectedDateStr(selectedDateStr === dateStr ? null : dateStr);
            }
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: isToday || dayDeadlines.length > 0 ? 'bold' : 'normal' }}>{d}</span>
          {dayDeadlines.length > 0 && (
            <div style={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              background: selectedDateStr === dateStr ? '#fff' : 'var(--status-error, #ef4444)',
              marginTop: '2px'
            }}></div>
          )}
        </div>
      );
    }
    return days;
  };

  return (
    <div style={{ padding: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <button onClick={prevMonth} className="btn-icon" style={{ padding: '0.3rem' }}><ChevronRight size={16}/></button>
        <strong style={{ fontSize: '0.95rem' }}>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</strong>
        <button onClick={nextMonth} className="btn-icon" style={{ padding: '0.3rem' }}><ChevronLeft size={16}/></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem', textAlign: 'center' }}>
        {dayNames.map(day => <div key={day} style={{ fontSize: '0.75rem', color: 'var(--text-soft)', fontWeight: 'bold', paddingBottom: '0.5rem' }}>{day}</div>)}
        {renderDays()}
      </div>
      
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-error, #ef4444)' }}></div>
          أجل قريب
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: 'var(--primary-light, rgba(23, 118, 210, 0.1))', border: '1px solid var(--primary)' }}></div>
          اليوم
        </div>
      </div>

      {/* Selected Date Details */}
      {selectedDateStr && deadlinesByDate[selectedDateStr] && (
        <div className="animate-fade" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--primary)', margin: 0 }}>
              ملفات يوم {new Date(selectedDateStr).toLocaleDateString('fr-FR')}
            </h4>
            <button className="btn-icon" onClick={() => setSelectedDateStr(null)} style={{ padding: '0.2rem' }}><X size={14} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
            {deadlinesByDate[selectedDateStr].map(dl => (
              <div key={dl.id_r} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontWeight: 'bold', color: 'var(--text-main)', marginRight: '0.3rem' }}>#{dl.ref}</span>
                  <span style={{ color: 'var(--text-soft)' }}>{dl.nom_cl1}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedCase, setSelectedCase] = useState(null); // For Quick View Drawer
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

  const filteredCases = data?.recentCases?.filter(c => {
    const matchesSearch = c.nom_cl1?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.de_part?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.ref?.toString().includes(searchTerm);
    const matchesFilter = filterStatus === 'all' || c.status === filterStatus;
    return matchesSearch && matchesFilter;
  }) || [];

  const MetricCard = ({ title, value, label, icon: Icon, color }) => (
    <div className="glass" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{ padding: '0.75rem', borderRadius: '12px', background: `${color}15`, color: color }}>
        <Icon size={22} />
      </div>
      <div>
        <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{title}</h4>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: '700' }}>{value}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-soft)' }}>{label}</span>
        </div>
      </div>
    </div>
  );

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>جاري التحميل...</div>;

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* ── Quick Actions (Top) ── */}
      <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        <button className="btn" onClick={() => navigate('/record/registre/new')}>
          <Plus size={18} /> محضر جديد
        </button>
        <button className="btn" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-main)' }}>
          <FileText size={18} /> إنشاء مستند
        </button>
        <button className="btn" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-main)' }}>
          <DollarSign size={18} /> تسجيل دفع
        </button>
      </div>

      {/* ── 1. Metrics Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <MetricCard 
          title="الملفات النشطة" 
          value={data?.metrics?.activeCount} 
          label="ملف" 
          icon={Gavel} 
          color="var(--primary)" 
        />
        <MetricCard 
          title="مواعيد اليوم" 
          value={data?.metrics?.dueToday} 
          label="مهمة" 
          icon={Clock} 
          color="var(--accent-gold)" 
        />
        <MetricCard 
          title="هذا الأسبوع" 
          value={data?.metrics?.dueWeek} 
          label="موعد" 
          icon={CalendarDays} 
          color="#8b5cf6" 
        />
        <MetricCard 
          title="إنجازات الشهر" 
          value={data?.metrics?.completedMonth} 
          label="منتهي" 
          icon={CheckCircle2} 
          color="var(--status-success)" 
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: '2rem' }}>
        
        {/* ── Left Column: Cases & Tasks ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* 2. Cases Management Table */}
          <div className="glass" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={20} style={{ color: 'var(--primary)' }} /> إدارة الملفات
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-soft)' }} />
                  <input 
                    type="text" 
                    placeholder="بحث في الملفات..." 
                    style={{ paddingRight: '2.2rem', fontSize: '0.85rem', width: '200px' }}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <select 
                  style={{ width: 'auto', fontSize: '0.85rem' }}
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                >
                  <option value="all">كل الحالات</option>
                  <option value="not_started">غير مبدأ</option>
                  <option value="in_progress">قيد الإنجاز</option>
                  <option value="finished">مكتمل</option>
                </select>
              </div>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>المرجع</th>
                    <th>الطالب</th>
                    <th>المطلوب ضده</th>
                    <th>الحالة</th>
                    <th>تاريخ الأجل</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.map(c => (
                    <tr key={c.id_r} onClick={() => setSelectedCase(c)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: '600' }}>#{c.ref}</td>
                      <td>{c.nom_cl1}</td>
                      <td>{c.de_part}</td>
                      <td>
                        <span className={`badge badge-${c.status === 'finished' ? 'green' : c.status === 'not_started' ? 'red' : 'amber'}`}>
                          {c.status === 'finished' ? 'مكتمل' : c.status === 'not_started' ? 'جديد' : 'قيد الإنجاز'}
                        </span>
                      </td>
                      <td style={{ color: new Date(c.date_echeance) < new Date() ? 'var(--primary)' : 'inherit' }}>
                        {c.date_echeance ? new Date(c.date_echeance).toLocaleDateString('fr-FR') : '--'}
                      </td>
                      <td><ChevronRight size={18} style={{ opacity: 0.3 }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Tasks / Actions Queue */}
          <div className="glass" style={{ padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <Activity size={20} style={{ color: 'var(--accent-gold)' }} /> قائمة المهام (To-Do)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {data?.tasksQueue?.map(task => (
                <div key={task.id_r} className="glass" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRight: '4px solid var(--primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 'bold' }}>أولوية عالية</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-soft)' }}>#{task.ref}</span>
                  </div>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>{task.nom_cl1} ضد {task.de_part}</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <MapPin size={12} /> معاينة العنوان المذكور
                  </p>
                  <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>متأخر: {task.date_echeance}</span>
                    <button className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}>إنجاز</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right Column: Deadlines & Timeline ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* 3. Deadlines & Calendar */}
          <div className="glass" style={{ padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <CalendarDays size={20} style={{ color: 'var(--primary)' }} /> المواعيد والأجال
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {data?.deadlines?.map(dl => (
                <div key={dl.id_even} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ textAlign: 'center', minWidth: '45px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-soft)', textTransform: 'uppercase' }}>
                      {new Date(dl.start).toLocaleDateString('fr-FR', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{new Date(dl.start).getDate()}</div>
                  </div>
                  <div className="glass" style={{ flex: 1, padding: '0.75rem', background: 'rgba(255,255,255,0.01)' }}>
                    <h4 style={{ fontSize: '0.85rem', marginBottom: '0.2rem' }}>{dl.title}</h4>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={12} /> {dl.time_even || '--:--'} • {dl.tribunal_even || 'لا يوجد مكان'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* New: Calendar Widget */}
          <div className="glass" style={{ padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <CalendarDays size={20} style={{ color: 'var(--accent-gold)' }} /> رزنامة الآجال
            </h3>
            <MiniCalendar deadlines={data?.calendarDeadlines} />
          </div>

          {/* 6. Payments Summary */}
          <div className="glass" style={{ padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <DollarSign size={20} style={{ color: 'var(--status-success)' }} /> ملخص الأداء
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span color="var(--text-muted)">المجموع المتوقع:</span>
                <span style={{ fontWeight: 'bold' }}>{data?.payments?.expected?.toLocaleString()} د.ت</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span color="var(--text-muted)">المبالغ المحصلة:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--status-success)' }}>{data?.payments?.collected?.toLocaleString()} د.ت</span>
              </div>
              <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.5rem' }}>
                <div style={{ 
                  height: '100%', 
                  background: 'var(--status-success)', 
                  width: `${(data?.payments?.collected / data?.payments?.expected) * 100 || 0}%` 
                }}></div>
              </div>
            </div>
          </div>

          {/* 9. Activity Timeline */}
          <div className="glass" style={{ padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <Activity size={20} style={{ color: 'var(--text-soft)' }} /> سجل النشاطات
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
              <div style={{ position: 'absolute', right: '7px', top: 0, bottom: 0, width: '2px', background: 'var(--border)', zIndex: 0 }}></div>
              {data?.timeline?.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: item.type === 'case' ? 'var(--primary)' : 'var(--accent-gold)', border: '4px solid var(--bg-main)' }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.1rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{item.action}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-soft)' }}>{item.date}</span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick View Drawer Logic ── */}
      {selectedCase && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'flex-start' /* RTL Slide from left */
        }} onClick={() => setSelectedCase(null)}>
          <div className="animate-fade" style={{
            width: '450px',
            height: '100vh',
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            boxShadow: 'var(--glass-shadow)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>عرض سريع للملف</h2>
              <button className="btn-icon" onClick={() => setSelectedCase(null)}><X size={20} /></button>
            </div>

            <div style={{ padding: '1rem', borderRadius: '12px', background: 'var(--nav-active-bg)', border: '1px solid var(--primary)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold' }}>#{selectedCase.ref}</div>
              <h3 style={{ margin: '0.5rem 0' }}>{selectedCase.nom_cl1}</h3>
              <p style={{ color: 'var(--text-muted)' }}>ضد {selectedCase.de_part}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label>الحالة</label>
                <div className={`badge badge-${selectedCase.status === 'finished' ? 'green' : 'amber'}`}>
                  {selectedCase.status === 'finished' ? 'مكتمل' : 'قيد الإنجاز'}
                </div>
              </div>
              <div className="form-group">
                <label>تاريخ التسجيل</label>
                <div style={{ fontSize: '0.95rem' }}>{selectedCase.date_reg}</div>
              </div>
              <div className="form-group">
                <label>تاريخ الأجل</label>
                <div style={{ fontSize: '0.95rem', color: 'var(--primary)' }}>{selectedCase.date_echeance}</div>
              </div>
              <div className="form-group">
                <label>المبلغ الإجمالي</label>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{selectedCase.salaire?.toLocaleString()} د.ت</div>
              </div>
              {selectedCase.remarque && (
                <div className="form-group">
                  <label>ملاحظات</label>
                  <p style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{selectedCase.remarque}</p>
                </div>
              )}
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: '1rem' }}>
               <button className="btn" style={{ flex: 1 }} onClick={() => navigate(`/record/registre/${selectedCase.id_r}`)}>
                 <ExternalLink size={18} /> معاينة كاملة وتعديل
               </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
