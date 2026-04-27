import { useState, useEffect } from 'react';
import { Users as UsersIcon, Plus, Edit2, Trash2, Shield, User, ShieldAlert, X } from 'lucide-react';
import API_BASE from '../config';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'user',
    societe: ''
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('فشل في تحميل المستخدمين');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenModal = (user = null) => {
    if (user) {
      setCurrentUser(user);
      setFormData({
        username: user.username,
        password: '', // Empty for editing
        role: user.role,
        societe: user.societe || ''
      });
    } else {
      setCurrentUser(null);
      setFormData({
        username: '',
        password: '',
        role: 'user',
        societe: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentUser(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    
    if (!currentUser && !formData.password) {
      alert('الرجاء إدخال كلمة المرور');
      return;
    }

    try {
      const method = currentUser ? 'PUT' : 'POST';
      const url = currentUser ? `${API_BASE}/users/${currentUser.id}` : `${API_BASE}/users`;
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'حدث خطأ');
      }

      handleCloseModal();
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
    
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'حدث خطأ أثناء الحذف');
      }

      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'superadmin':
        return <span className="glass" style={{ padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ShieldAlert size={14}/> مدير عام</span>;
      case 'admin':
        return <span className="glass" style={{ padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Shield size={14}/> مدير</span>;
      default:
        return <span className="glass" style={{ padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><User size={14}/> مستخدم</span>;
    }
  };

  return (
    <div className="animate-fade" dir="rtl" style={{ padding: '1rem' }}>
      <div className="topbar" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <UsersIcon size={24} style={{ color: 'var(--primary)' }} />
          <h2 style={{ color: 'var(--primary)', margin: 0 }}>المستخدمون</h2>
        </div>
        <button className="btn" onClick={() => handleOpenModal()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> إضافة مستخدم
        </button>
      </div>

      {loading ? (
        <p style={{ opacity: 0.6 }}>جاري التحميل…</p>
      ) : error ? (
        <p style={{ color: '#ef4444' }}>{error}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {users.map(user => (
            <div key={user.id} className="glass" style={{ padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {user.username}
                  </h3>
                  {getRoleBadge(user.role)}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-icon" onClick={() => handleOpenModal(user)} title="تعديل">
                    <Edit2 size={18} style={{ color: '#3b82f6' }} />
                  </button>
                  <button className="btn-icon" onClick={() => handleDelete(user.id)} title="حذف">
                    <Trash2 size={18} style={{ color: '#ef4444' }} />
                  </button>
                </div>
              </div>
              {user.societe && (
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                  <strong>الشركة:</strong> {user.societe}
                </div>
              )}
            </div>
          ))}
          {users.length === 0 && <p style={{ opacity: 0.6 }}>لا يوجد مستخدمين</p>}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay animate-fade" onClick={handleCloseModal} style={{ zIndex: 1000 }}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'var(--primary)' }}>
                {currentUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
              </h3>
              <button className="btn-icon" onClick={handleCloseModal}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>اسم المستخدم</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  كلمة المرور {currentUser && <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>(اتركها فارغة لعدم التغيير)</span>}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  required={!currentUser}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>الدور</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value})}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text)' }}
                >
                  <option value="user">مستخدم (سكرتير)</option>
                  <option value="admin">مدير</option>
                  <option value="superadmin">مدير عام</option>
                </select>
              </div>

              <button type="submit" className="btn" style={{ marginTop: '1rem', padding: '0.75rem' }}>
                حفظ
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
