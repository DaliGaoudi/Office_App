import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Shield, BookOpen, Users, CalendarDays, LogOut, FileText, Receipt, Settings as SettingsIcon, Sun, Moon, Menu } from 'lucide-react';
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
  const { logout } = useAuth();
  
  const handleLinkClick = () => {
    if (closeMenu) closeMenu();
  };

  return (
    <>
      {isOpen && <div className="mobile-overlay animate-fade" onClick={closeMenu}></div>}
      <div className={`sidebar glass-panel ${isOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', padding: '0 1rem' }}>
          <img src={logo} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--primary)' }}>مكتب الأستاذ مراد القعودي</h2>
        </div>
        <ul className="nav-links">
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
              <Users size={18} /> دليل الهاتف
            </NavLink>
          </li>
          <li>
            <NavLink to="/calendar" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <CalendarDays size={18} /> التقويم
            </NavLink>
          </li>
        </ul>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <NavLink to="/settings" onClick={handleLinkClick} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
            style={{ fontSize: '0.85rem' }}>
            <SettingsIcon size={17} /> الإعدادات
          </NavLink>
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
            <span className="glass" style={{ padding: '0.5rem 1rem', borderRadius: '20px', color: 'var(--primary)' }}>مدير</span>
          </div>
        </div>
        {children}
      </div>
      <AIAssistant />
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
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Layout>
          )}
        </BrowserRouter>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}

export default App;
