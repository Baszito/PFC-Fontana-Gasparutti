/*------------------------ ---------------------------
-------------------------- Seed de Atracción ---------
-------------------------- -------------------------*/
// Siembra en la base los datos CRUDOS (metricas_resumen, sesiones, usuarios) de un sitio sano y de
// una variante por cada regla de Atracción (ATR-01 a ATR-08).
// Después se corre recomendaciones.js (leerContextos arma el contexto a partir de estos datos) y se
// compara con lo que este script imprime como "ESPERADO".
//
// Solo hay datos de Atracción: el sitio no tiene páginas, formularios, carrito ni análisis, así que
// las demás reglas no se disparan. Excepción: KM-05 (calidad de datos) aparece en los sitios con 20
// usuarios o más, porque no hay un análisis de clusters cargado.
//
// Todos los sitios empiezan con "TEST_ATR_": el script borra solo lo que tenga ese prefijo.
//   node seed_atraccion.js            -> borra lo anterior y siembra
//   node seed_atraccion.js limpiar    -> solo borra
//   node seed_atraccion.js seco       -> no toca la base: imprime cuántos documentos generaría
// Conexión: MONGO_URI (por defecto mongodb://mongo:27017), base PruebaBBDD.

const uri = process.env.MONGO_URI || "mongodb://mongo:27017";

const PREFIJO = "TEST_ATR_";
const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;
const ahora = new Date();
const hace = (ms) => new Date(ahora.getTime() - ms);

// Línea de tiempo: cada snapshot cubre el tramo desde el anterior hasta él
//   período anterior = (T_A, T_B]     período actual = (T_B, T_C]
const T_A = hace(60 * DIA);
const T_B = hace(30 * DIA);
const T_C = hace(5 * MIN);
const EN_ACTUAL = hace(10 * DIA);      // las sesiones y los usuarios caen dentro del período actual

const docs = { sitios: [], metricas_resumen: [], sesiones: [], usuarios: [] };
let contador = 0;
const url = (ruta) => `https://tienda.com${ruta}`;


/*------------------------ ---------------------------
-------------------------- Generadores ---------------
-------------------------- -------------------------*/
// Reparte n elementos entre categorías según su fracción; la última se queda con el resto
// (así la suma da siempre n). partes: [[valor, fraccion], ...]
function repartir(n, partes) {
  const lista = [];
  partes.forEach(([valor, fraccion], i) => {
    const cantidad = i === partes.length - 1 ? n - lista.length : Math.round(n * fraccion);
    for (let k = 0; k < cantidad; k++) lista.push(valor);
  });
  return lista;
}

// Métricas de un snapshot (los campos que lee leerContextos); iguales a las de contextoBase.js
const metricas = (totalSesiones, usuariosNuevos, totalUsuarios, usuariosRecurrentes) => ({
  totalSesiones, usuariosNuevos, usuariosRecurrentes, totalUsuarios,
  tasaRebote: 0.40, tasaConversion: 0.04, paginasPorSesionPromedio: 3.5,
  duracionSesionPromedio: 3, tiempoConversionPromedio: 120
});

function snapshot(siteId, fechaCalculo, valores) {
  docs.metricas_resumen.push({ siteId, fechaCalculo, ...valores, metricas_paginas: [], metricas_formularios: [] });
}

// Una sesión cerrada y revisada dentro del período actual
function sesion(siteId, { entrada, salida, pais, movil }) {
  const n = ++contador;
  const revisado = EN_ACTUAL;
  const inicio = new Date(revisado.getTime() - 20 * MIN);
  const Fin = new Date(revisado.getTime() - 1 * MIN);
  docs.sesiones.push({
    siteId, userId: `u${n}`, sessionId: `${siteId}_s${n}`,
    inicio, Fin, revisado,
    referrer: "directo",
    rutas: [{ pagina: url(entrada), timestamp: inicio }, { pagina: url(salida), timestamp: Fin }],
    paginaInicio: url(entrada), paginaAbandono: url(salida),
    duracionSesion: 5, esRebote: false, eventosClave: [],
    is_mobile: movil, geo: { pais }
  });
}

