import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

export default function Telephone() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchTelephone();
  }, [search]);

  const fetchTelephone = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:3001/api/telephone?search=${search}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      setData(json.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="animate-fade">
      <div className="search-wrapper">
        <input 
          type="text" 
          placeholder="Rechercher un contact..." 
          className="search-input glass"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="btn"><Search size={20} /> Rechercher</button>
      </div>

      <div className="glass table-container">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Prénom</th>
                <th>Qualité</th>
                <th>Téléphone 1</th>
                <th>Téléphone 2</th>
              </tr>
            </thead>
            <tbody>
              {data.map(item => (
                <tr key={item.id_tel}>
                  <td>{item.nom}</td>
                  <td>{item.prenom}</td>
                  <td>{item.qualite}</td>
                  <td>{item.num_tel1}</td>
                  <td>{item.num_tel2}</td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan="5">Aucun contact trouvé</td></tr>}
            </tbody>
          </table>
      </div>
    </div>
  );
}
