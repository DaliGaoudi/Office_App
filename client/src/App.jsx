import { useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Shield, BookOpen, Users, CalendarDays, LogOut, FileText, Receipt, Settings as SettingsIcon } from 'lucide-react';
import './index.css';

// Context for Auth
const AuthContext = createContext();

const useAuth = () => useContext(AuthContext);

// --- Layout & Components --- //

const Sidebar = () => {
  const { logout } = useAuth();
  return (
    <div className="sidebar glass-panel">
      <h2><Shield /> Etude HD</h2>
      <ul className="nav-links">
        <li>
          <NavLink to="/" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <FileText size={20} /> Dashboard
          </NavLink>
        </li>

        {/* ── Registres ── */}
        <li style={{ padding: '0.4rem 1rem 0', fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Registres</li>
        <li>
          <NavLink to="/general" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <BookOpen size={18} /> Registre Général
          </NavLink>
        </li>
        <li>
          <NavLink to="/execution" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <BookOpen size={18} /> Registre d'Exécution
          </NavLink>
        </li>
        <li>
          <NavLink to="/cnss" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <BookOpen size={18} /> Dossiers CNSS
          </NavLink>
        </li>

        {/* ── Facturation ── */}
        <li style={{ padding: '0.4rem 1rem 0', fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Facturation</li>
        <li>
          <NavLink to="/facturation/general" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Receipt size={18} /> Fact. Générale
          </NavLink>
        </li>
        <li>
          <NavLink to="/facturation/execution" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Receipt size={18} /> Fact. Exécution
          </NavLink>
        </li>
        <li>
          <NavLink to="/facturation/cnss" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Receipt size={18} /> Fact. CNSS
          </NavLink>
        </li>

        {/* ── Autres ── */}
        <li style={{ padding: '0.4rem 1rem 0', fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Autres</li>
        <li>
          <NavLink to="/telephone" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Users size={18} /> Annuaire
          </NavLink>
        </li>
        <li>
          <NavLink to="/calendar" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <CalendarDays size={18} /> Calendrier
          </NavLink>
        </li>
      </ul>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <NavLink to="/settings" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
          style={{ fontSize: '0.85rem' }}>
          <SettingsIcon size={17} /> الإعدادات
        </NavLink>
        <button className="btn" style={{ width: '100%', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }} onClick={logout}>
          <LogOut size={20} /> Déconnexion
        </button>
      </div>
    </div>
  );
}

const Layout = ({ children }) => {
  const { user } = useAuth();
  return (
    <div className="layout-container animate-fade">
      <Sidebar />
      <div className="main-content">
        <div className="topbar">
          <div>
            <h1>Bonjour, {user?.username}</h1>
            <p>Gérez votre étude efficacement</p>
          </div>
          <div className="profile-section">
            <span className="glass" style={{ padding: '0.5rem 1rem', borderRadius: '20px', color: 'var(--primary)' }}>Admin</span>
          </div>
        </div>
        {children}
      </div>
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
        <h1>Authentification</h1>
        {error && <div style={{color: '#ef4444', textAlign: 'center', background:'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius:'5px'}}>{error}</div>}
        <form onSubmit={handleSubmit} style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
          <div>
            <label>Utilisateur</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
          <div>
            <label>Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn" style={{marginTop:'1rem'}}>Connexion</button>
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
    </AuthContext.Provider>
  );
}

export default App;
