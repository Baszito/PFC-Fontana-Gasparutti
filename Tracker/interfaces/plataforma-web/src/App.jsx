import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './Login.jsx';

function RutaProtegida({ children }) {
  const [estado, setEstado] = useState('cargando');       // cargando | si | no
  useEffect(() => {
    fetch('/api/sesion', { credentials: 'include' })
      .then(r => setEstado(r.ok ? 'si' : 'no'))
      .catch(() => setEstado('no'));
  }, []);
  if (estado === 'cargando') return <p>Cargando...</p>;
  return estado === 'si' ? children : <Navigate to="/login" replace />;
}

// Pantalla provisoria para probar el login
function Inicio() {
  const navigate = useNavigate();
  async function salir() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    navigate('/login');
  }
  return (
    <div>
      <h1>Sesión iniciada</h1>
      <button onClick={salir}>Cerrar sesión</button>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/recomendaciones" element={<RutaProtegida><Inicio /></RutaProtegida>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
