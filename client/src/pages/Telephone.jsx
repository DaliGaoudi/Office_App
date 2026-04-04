import { useState, useEffect } from 'react';
import { Search, Plus, Download, Edit2, Trash2, X, Phone, Mail, MapPin, User as UserIcon } from 'lucide-react';
import API_BASE from '../config';

export default function Telephone() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [formData, setFormData] = useState({
    nom: '', profession: '', tel1: '', tel2: '', email: '', 
    adresse: '', ville: '', codep: '', notes: ''
  });

  useEffect(() => {
    fetchTelephone();
  }, [search]);

  const fetchTelephone = async () => {
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
  };

  const handleExport = () => {
    const token = localStorage.getItem('token');
    window.open(`${API_BASE}/telephone?format=csv&token=${token}`, '_blank');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const method = editingContact ? 'PUT' : 'POST';
    const url = editingContact ? `${API_BASE}/telephone/${editingContact.id_tel}` : `${API_BASE}/telephone`;

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        setEditingContact(null);
        setFormData({ nom: '', profession: '', tel1: '', tel2: '', email: '', adresse: '', ville: '', codep: '', notes: '' });
        fetchTelephone();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce contact ?')) return;
    const token = localStorage.getItem('token');
    try {
      await fetch(`${API_BASE}/telephone/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchTelephone();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="animate-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2><UserIcon size={24} style={{verticalAlign:'middle', marginRight:'8px'}}/> Annuaire Téléphonique</h2>
          <p>Gérez vos contacts et partenaires</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }} onClick={handleExport}>
            <Download size={18} /> Exporter CSV
          </button>
          <button className="btn" onClick={() => { setEditingContact(null); setShowModal(true); }}>
            <Plus size={18} /> Nouveau Contact
          </button>
        </div>
      </div>

      <div className="search-wrapper">
        <div className="search-input-container" style={{position:'relative', flex:1}}>
             <Search size={18} style={{position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', opacity:0.5}}/>
             <input 
              type="text" 
              placeholder="Rechercher par nom, téléphone, email ou profession..." 
              className="glass"
              style={{paddingLeft:'40px'}}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
        </div>
      </div>

      <div className="glass table-container">
          <table>
            <thead>
              <tr>
                <th>Nom & Profession</th>
                <th>Coordonnées</th>
                <th>Localisation</th>
                <th style={{textAlign:'right'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map(item => (
                <tr key={item.id_tel}>
                  <td>
                    <div style={{fontWeight:'600'}}>{item.nom}</div>
                    <div style={{fontSize:'0.8rem', opacity:0.6}}>{item.profession}</div>
                  </td>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'0.9rem'}}>
                        <Phone size={14} style={{color: 'var(--primary)'}}/> {item.tel1} {item.tel2 && `| ${item.tel2}`}
                    </div>
                    {item.email && (
                        <div style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'0.85rem', opacity:0.7, marginTop:'4px'}}>
                            <Mail size={14}/> {item.email}
                        </div>
                    )}
                  </td>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'0.85rem'}}>
                        <MapPin size={14} style={{opacity:0.6}}/> {item.ville} {item.codep && `(${item.codep})`}
                    </div>
                  </td>
                  <td>
                    <div style={{display:'flex', justifyContent:'flex-end', gap:'0.5rem'}}>
                        <button className="btn-icon glass" onClick={() => { setEditingContact(item); setFormData(item); setShowModal(true); }}>
                            <Edit2 size={16} />
                        </button>
                        <button className="btn-icon glass" style={{color:'#ef4444'}} onClick={() => handleDelete(item.id_tel)}>
                            <Trash2 size={16} />
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan="4" style={{textAlign:'center', padding:'3rem', opacity:0.5}}>Aucun contact trouvé</td></tr>}
            </tbody>
          </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="glass modal-content animate-fade">
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'1.5rem'}}>
              <h3>{editingContact ? 'Modifier le contact' : 'Nouveau Contact'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={20}/></button>
            </div>
            <form onSubmit={handleSave} className="form-grid">
              <div className="form-group full-width">
                <label>Nom complet</label>
                <input type="text" required value={formData.nom} onChange={e => setFormData({...formData, nom: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Profession</label>
                <input type="text" value={formData.profession} onChange={e => setFormData({...formData, profession: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Téléphone 1</label>
                <input type="text" value={formData.tel1} onChange={e => setFormData({...formData, tel1: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Téléphone 2</label>
                <input type="text" value={formData.tel2} onChange={e => setFormData({...formData, tel2: e.target.value})} />
              </div>
              <div className="form-group full-width">
                <label>Adresse</label>
                <input type="text" value={formData.adresse} onChange={e => setFormData({...formData, adresse: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Ville</label>
                <input type="text" value={formData.ville} onChange={e => setFormData({...formData, ville: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Code Postal</label>
                <input type="text" value={formData.codep} onChange={e => setFormData({...formData, codep: e.target.value})} />
              </div>
              <div className="form-group full-width" style={{marginTop:'1rem'}}>
                <button type="submit" className="btn">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .btn-icon {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
            background: rgba(255,255,255,0.05);
            color: var(--text-main);
        }
        .btn-icon:hover {
            background: rgba(255,255,255,0.1);
            transform: scale(1.05);
        }
      `}</style>
    </div>
  );
}
