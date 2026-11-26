import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
    </Routes>
  );
}
