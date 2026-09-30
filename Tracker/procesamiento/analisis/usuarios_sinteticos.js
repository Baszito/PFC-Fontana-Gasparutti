db = db.getSiblingDB("PruebaBBDD");

const siteId = "6ab5e2c8fbc69f0dd7784056";
const ahora = new Date("2026-09-29T12:00:00.000Z");

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function entre(min, max) {
  return min + Math.random() * (max - min);
}

function elegir(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

const ORIGENES = ["directa", "search", "social"];

// --- Arquetipos base ---
// Focalizado: pocas páginas, sesión corta, sabe lo que busca -> convierte rápido cuando convierte.
// Explorador: muchas páginas, sesión larga, navega bastante antes de decidir (o de irse sin convertir).
const ARQUETIPOS = {
  focalizado: {
    paginasPorSesionPromedio: () => Math.round(entre(1, 3)),
    duracionPromedio: () => entre(0.3, 2),
    tasaRebote: () => entre(0, 0.3),
    interaccionesPromedio: () => entre(1, 4),
    probabilidadConversion: 0.5,
    tiempoHastaConversionMs: () => entre(15_000, 120_000),
    frecuenciaRecurrencia: () => entre(0.2, 1.5),
  },
  explorador: {
    paginasPorSesionPromedio: () => Math.round(entre(6, 14)),
    duracionPromedio: () => entre(5, 20),
    tasaRebote: () => entre(0, 0.15),
    interaccionesPromedio: () => entre(8, 18),
    probabilidadConversion: 0.25,
    tiempoHastaConversionMs: () => entre(180_000, 900_000),
    frecuenciaRecurrencia: () => entre(0.1, 0.8),
  },
};

function crearUsuario(n, tipo) {
  const arq = ARQUETIPOS[tipo];
  const userId = uuid();
  const _id = `${siteId}_${userId}`;

  const totalSesiones = Math.max(1, Math.round(entre(1, 15)));
  const diasActivo = Math.max(0, Math.round(entre(0, 30)));
  const convirtio = Math.random() < arq.probabilidadConversion;
  const isMobileConocido = Math.random() > 0.1; // ~10% queda "desconocido" (null), como en el ejemplo real
  const esMobile = Math.random() < 0.4;

  const primeraSesion = new Date(ahora.getTime() - diasActivo * 24 * 60 * 60 * 1000);
  const ultimaSesion = ahora;

  return {
    _id: _id,
    fechaInicio: primeraSesion,
    is_mobile: isMobileConocido ? esMobile : null,
    referrerOriginal: elegir(ORIGENES),
    siteId: siteId,
    totalSesiones: totalSesiones,
    ultimaConexion: ultimaSesion,
    userId: userId,
    metricas: {
      totalSesiones: totalSesiones,
      duracionPromedio: Number(arq.duracionPromedio().toFixed(4)),
      tasaRebote: Number(arq.tasaRebote().toFixed(4)),
      paginasPorSesionPromedio: arq.paginasPorSesionPromedio(),
      tasaConversion: convirtio ? Number(entre(0.1, 0.6).toFixed(4)) : 0,
      usuarioMobile: esMobile,
      primeraSesion: primeraSesion,
      ultimaSesion: ultimaSesion,
      diasActivo: diasActivo,
      frecuenciaRecurrencia: Number(arq.frecuenciaRecurrencia().toFixed(4)),
      tasaAbandonoCarrito: Number(entre(0, 0.4).toFixed(4)),
      origenPredominante: elegir(ORIGENES),
      interaccionesPromedio: Number(arq.interaccionesPromedio().toFixed(2)),
      tiempoHastaConversion: convirtio ? Math.round(arq.tiempoHastaConversionMs()) : null,
    },
  };
}

const cantidadPorTipo = 15; // ajustar según cuántos usuarios de cada tipo se necesiten

const usuarios = [];
for (let i = 0; i < cantidadPorTipo; i++) usuarios.push(crearUsuario(i, "focalizado"));
for (let i = 0; i < cantidadPorTipo; i++) usuarios.push(crearUsuario(i, "explorador"));

db.usuarios.deleteMany({ siteId: siteId, userId: { $regex: /-4[0-9a-f]{3}-/ } });
const resultado = db.usuarios.insertMany(usuarios);
print("Usuarios sintéticos insertados: " + Object.keys(resultado.insertedIds).length);