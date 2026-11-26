import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function enviar(e) {
    e.preventDefault();
    setError('');
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ usuario, password })
    });
    if (r.ok) navigate('/recomendaciones');
    else setError((await r.json()).error || 'No se pudo iniciar sesión');
  }

  return (
    <form onSubmit={enviar}>
      <input value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="Usuario" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" />
      <button type="submit">Ingresar</button>
      {error && <p>{error}</p>}
    </form>
  );
}