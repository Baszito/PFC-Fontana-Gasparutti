db = db.getSiblingDB("PruebaBBDD");

const base = "http://localhost:3000";
const PAG = ["/", "/listado.html", "/p1.html", "/p2.html", "/p3.html", "/p4.html", "/p5.html", "/p6.html", "/p7.html", "/carrito.html"].map(p => base + p);

let contadorSesion = 0;
let sesiones = [];
let eventos = [];
let usuarios = [];

function nuevaSesion({ siteId, cantidadPaginas, duracionMin, convierte, isMobile = false, referrer = "directa", userId = null, rageClick = false }) {
  contadorSesion++;
  const sessionId = "rf-" + String(contadorSesion).padStart(4, "0");
  const uid = userId || "u-rf-" + contadorSesion;
  const inicio = new Date(Date.UTC(2026, 9, 1, 3, 0, 0) + contadorSesion * 10 * 60 * 1000);

  const pasos = [];
  for (let i = 0; i < cantidadPaginas; i++) pasos.push(PAG[i % PAG.length]);
  const pasoMs = Math.max(1000, (duracionMin * 60 * 1000) / Math.max(1, cantidadPaginas));
  const rutas = pasos.map((pagina, j) => ({ pagina, timestamp: new Date(inicio.getTime() + j * pasoMs) }));

  const fin = new Date(inicio.getTime() + duracionMin * 60 * 1000);
  const eventosClave = convierte ? [{ tipo: "objetivo", subtipo: "compra", timestamp: fin }] : [];

  sesiones.push({
    sessionId, siteId, userId: uid, inicio, Fin: fin,
    revisado: new Date(fin.getTime() + 60000),
    is_mobile: isMobile, referrer,
    geo: { pais: "Argentina", provincia: "Santa Fe", ciudad: "Santa Fe" },
    rutas, eventosClave,
    paginaInicio: rutas[0]?.pagina || null,
    paginaAbandono: rutas[rutas.length - 1]?.pagina || null,
    duracionSesion: duracionMin,
    esRebote: eventosClave.length === 0 // && rutas.length <= 1
  });

  if (rageClick && rutas.length > 0) {
    const t0 = rutas[0].timestamp.getTime();
    for (let r = 0; r < 4; r++) {
      eventos.push({
        timestamp: new Date(t0 + r * 400),
        revisado: new Date(t0 + 60000),
        metadata: { siteId, sessionId, tipo: "click", pagina: rutas[0].pagina, elemento: "boton_x", esInteractivo: true }
      });
    }
  }

  return sessionId;
}

// --- RF-1: dataset vacío para "abandono_carrito" (nunca hay añadir_carrito) ---
// for (let i = 0; i < 20; i++) {
//   nuevaSesion({ siteId: "site-rf-sincarrito", cantidadPaginas: 3, duracionMin: 5, convierte: i % 4 === 0 });
// }

// --- RF-2: relación lineal controlada (duracionSesion) ---
// Convierte SIEMPRE que duracionMin > 40, nunca antes -> relación monótona perfecta
// for (let i = 0; i < 40; i++) {
//   const duracionMin = i * 2; // 0, 2, 4 ... 78
//   nuevaSesion({ siteId: "site-rf-lineal", cantidadPaginas: 3, duracionMin, convierte: duracionMin > 40 });
// }

// --- RF-3: relación en forma de U (cantidadPaginas) ---
// Convierte SOLO si cantidadPaginas está entre 4 y 6 (ambos inclusive)
// for (let i = 0; i < 40; i++) {
//   const cantidadPaginas = 1 + (i % 10); // 1..10
//   nuevaSesion({ siteId: "site-rf-u", cantidadPaginas, duracionMin: 10, convierte: cantidadPaginas >= 4 && cantidadPaginas <= 6 });
// }

// --- RF-4: feature constante (is_mobile siempre true) ---
// for (let i = 0; i < 30; i++) {
//   nuevaSesion({ siteId: "site-rf-constante", cantidadPaginas: 2 + (i % 5), duracionMin: 5 + i, convierte: i % 3 === 0, isMobile: true });
// }

// --- RF-5: target muy desbalanceado (95 / 5) ---
function randEntre(min, max) { return min + Math.random() * (max - min); }

