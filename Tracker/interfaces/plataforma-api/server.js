const express = require('express');
const cookieParser = require('cookie-parser');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) throw new Error('Falta JWT_SECRET');

const app = express();
app.set('trust proxy', 1);          // la API está detrás de nginx
app.use(express.json());
app.use(cookieParser());

const client = new MongoClient(process.env.MONGO_URI);
let db;

app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body || {};
  // el chequeo de tipo evita que llegue un objeto tipo {"$ne": ""} a la consulta
  if (typeof usuario !== 'string' || typeof password !== 'string' || !usuario || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const sitio = await db.collection('sitios').findOne({ usuarioAdmin: usuario });
  const ok = sitio && await bcrypt.compare(password, sitio.password);   // "password" guarda el hash
  if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  const token = jwt.sign({ siteId: String(sitio._id) }, process.env.JWT_SECRET, { expiresIn: '2h' });
  res.cookie('sesion', token, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', maxAge: 2 * 60 * 60 * 1000
  });
  res.json({ ok: true, sitio: sitio.nombre });
});

function requerirSesion(req, res, next) {
  try {
    req.siteId = jwt.verify(req.cookies.sesion, process.env.JWT_SECRET).siteId;
    next();
  } catch {
    res.status(401).json({ error: 'Sesión no válida' });
  }
}

app.get('/api/sesion', requerirSesion, (req, res) => res.json({ siteId: req.siteId }));
app.post('/api/logout', (req, res) => { res.clearCookie('sesion'); res.json({ ok: true }); });

async function main() {
  await client.connect();
  db = client.db(process.env.DB_NAME || 'PruebaBBDD');
  app.listen(3001, () => console.log('Plataforma API escuchando en el puerto 3001'));
}
main();