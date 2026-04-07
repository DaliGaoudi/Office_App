import { useState, useEffect } from 'react';
import { 
  Phone, 
  Mail, 
  MapPin, 
  User, 
  Search, 
  Plus, 
  X, 
  Edit2, 
  Trash2, 
  Briefcase,
  Info
} from 'lucide-react';
import API_BASE from '../config';

export default function Telephone() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    num_tel1: '',
    num_tel2: '',
    email_tel: '',
    adresse_tel: '',
    observation_tel: '',
    qualite: ''
  });

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchTelephone();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const fetchTelephone = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/telephone?search=${search}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      setData(json.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleOpenModal = (contact = null) => {
    if (contact) {
      setEditingContact(contact);
      setFormData({
        nom: contact.nom || '',
        prenom: contact.prenom || '',
        num_tel1: contact.num_tel1 || '',
        num_tel2: contact.num_tel2 || '',
        email_tel: contact.email_tel || '',
        adresse_tel: contact.adresse_tel || '',
        observation_tel: contact.observation_tel || '',
        qualite: contact.qualite || ''
      });
    } else {
      setEditingContact(null);
      setFormData({
        nom: '',
        prenom: '',
        num_tel1: '',
        num_tel2: '',
        email_tel: '',
        adresse_tel: '',
        observation_tel: '',
        qualite: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const method = editingContact ? 'PUT' : 'POST';
    const url = editingContact ? `${API_BASE}/telephone/${editingContact.id_tel}` : `${API_BASE}/telephone`;

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchTelephone();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل تريد فعلاً حذف جهة الاتصال هذه؟')) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/telephone/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchTelephone();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getInitials = (n, p) => {
    return `${(n || '').charAt(0)}${(p || '').charAt(0)}`.toUpperCase() || '?';
  };

  return (
    <div className="animate-fade">
      <div className="topbar">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
          <User /> دليل الهاتف
        </h2>
        <button className="btn" onClick={() => handleOpenModal()}>
          <Plus size={18} /> جهة اتصال جديدة
        </button>
      </div>

      <div className="search-wrapper">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={18} style={{ position: 'right', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            className="search-input" 
            style={{ paddingRight: '2.5rem' }}
            placeholder="البحث بالاسم أو اللقب أو الرقم..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading && <p style={{padding:'2rem', textAlign: 'center'}}>جاري البحث...</p>}
      
      {!loading && data.length === 0 && (
        <div className="glass" style={{ padding: '4rem', textAlign: 'center', borderRadius: '16px' }}>
          <User size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.2 }} />
          <p>لم يتم العثور على جهات اتصال</p>
        </div>
      )}

      <div className="contact-grid">
        {data.map((contact) => (
          <div key={contact.id_tel} className="glass contact-card">
            <div className="contact-header">
              <div className="contact-avatar">
                {getInitials(contact.nom, contact.prenom)}
              </div>
              <div className="contact-info">
                <h3>{contact.nom} {contact.prenom}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: '500' }}>
                  {contact.qualite || 'جهة اتصال'}
                </span>
              </div>
            </div>

            <div className="contact-details">
              {contact.num_tel1 && (
                <div className="contact-detail-item">
                  <Phone size={14} /> {contact.num_tel1}
                </div>
              )}
              {contact.num_tel2 && (
                <div className="contact-detail-item">
                  <Phone size={14} /> {contact.num_tel2}
                </div>
              )}
              {contact.email_tel && (
                <div className="contact-detail-item">
                  <Mail size={14} /> {contact.email_tel}
                </div>
              )}
              {contact.adresse_tel && (
                <div className="contact-detail-item">
                  <MapPin size={14} /> {contact.adresse_tel}
                </div>
              )}
            </div>

            <div className="contact-actions">
              <button className="btn-icon" onClick={() => handleOpenModal(contact)} title="Modifier">
                <Edit2 size={16} />
              </button>
              <button className="btn-icon danger" onClick={() => handleDelete(contact.id_tel)} title="Supprimer">
                <Trash2 size={16} />
              </button>
              {contact.num_tel1 && (
                <a href={`tel:${contact.num_tel1}`} className="btn-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: '#10b981' }}>
                  <Phone size={16} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* FAB for mobile */}
      <div className="fab" onClick={() => handleOpenModal()}>
        <Plus size={24} />
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingContact ? 'تعديل جهة الاتصال' : 'إضافة جهة اتصال'}</h3>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}><X /></button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>اللقب</label>
                  <input 
                    type="text" 
                    value={formData.nom} 
                    onChange={e => setFormData({...formData, nom: e.target.value})} 
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>الاسم</label>
                  <input 
                    type="text" 
                    value={formData.prenom} 
                    onChange={e => setFormData({...formData, prenom: e.target.value})} 
                  />
                </div>
              </div>

              <div className="form-group">
                <label>الصفة / الرتبة</label>
                <input 
                  type="text" 
                  value={formData.qualite} 
                  onChange={e => setFormData({...formData, qualite: e.target.value})} 
                  placeholder="مثال: محامي، خبير..."
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>الهاتف 1</label>
                  <input 
                    type="text" 
                    value={formData.num_tel1} 
                    onChange={e => setFormData({...formData, num_tel1: e.target.value})} 
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>الهاتف 2</label>
                  <input 
                    type="text" 
                    value={formData.num_tel2} 
                    onChange={e => setFormData({...formData, num_tel2: e.target.value})} 
                  />
                </div>
              </div>

              <div className="form-group">
                <label>البريد الإلكتروني</label>
                <input 
                  type="email" 
                  value={formData.email_tel} 
                  onChange={e => setFormData({...formData, email_tel: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label>العنوان</label>
                <input 
                  type="text" 
                  value={formData.adresse_tel} 
                  onChange={e => setFormData({...formData, adresse_tel: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea 
                  className="glass"
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', color: 'var(--text-main)', border: '1px solid var(--card-border)', background: 'rgba(15, 23, 42, 0.5)', minHeight: '60px', outline: 'none' }}
                  value={formData.observation_tel} 
                  onChange={e => setFormData({...formData, observation_tel: e.target.value})} 
                />
              </div>

              <button type="submit" className="btn" style={{ marginTop: '1rem' }}>
                {editingContact ? 'تحديث' : 'حفظ'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