for (let i = 0; i < 95; i++) {
  nuevaSesion({
    siteId: "site-rf-desbalanceado",
    cantidadPaginas: Math.round(randEntre(1, 6)),
    duracionMin: randEntre(3, 25),
    convierte: false
  });
}
for (let i = 0; i < 5; i++) {
  nuevaSesion({
    siteId: "site-rf-desbalanceado",
    cantidadPaginas: Math.round(randEntre(1, 6)),
    duracionMin: randEntre(3, 25),
    convierte: true
  });
}

// --- RF-6: muy pocos registros (debería fallar train_test_split por stratify) ---
// for (let i = 0; i < 5; i++) {
//   nuevaSesion({ siteId: "site-rf-pocos", cantidadPaginas: 2, duracionMin: 5, convierte: false });
// }
// nuevaSesion({ siteId: "site-rf-pocos", cantidadPaginas: 5, duracionMin: 30, convierte: true });

// --- RF-7: separación perfecta (control de "leakage funcional") ---
// duracionSesion queda PERFECTAMENTE separada según el target: no hay solapamiento posible
// for (let i = 0; i < 20; i++) {
//   nuevaSesion({ siteId: "site-rf-leakage", cantidadPaginas: 3, duracionMin: 999, convierte: true });
// }
// for (let i = 0; i < 20; i++) {
//   nuevaSesion({ siteId: "site-rf-leakage", cantidadPaginas: 3, duracionMin: 1, convierte: false });
// }

// --- RF-8: aislamiento entre sitios (rage click con efecto opuesto) ---
// site A: rage click siempre presente en sesiones que NO convierten
// for (let i = 0; i < 20; i++) {
//   const tieneRage = i % 2 === 0;
//   nuevaSesion({ siteId: "site-rf-isoA", cantidadPaginas: 3, duracionMin: 10, convierte: !tieneRage, rageClick: tieneRage });
// }
// site B: rage click sin relación con la conversión (independiente)
// for (let i = 0; i < 20; i++) {
//   const tieneRage = i % 2 === 0;
//   const convierte = i % 3 === 0; // independiente del rage click
//   nuevaSesion({ siteId: "site-rf-isoB", cantidadPaginas: 3, duracionMin: 10, convierte, rageClick: tieneRage });
// }

// --- RF-9: columna categórica con varias categorías (referrer) ---
// const REFERRERS = ["google", "facebook", "instagram", "linkedin", "directo", "email", "tiktok"];
// for (let i = 0; i < 35; i++) {
//   nuevaSesion({ siteId: "site-rf-referrer", cantidadPaginas: 3, duracionMin: 8, convierte: i % 3 === 0, referrer: REFERRERS[i % REFERRERS.length] });
// }

// --- Usuarios para "recurrencia_usuario" (RF-6 u otros también los necesitan si se corre ese modelo) ---
// Reutilizamos site-rf-lineal: la mitad de los usuarios tiene 1 sola sesión (nuevo),
// la otra mitad simula 3 sesiones (recurrente) -> ya existen en "sesiones" como users distintos,
// pero para que el merge encuentre coincidencia real, generamos la colección "usuarios" acá:
const usuariosDeSesiones = {};
sesiones.filter(s => s.siteId === "site-rf-lineal").forEach(s => {
  usuariosDeSesiones[s.userId] = usuariosDeSesiones[s.userId] || { primeraSesion: s.inicio, cantidad: 0 };
  usuariosDeSesiones[s.userId].cantidad++;
});
Object.entries(usuariosDeSesiones).forEach(([userId, info], idx) => {
  const totalSesiones = idx % 2 === 0 ? 1 : 3; // alterna nuevos/recurrentes
  usuarios.push({
    _id: `site-rf-lineal_${userId}`,
    siteId: "site-rf-lineal",
    userId,
    totalSesiones,
    fechaInicio: info.primeraSesion,
    ultimaConexion: info.primeraSesion,
    is_mobile: false,
    referrerOriginal: "directa"
  });
});

db.sesiones.deleteMany({ sessionId: /^rf-/ });
db.eventos.deleteMany({ "metadata.sessionId": /^rf-/ });
db.usuarios.deleteMany({ siteId: "site-rf-lineal" });

const r1 = db.sesiones.insertMany(sesiones);
const r2 = eventos.length ? db.eventos.insertMany(eventos) : { insertedIds: {} };
const r3 = usuarios.length ? db.usuarios.insertMany(usuarios) : { insertedIds: {} };

print("Sesiones (RF pruebas): " + Object.keys(r1.insertedIds).length);
print("Eventos (RF pruebas): " + Object.keys(r2.insertedIds).length);
print("Usuarios (RF pruebas): " + Object.keys(r3.insertedIds).length);