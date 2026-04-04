import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin } from 'lucide-react';

export default function CalendarComponent({ events = [], mini = false, onSelectEvent }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const startDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(currentDate);

  const days = [];
  const startDay = startDayOfMonth(year, month);
  const totalDays = daysInMonth(year, month);

  // Padding for start of month
  for (let i = 0; i < startDay; i++) {
    days.push(<div key={`pad-${i}`} className="calendar-day padding"></div>);
  }

  // Days of month
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEvents = events.filter(e => e.fin_date.startsWith(dateStr));
    const isToday = new Date().toISOString().startsWith(dateStr);

    days.push(
      <div key={d} className={`calendar-day ${isToday ? 'today' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}`}>
        <span className="day-number">{d}</span>
        {!mini && (
          <div className="day-events-list">
            {dayEvents.map((e, idx) => (
              <div 
                key={idx} 
                className={`event-tag ${e.record_type || 'default'}`}
                onClick={() => onSelectEvent && onSelectEvent(e)}
              >
                {e.sujet || e.ref}
              </div>
            ))}
          </div>
        )}
        {mini && dayEvents.length > 0 && <div className="mini-event-dot"></div>}
      </div>
    );
  }

  return (
    <div className={`calendar-wrapper glass-panel ${mini ? 'mini' : 'full'}`}>
      <div className="calendar-header">
        <h3 className="capitalize">
          {mini ? <CalendarIcon size={16} /> : <CalendarIcon size={20} />} 
          {monthName} {year}
        </h3>
        <div className="calendar-nav">
          <button onClick={prevMonth} className="nav-btn"><ChevronLeft size={mini ? 16 : 20} /></button>
          <button onClick={nextMonth} className="nav-btn"><ChevronRight size={mini ? 16 : 20} /></button>
        </div>
      </div>

      <div className="calendar-grid">
        {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(d => (
          <div key={d} className="calendar-weekday">{d}</div>
        ))}
        {days}
      </div>
      
      {mini && events.length > 0 && (
        <div className="mini-events-preview">
          <p className="section-subtitle">Événements du mois</p>
          {events.slice(0, 3).map((e, idx) => (
            <div key={idx} className="preview-item">
               <div className={`dot ${e.record_type || 'default'}`}></div>
               <div className="preview-info">
                  <span className="subject">{e.sujet || 'Sans sujet'}</span>
                  <span className="date">{e.fin_date}</span>
               </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
