import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { Shield, BookOpen, Users as UsersIcon, CalendarDays, LogOut, FileText, Receipt, Settings as SettingsIcon, Sun, Moon, Menu, Search, Database, Eye, PieChart } from 'lucide-react';
import './index.css';

import logo from './assets/logo.png';

// Context for Auth
const AuthContext = createContext();

const useAuth = () => useContext(AuthContext);

// Context for Theme
const ThemeContext = createContext();
const useTheme = () => useContext(ThemeContext);

// --- Layout & Components --- //

const Sidebar = ({ isOpen, closeMenu }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [globalSearch, setGlobalSearch] = useState('');
  
  const handleLinkClick = () => {
    if (closeMenu) closeMenu();
  };

  const handleGlobalSearch = (e) => {
    e.preventDefault();
    if (globalSearch.trim()) {
      navigate(`/general?ref=${encodeURIComponent(globalSearch.trim())}`);
      setGlobalSearch('');
      if (closeMenu) closeMenu();
    }
  };

  return (
    <>
      {isOpen && <div className="mobile-overlay animate-fade" onClick={closeMenu}></div>}
      <div className={`sidebar glass-panel ${isOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', padding: '0 1rem' }}>
          <img src={logo} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--primary)' }}>مكتب الأستاذ مراد القعودي</h2>
        </div>
        
        <div style={{ padding: '0 1rem', marginBottom: '1rem' }}>
          {user?.role !== 'client' && (
            <form onSubmit={handleGlobalSearch} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.4rem 0.6rem' }}>
              <input 
                type="text" 
                placeholder="بحث بالعدد الترتيبي..." 
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '0.85rem', width: '100%', outline: 'none' }}
              />
              <button type="submit" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                <Search size={16} />
              </button>
            </form>
          )}
        </div>

        <ul className="nav-links">
          {user?.role === 'client' ? (
            <li>
              <NavLink to="/portal" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
                <FileText size={20} /> ملفاتي
              </NavLink>
            </li>
          ) : (
            <>
              <li>
                <NavLink to="/" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
                  <FileText size={20} /> لوحة القيادة
                </NavLink>
              </li>

          {/* ── Registres ── */}
          <li style={{ padding: '0.4rem 1rem 0', fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>السجلات</li>
          <li>
            <NavLink to="/general" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <BookOpen size={18} /> الدفتر العام
            </NavLink>
          </li>
          <li>
            <NavLink to="/execution" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <BookOpen size={18} /> دفتر التنفيذ
            </NavLink>
          </li>
          <li>
            <NavLink to="/cnss" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <BookOpen size={18} /> ملفات الضمان الاجتماعي
            </NavLink>
          </li>

          {/* ── Facturation ── */}
          <li style={{ padding: '0.4rem 1rem 0', fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>الفوترة</li>
          <li>
            <NavLink to="/facturation/general" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Receipt size={18} /> الفوترة العامة
            </NavLink>
          </li>
          <li>
            <NavLink to="/facturation/execution" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Receipt size={18} /> فوترة التنفيذ
            </NavLink>
          </li>
          <li>
            <NavLink to="/facturation/cnss" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Receipt size={18} /> فوترة الضمان الاجتماعي
            </NavLink>
          </li>

          {/* ── Autres ── */}
          <li style={{ padding: '0.4rem 1rem 0', fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>إضافات</li>
          <li>
            <NavLink to="/telephone" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <UsersIcon size={18} /> دليل الهاتف
            </NavLink>
          </li>
          <li>
            <NavLink to="/calendar" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <CalendarDays size={18} /> التقويم
            </NavLink>
          </li>
            </>
          )}
        </ul>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <NavLink to="/settings" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
            style={{ fontSize: '0.85rem' }}>
            <SettingsIcon size={17} /> الإعدادات
          </NavLink>
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <>
              <NavLink to="/users" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
                style={{ fontSize: '0.85rem' }}>
                <UsersIcon size={17} /> المستخدمون
              </NavLink>
              <NavLink to="/data-cleaning" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
                style={{ fontSize: '0.85rem' }}>
                <Database size={17} /> تنظيف البيانات
              </NavLink>
              <NavLink to="/audit-logs" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
                style={{ fontSize: '0.85rem' }}>
                <Eye size={17} /> سجل النشاطات
              </NavLink>
              <NavLink to="/accounting" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
                style={{ fontSize: '0.85rem' }}>
                <PieChart size={17} /> المحاسبة
              </NavLink>
            </>
          )}
          <button className="btn" style={{ width: '100%', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }} onClick={logout}>
            <LogOut size={20} /> تسجيل الخروج
          </button>
        </div>
      </div>
    </>
  );
}

import AIAssistant from './components/AIAssistant';

const Layout = ({ children }) => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="layout-container animate-fade">
      <Sidebar isOpen={isMobileMenuOpen} closeMenu={() => setIsMobileMenuOpen(false)} />
      <div className="main-content">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn-icon mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={24} />
            </button>
            <h1>مرحباً، {user?.username}</h1>
          </div>
          <div className="profile-section">
            <button className="btn-icon" onClick={toggleTheme} title="تبديل المظهر" style={{ marginRight: '0.5rem' }}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="glass" style={{ padding: '0.5rem 1rem', borderRadius: '20px', color: 'var(--primary)' }}>
              {user?.role === 'superadmin' ? 'مدير عام' : user?.role === 'admin' ? 'مدير' : user?.role === 'client' ? 'حريف' : 'مستخدم'}
            </span>
          </div>
        </div>
        {children}
      </div>
      {user?.role !== 'client' && <AIAssistant />}
    </div>
  );
}

// --- Pages --- //

import API_BASE from './config';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        login(data.user, data.token);
      } else {
        setError(data.error);
      }
    } catch(err) {
      setError('Erreur de connexion ' + err.message);
    }
  };

  return (
    <div className="login-container animate-fade">
      <div className="glass login-card">
        <h1>تسجيل الدخول</h1>
        {error && <div style={{color: '#ef4444', textAlign: 'center', background:'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius:'5px'}}>{error}</div>}
        <form onSubmit={handleSubmit} style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
          <div>
            <label>اسم المستخدم</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
          <div>
            <label>كلمة المرور</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn" style={{marginTop:'1rem'}}>دخول</button>
        </form>
      </div>
    </div>
  );
};

// ... other pages will be imported here
// Let's create placeholders for them
import Dashboard from './pages/Dashboard';
import RegistreGeneral from './pages/RegistreGeneral';
import RegistreExecution from './pages/RegistreExecution';
import RegistreCNSS from './pages/RegistreCNSS';
import Telephone from './pages/Telephone';
import Calendar from './pages/Calendar';
import RecordDetail from './pages/RecordDetail';
import Facturation from './pages/Facturation';
import Settings from './pages/Settings';
import Users from './pages/Users';
import PortalDashboard from './pages/PortalDashboard';
import DataCleaning from './pages/DataCleaning';
import AuditLogs from './pages/AuditLogs';
import Accounting from './pages/Accounting';

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')) || null);
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const login = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', userToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      <ThemeContext.Provider value={{ theme, toggleTheme }}>
        <BrowserRouter>
          {!user ? (
            <Routes>
              <Route path="*" element={<Login />} />
            </Routes>
          ) : (
            <Layout>
              {user?.role === 'client' ? (
                <Routes>
                  <Route path="/portal" element={<PortalDashboard />} />
                  <Route path="*" element={<Navigate to="/portal" />} />
                </Routes>
              ) : (
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/general" element={<RegistreGeneral />} />
                  <Route path="/execution" element={<RegistreExecution />} />
                  <Route path="/cnss" element={<RegistreCNSS />} />
                  <Route path="/telephone" element={<Telephone />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/record/:type/:id" element={<RecordDetail />} />
                  <Route path="/facturation/general"   element={<Facturation type="general" />} />
                  <Route path="/facturation/execution" element={<Facturation type="execution" />} />
                  <Route path="/facturation/cnss"      element={<Facturation type="cnss" />} />
                  <Route path="/settings"              element={<Settings />} />
                  {(user?.role === 'admin' || user?.role === 'superadmin') && (
                    <>
                      <Route path="/users" element={<Users />} />
                      <Route path="/data-cleaning" element={<DataCleaning />} />
                      <Route path="/audit-logs" element={<AuditLogs />} />
                      <Route path="/accounting" element={<Accounting />} />
                    </>
                  )}
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              )}
            </Layout>
          )}
        </BrowserRouter>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}

export default App;
