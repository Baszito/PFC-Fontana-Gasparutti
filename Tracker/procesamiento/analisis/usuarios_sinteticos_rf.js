db = db.getSiblingDB("PruebaBBDD");

const siteId = "site-sint-rf";
const ahora = new Date("2026-09-29T12:00:00.000Z");

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function entre(min, max) { return min + Math.random() * (max - min); }
function elegir(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

const ORIGENES = ["directa", "search", "social"];

const ARQUETIPOS = {
  focalizado: {
    paginasPorSesionPromedio: () => Math.round(entre(1, 3)),
    duracionPromedio: () => entre(0.3, 2),
    tasaRebote: () => entre(0, 0.3),
    interaccionesPromedio: () => entre(1, 4),
    probabilidadConversion: 0.45,
    tiempoHastaConversionMs: () => entre(15000, 120000),
    frecuenciaRecurrencia: () => entre(0.2, 1.5),
  },
  explorador: {
    paginasPorSesionPromedio: () => Math.round(entre(6, 14)),
    duracionPromedio: () => entre(5, 20),
    tasaRebote: () => entre(0, 0.15),
    interaccionesPromedio: () => entre(8, 18),
    probabilidadConversion: 0.15,
    tiempoHastaConversionMs: () => entre(180000, 900000),
    frecuenciaRecurrencia: () => entre(0.1, 0.8),
  },
};

function crearUsuario(tipo) {
  const arq = ARQUETIPOS[tipo];
  const userId = uuid();
  const _id = `${siteId}_${userId}`;

  // totalSesiones se decide ACÁ, y el script de sesiones va a generar
  // exactamente esta cantidad real de sesiones para este usuario.
  const totalSesiones = Math.max(1, Math.round(entre(1, 6)));
  const diasActivo = Math.max(0, Math.round(entre(0, 30)));
  const convirtio = Math.random() < arq.probabilidadConversion;
  const esMobile = Math.random() < 0.4;

  const primeraSesion = new Date(ahora.getTime() - diasActivo * 24 * 60 * 60 * 1000);

  return {
    _id,
    fechaInicio: primeraSesion,
    is_mobile: esMobile,
    referrerOriginal: elegir(ORIGENES),
    siteId,
    totalSesiones,
    ultimaConexion: ahora,
    userId,
    arquetipo: tipo, // usado por sesiones_sinteticas_rf.js para generar el comportamiento
    metricas: {
      totalSesiones,
      duracionPromedio: Number(arq.duracionPromedio().toFixed(4)),
      tasaRebote: Number(arq.tasaRebote().toFixed(4)),
      paginasPorSesionPromedio: arq.paginasPorSesionPromedio(),
      tasaConversion: convirtio ? Number(entre(0.1, 0.6).toFixed(4)) : 0,
      usuarioMobile: esMobile,
      primeraSesion,
      ultimaSesion: ahora,
      diasActivo,
      frecuenciaRecurrencia: Number(arq.frecuenciaRecurrencia().toFixed(4)),
      tasaAbandonoCarrito: Number(entre(0, 0.4).toFixed(4)),
      origenPredominante: elegir(ORIGENES),
      interaccionesPromedio: Number(arq.interaccionesPromedio().toFixed(2)),
      tiempoHastaConversion: convirtio ? Math.round(arq.tiempoHastaConversionMs()) : null,
    },
  };
}

const cantidadPorTipo = 75; // -> ~150 usuarios, ~400-500 sesiones en total

const usuarios = [];
for (let i = 0; i < cantidadPorTipo; i++) usuarios.push(crearUsuario("focalizado"));
for (let i = 0; i < cantidadPorTipo; i++) usuarios.push(crearUsuario("explorador"));

db.usuarios.deleteMany({ siteId });
const resultado = db.usuarios.insertMany(usuarios);
print("Usuarios sintéticos (RF) insertados: " + Object.keys(resultado.insertedIds).length);