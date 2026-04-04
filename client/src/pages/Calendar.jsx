import { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  User, 
  ChevronLeft, 
  ChevronRight, 
  CalendarDays,
  Plus,
  X,
  Edit2,
  Trash2,
  MapPinned
} from 'lucide-react';
import API_BASE from '../config';

export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    start: '',
    time_even: '',
    description: '',
    tribunal_even: ''
  });

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
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
    setLoading(false);
  };

  const handleOpenModal = (event = null) => {
    if (event) {
      setEditingEvent(event);
      setFormData({
        title: event.title || '',
        start: event.start || '',
        time_even: event.time_even || '',
        description: event.description || '',
        tribunal_even: event.tribunal_even || ''
      });
    } else {
      setEditingEvent(null);
      setFormData({
        title: '',
        start: '',
        time_even: '',
        description: '',
        tribunal_even: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const method = editingEvent ? 'PUT' : 'POST';
    const url = editingEvent ? `${API_BASE}/calendar/${editingEvent.id_even}` : `${API_BASE}/calendar`;

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
        fetchEvents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cet événement ?')) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/calendar/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchEvents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Calendar Logic
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1));
  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1));

  const days = [];
  // Dummy days for previous month padding
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`prev-${i}`} className="calendar-day other-month"></div>);
  }

  // Days of the current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEvents = events.filter(e => e.start === dateStr);
    const isToday = new Date().toDateString() === new Date(currentYear, currentMonth, d).toDateString();

    days.push(
      <div key={d} className={`calendar-day ${isToday ? 'today' : ''}`}>
        <span className="day-number">{d}</span>
        {dayEvents.map(evt => (
          <div 
            key={evt.id_even} 
            className="event-pill" 
            title={evt.title}
            onClick={() => handleOpenModal(evt)}
          >
            {evt.time_even && <span style={{opacity: 0.7, marginRight: '4px'}}>{evt.time_even}</span>}
            {evt.title}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="animate-fade">
      <div className="topbar">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
          <CalendarDays /> Calendrier des audiences
        </h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '0.25rem', borderRadius: '12px' }}>
            <button className="btn-icon" onClick={prevMonth}><ChevronLeft size={18} /></button>
            <span style={{ minWidth: '140px', textAlign: 'center', fontWeight: '600' }}>
              {monthNames[currentMonth]} {currentYear}
            </span>
            <button className="btn-icon" onClick={nextMonth}><ChevronRight size={18} /></button>
          </div>
          <button className="btn" onClick={() => handleOpenModal()}>
            <Plus size={18} /> Nouvel Événement
          </button>
        </div>
      </div>

      <div className="calendar-grid glass">
        {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(day => (
          <div key={day} className="calendar-day-header">{day}</div>
        ))}
        {days}
      </div>

      {loading && <p style={{textAlign: 'center', marginTop: '2rem', color: 'var(--text-muted)'}}>Chargement des événements...</p>}

      {/* Floating Action Button for mobile/quick access */}
      <div className="fab" onClick={() => handleOpenModal()}>
        <Plus size={24} />
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEvent ? 'Modifier l\'événement' : 'Nouvel événement'}</h3>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}><X /></button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div className="form-group">
                <label>Titre de l'audience / RDV</label>
                <input 
                  type="text" 
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})} 
                  placeholder="Ex: Audience Tribunal Civil"
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Date</label>
                  <input 
                    type="date" 
                    value={formData.start} 
                    onChange={e => setFormData({...formData, start: e.target.value})} 
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Heure</label>
                  <input 
                    type="time" 
                    value={formData.time_even} 
                    onChange={e => setFormData({...formData, time_even: e.target.value})} 
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Tribunal / Lieu</label>
                <div style={{ position: 'relative' }}>
                  <MapPinned size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    style={{ paddingLeft: '2.5rem' }}
                    value={formData.tribunal_even} 
                    onChange={e => setFormData({...formData, tribunal_even: e.target.value})} 
                    placeholder="Lieu de l'événement"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes / Description</label>
                <textarea 
                  className="glass"
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', color: 'var(--text-main)', border: '1px solid var(--card-border)', background: 'rgba(15, 23, 42, 0.5)', minHeight: '80px', outline: 'none' }}
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})} 
                  placeholder="Détails supplémentaires..."
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                {editingEvent && (
                  <button type="button" className="btn btn-icon danger" style={{ width: 'auto', padding: '0 1rem' }} onClick={() => handleDelete(editingEvent.id_even)}>
                    <Trash2 size={18} />
                  </button>
                )}
                <button type="submit" className="btn" style={{ flex: 1 }}>
                  {editingEvent ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
