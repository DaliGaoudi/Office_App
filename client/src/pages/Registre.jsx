import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

export default function Registre() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecords();
  }, [search]);

  const fetchRecords = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:3001/api/registre?search=${search}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      setData(json.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="animate-fade">
      <div className="search-wrapper">
        <input 
          type="text" 
          placeholder="Rechercher par nom ou de_part..." 
          className="search-input glass"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="btn"><Search size={20} /> Rechercher</button>
      </div>

      <div className="glass table-container">
        {loading ? <p style={{padding:'2rem'}}>Chargement...</p> : (
          <table>
            <thead>
              <tr>
                <th>Réf</th>
                <th>De Part</th>
                <th>Nom Client 1</th>
                <th>Nom Client 2</th>
                <th>Date Ajout</th>
                <th>Nature</th>
              </tr>
            </thead>
            <tbody>
              {data.map(item => (
                <tr key={item.id_r}>
                  <td>{item.ref}</td>
                  <td>{item.de_part}</td>
                  <td>{item.nom_cl1}</td>
                  <td>{item.nom_cl2}</td>
                  <td>{item.date_ajout}</td>
                  <td>{item.remarque}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