// Un usuario activo en el período actual (última sesión dentro del período)
function usuario(siteId, userId, totalSesiones, origen) {
  const recurrente = totalSesiones > 1;
  docs.usuarios.push({
    _id: `${siteId}_${userId}`, siteId, userId, totalSesiones, fechaInicio: hace(50 * DIA),
    metricas: {
      totalSesiones, duracionPromedio: 3, tasaRebote: 0.4, paginasPorSesionPromedio: 3.5,
      tasaConversion: recurrente ? 0.05 : 0.04,
      primeraSesion: hace(50 * DIA), ultimaSesion: EN_ACTUAL,
      diasActivo: 4, frecuenciaRecurrencia: recurrente ? 0.5 : 0,
      tasaAbandonoCarrito: 0, origenPredominante: origen, interaccionesPromedio: 5, tiempoHastaConversion: null
    }
  });
}

// Un sitio completo. Opciones (por defecto, el sitio sano):
//   sesiones, usuarios         cantidad de sesiones y de usuarios activos del período actual
//   nuevosActual               usuarios nuevos del snapshot actual
//   sinAnterior                true -> un solo snapshot (el sitio no tiene período anterior)
//   sesionesAnterior           sesiones del snapshot anterior
//   fEntrada, fPais, fMovil, fOrigen   fracción de la categoría más frecuente
function sitio(nombre, o = {}) {
  const {
    sesiones = 600, usuarios = 500, nuevosActual = 400, sinAnterior = false, sesionesAnterior = 600,
    fEntrada = 0.40, fPais = 2 / 3, fMovil = 0.55, fOrigen = 0.50
  } = o;
  const siteId = PREFIJO + nombre;
  docs.sitios.push({ _id: siteId });

  const totalUsuarios = usuarios, recurrentes = Math.round(usuarios * 0.3);
  if (!sinAnterior) {
    snapshot(siteId, T_A, { totalSesiones: 50, usuariosNuevos: 40, usuariosRecurrentes: 2, totalUsuarios: 42 });
    snapshot(siteId, T_B, metricas(sesionesAnterior, 400, 600, 180));
  }
  snapshot(siteId, T_C, metricas(sesiones, nuevosActual, totalUsuarios, recurrentes));

  // Sesiones del período actual: cada atributo se reparte por separado
  const entradas = repartir(sesiones, [["/home", fEntrada], ["/producto", (1 - fEntrada) / 2], ["/contacto", 0]]);
  const paises = repartir(sesiones, [["AR", fPais], ["UY", (1 - fPais) / 2], ["CL", 0]]);
  const moviles = repartir(sesiones, [[true, fMovil], [false, 0]]);
  const salidas = repartir(sesiones, [["/home", 0.25], ["/producto", 0.25], ["/contacto", 0.25], ["/blog", 0]]);   // ninguna supera 30 %
  for (let i = 0; i < sesiones; i++) {
    sesion(siteId, { entrada: entradas[i], salida: salidas[i], pais: paises[i], movil: moviles[i] });
  }

  // Usuarios activos: 30 % recurrentes (2 sesiones) y el resto nuevos (1 sesión)
  const origenes = repartir(usuarios, [["google", fOrigen], ["directo", (1 - fOrigen) * 0.6], ["instagram", 0]]);
  for (let i = 0; i < usuarios; i++) usuario(siteId, `u${i + 1}`, i < recurrentes ? 2 : 1, origenes[i]);

  return siteId;
}

function titulo(siteId, descripcion, esperado) {
  console.log(`\n=== ${siteId} ===`);
  console.log(descripcion);
  console.log("ESPERADO:");
  for (const linea of esperado) console.log("  - " + linea);
}

