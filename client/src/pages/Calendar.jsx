import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, MapPin, User, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import API_BASE from '../config';

export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="animate-fade">
      <div className="search-wrapper">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
          <CalendarDays /> Événements du mois
        </h2>
      </div>

      <div className="glass table-container">
        {loading ? <p style={{padding:'2rem'}}>Chargement...</p> : (
          <table>
            <thead>
              <tr>
                <th>Titre</th>
                <th>Date Début</th>
                <th>Heure</th>
                <th>Description</th>
                <th>Tribunal</th>
              </tr>
            </thead>
            <tbody>
              {events.map((evt) => (
                <tr key={evt.id_even}>
                  <td>{evt.title}</td>
                  <td>{evt.start}</td>
                  <td>{evt.time_even}</td>
                  <td>{evt.description}</td>
                  <td>{evt.tribunal_even}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan="5">Aucun événement trouvé</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
