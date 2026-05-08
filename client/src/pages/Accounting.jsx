import { useState, useEffect } from 'react';
import { Download, TrendingUp, TrendingDown, DollarSign, PieChart, Activity, BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import API_BASE from '../config';

const formatAmount = (val) => {
  if (!val || isNaN(val)) return '0.000';
  return Number(val).toFixed(3);
};

export default function Accounting() {
  const [data, setData] = useState({ monthly: [], totals: { base: 0, tva: 0, expenses: 0, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  useEffect(() => {
    fetchStats();
  }, [year]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/accounting/stats?year=${year}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('فشل في تحميل البيانات المالية');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['الشهر', 'الأجور', 'الأداء (19%)', 'المصاريف', 'المجموع (د.ت)'];
    
    const rows = data.monthly.map(m => [
      m.monthName,
      m.base.toFixed(3),
      m.tva.toFixed(3),
      m.expenses.toFixed(3),
      m.total.toFixed(3)
    ]);
    
    // Add Totals row
    rows.push([
      'المجموع العام',
      data.totals.base.toFixed(3),
      data.totals.tva.toFixed(3),
      data.totals.expenses.toFixed(3),
      data.totals.total.toFixed(3)
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    // Add BOM for Excel Arabic support
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `financial_report_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Custom Tooltip for Arabic support
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass" style={{ padding: '1rem', border: '1px solid var(--primary)', borderRadius: '8px' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>{label}</p>
          {payload.map((entry, index) => (
            <p key={`item-${index}`} style={{ margin: 0, color: entry.color, fontSize: '0.9rem' }}>
              {entry.name}: {formatAmount(entry.value)} د.ت
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="animate-fade" dir="rtl" style={{ padding: '1rem', paddingBottom: '3rem' }}>
      <div className="topbar" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <PieChart size={28} style={{ color: 'var(--primary)' }} />
          <div>
            <h2 style={{ color: 'var(--primary)', margin: 0 }}>المحاسبة والتقارير المالية</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>نظرة شاملة على المداخيل، الأداءات، والمصاريف</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select 
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--bg)', border: '1px solid var(--card-border)', color: 'var(--text)', outline: 'none', fontWeight: 'bold' }}
          >
            {[...Array(5)].map((_, i) => (
              <option key={i} value={currentYear - i}>{currentYear - i}</option>
            ))}
          </select>

          <button className="btn" onClick={exportToCSV} disabled={loading || data.totals.total === 0} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#10b981' }}>
            <Download size={18} />
            تصدير للمحاسب
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ opacity: 0.6, textAlign: 'center', padding: '2rem' }}>جاري الحساب والتحليل…</p>
      ) : error ? (
        <p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</p>
      ) : (
        <>
          {/* Key Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', borderBottom: '4px solid #10b981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>الأجور (مداخيل صافية)</div>
                <TrendingUp size={20} color="#10b981" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{formatAmount(data.totals.base)} <span style={{fontSize:'1rem', opacity:0.5}}>د.ت</span></div>
            </div>
            
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', borderBottom: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>الأداء على القيمة المضافة (TVA)</div>
                <DollarSign size={20} color="#3b82f6" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{formatAmount(data.totals.tva)} <span style={{fontSize:'1rem', opacity:0.5}}>د.ت</span></div>
            </div>

            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', borderBottom: '4px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>المصاريف المدفوعة (Expenses)</div>
                <TrendingDown size={20} color="#f59e0b" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{formatAmount(data.totals.expenses)} <span style={{fontSize:'1rem', opacity:0.5}}>د.ت</span></div>
            </div>

            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', borderBottom: '4px solid var(--primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>المجموع الجملي (Gross)</div>
                <Activity size={20} color="var(--primary)" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>{formatAmount(data.totals.total)} <span style={{fontSize:'1rem', opacity:0.5}}>د.ت</span></div>
            </div>
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginBottom: '2rem' }}>
            
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart3 size={18} color="var(--primary)"/> تحليل الإيرادات الشهرية {year}
              </h3>
              <div style={{ width: '100%', height: 350 }} dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthly} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                    <XAxis dataKey="monthName" stroke="var(--text-muted)" tick={{fill: 'var(--text-muted)'}} />
                    <YAxis stroke="var(--text-muted)" tick={{fill: 'var(--text-muted)'}} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="base" name="الأجور" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="tva" name="TVA" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="expenses" name="المصاريف" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={18} color="var(--primary)"/> تطور الدخل الجملي
              </h3>
              <div style={{ width: '100%', height: 250 }} dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.monthly} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                    <XAxis dataKey="monthName" stroke="var(--text-muted)" tick={{fill: 'var(--text-muted)'}} />
                    <YAxis stroke="var(--text-muted)" tick={{fill: 'var(--text-muted)'}} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="total" name="المجموع الجملي" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: 'var(--primary)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
