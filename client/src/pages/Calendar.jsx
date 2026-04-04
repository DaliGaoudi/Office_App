import { useState, useEffect } from 'react';
import { Plus, X, Search, Clock, MapPin, Tag } from 'lucide-react';
import API_BASE from '../config';
import CalendarComponent from '../components/CalendarComponent';

export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [formData, setFormData] = useState({
    sujet: '', ref: '', debut_date: '', fin_date: '', 
    location: '', description: '', type: 'default'
  });

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/calendar`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      setEvents(json.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/calendar`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        setFormData({ sujet: '', ref: '', debut_date: '', fin_date: '', location: '', description: '', type: 'default' });
        fetchEvents();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEventSelect = (event) => {
    setSelectedEvent(event);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cet événement ?')) return;
    const token = localStorage.getItem('token');
    try {
      await fetch(`${API_BASE}/calendar/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSelectedEvent(null);
      fetchEvents();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="animate-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2>Calendrier Judiciaire</h2>
          <p>Suivez vos audiences, exécutions et rendez-vous</p>
        </div>
        <button className="btn" onClick={() => setShowModal(true)}>
          <Plus size={18} /> Nouvel Événement
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
        <CalendarComponent events={events} onSelectEvent={handleEventSelect} />

        <div className="glass-panel sidebar-right" style={{ padding: '1.5rem', borderRadius: '20px' }}>
          <h3>Détails</h3>
          {selectedEvent ? (
            <div className="event-details animate-fade">
              <div className={`event-type-badge ${selectedEvent.record_type || 'default'}`}>
                 {selectedEvent.record_type || 'Événement'}
              </div>
              <h4 style={{marginTop:'1rem'}}>{selectedEvent.sujet || selectedEvent.ref}</h4>
              <p style={{fontSize:'0.9rem', marginTop:'0.5rem'}}>{selectedEvent.description}</p>
              
              <div style={{marginTop:'1.5rem', display:'flex', flexDirection:'column', gap:'0.8rem'}}>
                <div style={{display:'flex', gap:'8px', fontSize:'0.85rem', color:'var(--text-muted)'}}>
                  <Clock size={16} /> {selectedEvent.fin_date}
                </div>
                {selectedEvent.location && (
                  <div style={{display:'flex', gap:'8px', fontSize:'0.85rem', color:'var(--text-muted)'}}>
                    <MapPin size={16} /> {selectedEvent.location}
                  </div>
                )}
                {selectedEvent.ref && (
                  <div style={{display:'flex', gap:'8px', fontSize:'0.85rem', color:'var(--text-muted)'}}>
                    <Tag size={16} /> Réf: {selectedEvent.ref}
                  </div>
                )}
              </div>

              <div style={{marginTop:'2rem', borderTop:'1px solid var(--card-border)', paddingTop:'1rem'}}>
                <button className="btn" style={{width:'100%', background:'rgba(239, 68, 68, 0.2)', color:'#ef4444', border:'none'}} 
                  onClick={() => handleDelete(selectedEvent.id_even)}>
                   Supprimer
                </button>
              </div>
            </div>
          ) : (
            <div style={{textAlign:'center', opacity:0.5, marginTop:'4rem'}}>
               <Clock size={40} style={{marginBottom:'1rem'}}/>
               <p>Sélectionnez un jour ou un événement pour voir les détails</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="glass modal-content animate-fade">
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'1.5rem'}}>
              <h3>Nouvel Événement</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={20}/></button>
            </div>
            <form onSubmit={handleSave} className="form-grid">
              <div className="form-group full-width">
                <label>Sujet / Titre</label>
                <input type="text" required value={formData.sujet} onChange={e => setFormData({...formData, sujet: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Référence (Dossier)</label>
                <input type="text" value={formData.ref} onChange={e => setFormData({...formData, ref: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select value={formData.type_r} onChange={e => setFormData({...formData, type_r: e.target.value})}>
                    <option value="default">Général</option>
                    <option value="execution">Exécution</option>
                    <option value="cnss">CNSS</option>
                </select>
              </div>
              <div className="form-group">
                <label>Date Début</label>
                <input type="datetime-local" required value={formData.debut_date} onChange={e => setFormData({...formData, debut_date: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Date Fin (Échéance)</label>
                <input type="datetime-local" required value={formData.fin_date} onChange={e => setFormData({...formData, fin_date: e.target.value})} />
              </div>
              <div className="form-group full-width">
                <label>Lieu / Tribunal</label>
                <input type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
              </div>
              <div className="form-group full-width">
                <label>Description / Notes</label>
                <textarea 
                    className="glass" 
                    rows="3" 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    style={{width:'100%', padding:'1rem', borderRadius:'10px', color:'white', background:'rgba(15,23,42,0.5)', border:'1px solid var(--card-border)'}}
                ></textarea>
              </div>
              <div className="form-group full-width" style={{marginTop:'1rem'}}>
                <button type="submit" className="btn">Enregistrer l'événement</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .sidebar-right { border-left: 1px solid var(--card-border); }
        .event-type-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            background: var(--primary);
        }
        .event-type-badge.execution { background: #f59e0b; }
        .event-type-badge.cnss { background: #8b5cf6; }
      `}</style>
    </div>
  );
}