const KM05 = "calidad KM-05 (no hay análisis de clusters cargado): es esperable en este sitio";


/*------------------------ ---------------------------
-------------------------- Situaciones ---------------
-------------------------- -------------------------*/
function generar() {
  titulo(sitio("BASE"), "Sitio sano: 600 sesiones, igual al período anterior, nada concentrado.",
    ["ninguna recomendación", KM05]);

  titulo(sitio("01", { nuevosActual: 200 }), "Usuarios nuevos: 400 -> 200.",
    ["ATR-01: 50% menos, severidad 1, alcance 1, puntaje 7.0 Alta", KM05]);

  titulo(sitio("02", { sesiones: 400 }), "Sesiones: 600 -> 400.",
    ["ATR-02: 33% menos, severidad 0.667, alcance 1, puntaje 5.0 Media", KM05]);

  titulo(sitio("03", { sesiones: 20, usuarios: 15, sinAnterior: true }), "20 sesiones y un solo snapshot (sin período anterior).",
    ["calidad ATR-03: 'muy pocas visitas (20)'", "sin ATR-01 ni ATR-02 (no hay período anterior)", "sin KM-05 (menos de 20 usuarios)"]);

  titulo(sitio("04", { fEntrada: 0.75 }), "/home es la página de ingreso del 75 % de las sesiones (450 de 600).",
    ["ATR-04: 75%, /home, severidad 0.375, alcance 0.75, puntaje 2.7 Baja", KM05]);

  titulo(sitio("05", { fPais: 0.90 }), "AR concentra el 90 % de las sesiones (540 de 600).",
    ["ATR-05: 90%, AR, severidad 0.5, alcance 0.9, puntaje 2.3 Baja", KM05]);

  titulo(sitio("06", { fMovil: 0.70 }), "70 % de las sesiones desde celular (420 de 600).",
    ["ATR-06: 70%, severidad 0.25, alcance 0.7, puntaje 1.5 Baja", KM05]);

  titulo(sitio("07", { fMovil: 0.30 }), "70 % de las sesiones desde computadora (420 de 600).",
    ["ATR-07: 70%, severidad 0.25, alcance 0.7, puntaje 1.5 Baja", KM05]);

  titulo(sitio("08", { fOrigen: 0.80 }), "'google' es el origen predominante del 80 % de los usuarios (400 de 500).",
    ["ATR-08: 80%, google, severidad 0.333, alcance 0.8, puntaje 1.8 Baja", KM05]);
}


/*------------------------ ---------------------------
-------------------------- Ejecución -----------------
-------------------------- -------------------------*/
const COLECCIONES = [
  ["sitios", "_id"], ["metricas_resumen", "siteId"], ["sesiones", "siteId"], ["usuarios", "siteId"]
];

async function main() {
  const modo = process.argv[2];
  if (modo === "seco") {
    generar();
    console.log("\nDocumentos que se insertarían:", Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, v.length])));
    return;
  }

  const mongo = require("mongodb");           // recién acá, para que el modo "seco" no lo necesite
  const client = new mongo.MongoClient(uri);
  await client.connect();
  const db = client.db("PruebaBBDD");
  try {
    const prefijo = new RegExp("^" + PREFIJO);
    for (const [coleccion, campo] of COLECCIONES) {
      const r = await db.collection(coleccion).deleteMany({ [campo]: prefijo });
      console.log(`Borrados ${r.deletedCount} documentos de ${coleccion}`);
    }
    if (modo === "limpiar") return;

    generar();
    for (const [coleccion] of COLECCIONES) {
      if (docs[coleccion].length > 0) await db.collection(coleccion).insertMany(docs[coleccion]);
    }
    console.log("\nInsertados:", Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, v.length])));
    console.log("Ahora corré recomendaciones.js y mirá la colección 'recomendaciones' (siteId que empiece con TEST_ATR_).");
  } finally {
    await client.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });