/*------------------------ ---------------------------
-------------------------- Seed para leerContextos ---
-------------------------- -------------------------*/
// Solo GENERA datos de prueba (no ejecuta leerContextos). Después corrés leerContextos a mano y
// comparás con lo que este script imprime como "ESPERADO".
//
// Todos los sitios de prueba empiezan con "TEST_LC_": el script borra solo lo que tenga ese
// prefijo antes de insertar, así que no toca datos reales.
//   node seed_leerContextos.js            -> borra lo anterior y siembra
//   node seed_leerContextos.js limpiar    -> solo borra
// Conexión: MONGO_URI (por defecto mongodb://mongo:27017), base PruebaBBDD.

const mongo = require("mongodb");
const uri = process.env.MONGO_URI || "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);

const PREFIJO = "TEST_LC_";
const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;
const ahora = new Date();
const hace = (ms) => new Date(ahora.getTime() - ms);

// ---- Línea de tiempo común a todos los sitios
// Cada snapshot cubre el tramo desde el anterior hasta él:
//   período anterior = (T_A, T_B]     período actual = (T_B, T_C]
const T_A = hace(60 * DIA);
const T_B = hace(30 * DIA);
const T_C = hace(5 * MIN);
// Fechas de "revisado" de los datos crudos, según el período al que pertenecen
const EN_ACTUAL = hace(10 * DIA);
const EN_ANTERIOR = hace(40 * DIA);
const EN_SIGUIENTE = hace(1 * MIN);      // revisado DESPUÉS del último snapshot: no debe contarse

const docs = { sitios: [], metricas_resumen: [], sesiones: [], eventos: [], formularios: [], usuarios: [] };
let contador = 0;
const url = (ruta) => `https://tienda.com${ruta}`;


/*------------------------ ---------------------------
-------------------------- Generadores ---------------
-------------------------- -------------------------*/
function sitio(siteId) {
  docs.sitios.push({ _id: siteId });
}

// Un documento de metricas_resumen (los campos que lee leerContextos más los de relleno)
function snapshot(siteId, fechaCalculo, fechaDesde, valores = {}, metricas_paginas = [], metricas_formularios = []) {
  docs.metricas_resumen.push({
    siteId, fechaCalculo, fechaDesde,
    totalSesiones: 0, usuariosNuevos: 0, usuariosRecurrentes: 0, totalUsuarios: 0,
    tasaRebote: null, tasaConversion: null, paginasPorSesionPromedio: null,
    duracionSesionPromedio: null, tiempoConversionPromedio: null,
    ...valores,
    metricas_paginas, metricas_formularios
  });
}

// Una sesión cerrada. o: { revisado, entrada, salida, movil, pais, eventos, userId }
// Si movil o pais no se indican, el campo no existe en el documento.
// Por cada evento clave se genera también el evento "objetivo" en la colección eventos.
function sesion(siteId, o) {
  const n = ++contador;
  const eventos = o.eventos || [];
  const sessionId = `${siteId}_s${n}`;
  const inicio = new Date(o.revisado.getTime() - 20 * MIN);
  const Fin = new Date(o.revisado.getTime() - 1 * MIN);
  const s = {
    siteId, userId: o.userId || `u${n}`, sessionId,
    inicio, Fin, revisado: o.revisado,
    referrer: "directo",
    rutas: [{ pagina: url(o.entrada), timestamp: inicio }, { pagina: url(o.salida), timestamp: Fin }],
    paginaInicio: url(o.entrada), paginaAbandono: url(o.salida),
    duracionSesion: 5, esRebote: eventos.length === 0,
    eventosClave: eventos.map(subtipo => ({ tipo: "objetivo", subtipo, timestamp: Fin }))
  };
  if (o.movil !== undefined) s.is_mobile = o.movil;
  if (o.pais !== undefined) s.geo = { pais: o.pais };
  docs.sesiones.push(s);
  for (const subtipo of eventos) {
    docs.eventos.push({
      timestamp: Fin,
      metadata: { siteId, sessionId, tipo: "objetivo", subtipo, pagina: url(o.salida) },
      revisado: o.revisado
    });
  }
}

function formulario(siteId, formId, completado, ultimoCampo, revisado) {
  const n = ++contador;
  const f = {
    siteId, userId: `f${n}`, sessionId: `${siteId}_f${n}`,
    Inicio: new Date(revisado.getTime() - 10 * MIN), Fin: new Date(revisado.getTime() - 5 * MIN),
    id_formulario: formId, completado, camposInteractuados: [], revisado
  };
  if (ultimoCampo) f.ultimoCampoCompleto = ultimoCampo;
  docs.formularios.push(f);
}

// u: [userId, totalSesiones, origen, interaccionesPromedio, diasActivo, frecuenciaRecurrencia, tasaConversion]
function usuario(siteId, u, ultimaSesion) {
  const [userId, totalSesiones, origen, interacciones, dias, frecuencia, conversion] = u;
  docs.usuarios.push({
    _id: `${siteId}_${userId}`, siteId, userId, totalSesiones, fechaInicio: hace(50 * DIA),
    metricas: {
      totalSesiones, duracionPromedio: 4, tasaRebote: 0, paginasPorSesionPromedio: 3, tasaConversion: conversion,
      primeraSesion: hace(50 * DIA), ultimaSesion, diasActivo: dias, frecuenciaRecurrencia: frecuencia,
      tasaAbandonoCarrito: 0, origenPredominante: origen, interaccionesPromedio: interacciones, tiempoHastaConversion: null
    }
  });
}

function titulo(nombre, descripcion, esperado) {
  console.log(`\n=== ${nombre} ===`);
  console.log(descripcion);
  console.log("ESPERADO:");
  for (const linea of esperado) console.log("  - " + linea);
}
const prom = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;


/*------------------------ ---------------------------
-------------------------- Situaciones ---------------
-------------------------- -------------------------*/

// 1) Sitio completo: todas las secciones con datos, más datos "trampa" fuera del período
function completo() {
  const id = PREFIJO + "COMPLETO";
  sitio(id);

  snapshot(id, T_A, null, { totalSesiones: 50, usuariosNuevos: 40, usuariosRecurrentes: 2, totalUsuarios: 42 });
  snapshot(id, T_B, T_A, {
    totalSesiones: 100, usuariosNuevos: 60, usuariosRecurrentes: 10, totalUsuarios: 70,
    tasaRebote: 0.5, tasaConversion: 0.1, paginasPorSesionPromedio: 2.5, duracionSesionPromedio: 3, tiempoConversionPromedio: 200
  }, [{ pagina: url("/viejo"), pageviews: 99, clicksMuertos: 9, rageClicks: 9, scrollDepthPromedio: 10, tiempoPromedioPagina: 10, elementos: [] }],
     [{ formId: "form-viejo", tasaAbandono: 0.9, campoAbandonoMasComun: "x", tiempoPromedioCompletado: 10 }]);
  snapshot(id, T_C, T_B, {
    totalSesiones: 10, usuariosNuevos: 7, usuariosRecurrentes: 3, totalUsuarios: 11,
    tasaRebote: 0.4, tasaConversion: 0.6, paginasPorSesionPromedio: 3.2, duracionSesionPromedio: 4.5, tiempoConversionPromedio: 120
  }, [
    // /home y /Home/ son la misma página: deben fusionarse
    { pagina: url("/home"), pageviews: 6, clicksMuertos: 2, rageClicks: 1, scrollDepthPromedio: 40, tiempoPromedioPagina: 20,
      elementos: [{ elemento: "btn-comprar", goal: "compra", hoverPromedio: 2 }] },
    { pagina: url("/Home/"), pageviews: 4, clicksMuertos: 1, rageClicks: 0, scrollDepthPromedio: 60, tiempoPromedioPagina: 30,
      elementos: [{ elemento: "btn-comprar", goal: "compra", hoverPromedio: 4 }] },
    { pagina: url("/productos"), pageviews: 8, clicksMuertos: 0, rageClicks: 3, scrollDepthPromedio: 70, tiempoPromedioPagina: 45, elementos: [] },
    // página que solo tuvo hover (sin pageviews ni otras métricas)
    { pagina: url("/solo-hover"), elementos: [{ elemento: "logo", goal: "ninguno", hoverPromedio: 1 }] }
  ], [
    { formId: "form-contacto", tasaAbandono: 0.6, campoAbandonoMasComun: "telefono", tiempoPromedioCompletado: 55 },
    { formId: "form-newsletter", tasaAbandono: 0.25, campoAbandonoMasComun: "email", tiempoPromedioCompletado: 20 }
  ]);

  // Sesiones del período actual. [entrada, salida, movil, pais, eventos, userId]
  const filas = [
    ["/home",      "/productos", true,  "AR", [],                                  "u1"],
    ["/Home/",     "/productos", true,  "AR", [],                                  "u2"],
    ["/home",      "/checkout",  true,  "AR", ["agregar_carrito"],                 "u3"],
    ["/home",      "/home",      true,  "AR", ["agregar_carrito"],                 "u4"],
    ["/Home/",     "/gracias",   true,  "AR", ["agregar_carrito", "compra"],       "u5"],
    ["/home",      "/home",      true,  "AR", [],                                  "u6"],
    ["/productos", "/productos", true,  "AR", [],                                  "u7"],
    ["/productos", "/checkout",  false, "AR", ["agregar_carrito"],                 "u8"],
    ["/productos", "/Gracias/",  false, "UY", ["compra"],                          "u9"],
    ["/contacto",  "/contacto",  false, ["AR", "Argentina"], ["contacto"],         "u10"]   // país sin traducir (arreglo)
  ];
  for (const [entrada, salida, movil, pais, eventos, userId] of filas) {
    sesion(id, { revisado: EN_ACTUAL, entrada, salida, movil, pais, eventos, userId });
  }
  // Trampas: sesiones fuera del período actual, no deben contarse
  for (let i = 0; i < 3; i++) sesion(id, { revisado: EN_SIGUIENTE, entrada: "/blog", salida: "/blog", movil: false, pais: "BR", eventos: ["compra"] });
  for (let i = 0; i < 4; i++) sesion(id, { revisado: EN_ANTERIOR, entrada: "/viejo", salida: "/viejo", movil: true, pais: "CL", eventos: ["agregar_carrito"] });

  // Formularios del período actual (+ 2 abandonos del período anterior, que no deben contarse)
  for (const campo of ["telefono", "telefono", "nombre"]) formulario(id, "form-contacto", false, campo, EN_ACTUAL);
  for (let i = 0; i < 2; i++) formulario(id, "form-contacto", true, null, EN_ACTUAL);
  for (let i = 0; i < 2; i++) formulario(id, "form-contacto", false, "nombre", EN_ANTERIOR);
  formulario(id, "form-newsletter", false, "email", EN_ACTUAL);
  for (let i = 0; i < 3; i++) formulario(id, "form-newsletter", true, null, EN_ACTUAL);

  // Usuarios activos en el período + uno inactivo (última sesión en el período anterior)
  // [userId, totalSesiones, origen, interacciones, diasActivo, frecuencia, tasaConversion]
  const USUARIOS = [
    ["u1", 1, "google", 5, 0, 0, 0],      ["u2", 3, "google", 3, 10, 0.3, 0],
    ["u3", 2, "google", 2, 20, 0.1, 0.5], ["u4", 1, "directo", 4, 0, 0, 1],
    ["u5", 1, "google", 8, 0, 0, 1],      ["u6", 1, "directo", 1, 0, 0, 0],
    ["u7", 1, "google", 2, 0, 0, 0],      ["u8", 1, "instagram", 6, 0, 0, 1],
    ["u9", 3, "google", 10, 30, 0.1, 0.3333], ["u10", 1, "directo", 3, 0, 0, 1]
  ];
  for (const u of USUARIOS) usuario(id, u, EN_ACTUAL);
  usuario(id, ["u99", 5, "google", 100, 40, 0.9, 0.9], EN_ANTERIOR);

  const rec = USUARIOS.filter(u => u[1] > 1), nue = USUARIOS.filter(u => u[1] === 1);
  titulo(id, "Todas las secciones con datos, más datos fuera del período que NO deben contarse.", [
    `meta.periodo.actual   = (${T_B.toISOString()}, ${T_C.toISOString()}]`,
    `meta.periodo.anterior = (${T_A.toISOString()}, ${T_B.toISOString()}]`,
    "sitio.actual   = snapshot C: totalSesiones 10, usuariosNuevos 7, usuariosRecurrentes 3, totalUsuarios 11, tasaRebote 0.4, tasaConversion 0.6, paginasPorSesion 3.2, duracion 4.5, tiempoConversion 120",
    "sitio.anterior = snapshot B: totalSesiones 100, usuariosNuevos 60, usuariosRecurrentes 10, totalUsuarios 70, tasaRebote 0.5, tasaConversion 0.1",
    "paginas: /home pageviews 10, clicksMuertos 3, rageClicks 1, scroll 48, tiempo 24, elemento btn-comprar hover 2.8 (fusión de /home y /Home/)",
    "paginas: /productos pageviews 8, rageClicks 3, scroll 70, tiempo 45  |  /solo-hover pageviews 0, scroll null, tiempo null, elemento logo hover 1  |  totalPageviews 18  |  NO aparece /viejo",
    "formularios: form-contacto total 5, tasaAbandono 0.6, campo 'telefono'  |  form-newsletter total 4, tasaAbandono 0.25, campo 'email'  |  NO aparece form-viejo",
    "distribuciones.paginaInicio: total 10, top /home (6)",
    "distribuciones.paginaAbandono: total 10, top /productos (3)",
    "distribuciones.pais: total 9 (el arreglo se ignora), top AR (8)",
    "distribuciones.dispositivo: total 10, movil 7, desktop 3",
    "carrito: conCarrito 4, abandonoCarrito 3",
    "paginasConversion: [/gracias 2, /contacto 1]   (el carrito no cuenta: /checkout no aparece)",
    `usuarios.activos 10 (u99 no cuenta)  |  origenes: total 10, top google (6)`,
    `usuarios: interaccionesPromedio ${prom(USUARIOS.map(u => u[3])).toFixed(4)}, diasActivoPromedio ${prom(USUARIOS.map(u => u[4])).toFixed(4)}`,
    `usuarios.recurrentes: ${rec.length} usuarios, frecuenciaPromedio ${prom(rec.map(u => u[5])).toFixed(4)}, tasaConversionPromedio ${prom(rec.map(u => u[6])).toFixed(4)}`,
    `usuarios.nuevos: ${nue.length} usuarios, tasaConversionPromedio ${prom(nue.map(u => u[6])).toFixed(4)}`,
    "usuarios.compradores: total 2 (u5, u9), unaSesion 1 (u5)"
  ]);
}

// 2) Sitio con un único snapshot: no hay período anterior
function primerPeriodo() {
  const id = PREFIJO + "PRIMER_PERIODO";
  sitio(id);
  snapshot(id, T_C, null, { totalSesiones: 5, usuariosNuevos: 5, totalUsuarios: 5, tasaRebote: 1, tasaConversion: 0, paginasPorSesionPromedio: 2, duracionSesionPromedio: 3 });
  for (let i = 0; i < 5; i++) sesion(id, { revisado: hace(3 * DIA), entrada: "/home", salida: "/home", movil: true, pais: "AR" });
  titulo(id, "Un solo snapshot: es el primer período del sitio.", [
    "sitio.anterior = null  |  meta.periodo.anterior = null",
    "meta.periodo.actual.desde = 1970-01-01 (el primer snapshot cubre desde el origen)",
    "sitio.actual: totalSesiones 5, usuariosNuevos 5",
    "distribuciones: paginaInicio total 5, top /home (5)  |  dispositivo movil 5, desktop 0",
    "usuarios.activos 0 (no hay usuarios cargados)"
  ]);
}

// 3) El último snapshot no tiene sesiones: el período actual queda vacío
function actualVacio() {
  const id = PREFIJO + "ACTUAL_VACIO";
  sitio(id);
  snapshot(id, T_B, null, {
    totalSesiones: 20, usuariosNuevos: 12, usuariosRecurrentes: 4, totalUsuarios: 25,
    tasaRebote: 0.3, tasaConversion: 0.2, paginasPorSesionPromedio: 3, duracionSesionPromedio: 4, tiempoConversionPromedio: 90
  });
  snapshot(id, T_C, T_B, { totalSesiones: 0, usuariosRecurrentes: 4, totalUsuarios: 25 });   // sin sesiones nuevas
  for (let i = 0; i < 3; i++) sesion(id, { revisado: EN_ANTERIOR, entrada: "/home", salida: "/home", movil: true, pais: "AR" });
  usuario(id, ["u1", 2, "google", 4, 5, 0.4, 0.5], EN_ANTERIOR);
  titulo(id, "Último snapshot con 0 sesiones: el período actual es la ventana vacía.", [
    "sitio.actual = { totalSesiones 0, usuariosNuevos 0, y todo lo demás null (incluidos usuariosRecurrentes y totalUsuarios) }",
    "sitio.anterior = snapshot B: totalSesiones 20, usuariosNuevos 12, tasaRebote 0.3, tasaConversion 0.2",
    "paginas { totalPageviews 0, items [] }  |  formularios { items [] }  |  carrito { 0, 0 }  |  paginasConversion []",
    "distribuciones: todos con total 0 y top null; dispositivo { total 0, movil 0, desktop 0 }",
    "usuarios.activos 0 (u1 estuvo activo en el período anterior)"
  ]);
}

// 4) Sitio sin snapshots: leerContextos debe omitirlo
function sinSnapshots() {
  const id = PREFIJO + "SIN_SNAPSHOTS";
  sitio(id);
  sesion(id, { revisado: EN_ACTUAL, entrada: "/home", salida: "/home", movil: true, pais: "AR" });
  titulo(id, "Sitio registrado, con una sesión, pero sin documentos en metricas_resumen.", [
    "NO aparece en el Map que devuelve leerContextos",
    `en consola: "RECOMENDACIONES: ${id} todavía no tiene snapshots en metricas_resumen, se omite"`
  ]);
}

// 5) Pocos datos y campos faltantes: nulos y totales en 0
function pocosDatos() {
  const id = PREFIJO + "POCOS_DATOS";
  sitio(id);
  snapshot(id, T_B, null, { totalSesiones: 4, usuariosNuevos: 4, totalUsuarios: 4, tasaRebote: 0.5, tasaConversion: 0 });
  snapshot(id, T_C, T_B, { totalSesiones: 3, usuariosNuevos: 3, totalUsuarios: 7, tasaRebote: 1, tasaConversion: 0 });
  // sesiones SIN is_mobile ni geo
  sesion(id, { revisado: EN_ACTUAL, entrada: "/home", salida: "/home" });
  sesion(id, { revisado: EN_ACTUAL, entrada: "/home", salida: "/blog" });
  sesion(id, { revisado: EN_ACTUAL, entrada: "/blog", salida: "/blog" });
  titulo(id, "3 sesiones sin dispositivo ni país, sin formularios ni usuarios.", [
    "sitio.actual: totalSesiones 3  |  sitio.anterior: totalSesiones 4",
    "distribuciones.paginaInicio: total 3, top /home (2)  |  paginaAbandono: total 3, top /blog (2)",
    "distribuciones.pais: { total 0, top null }  |  dispositivo: { total 0, movil 0, desktop 0 }",
    "carrito { conCarrito 0, abandonoCarrito 0 }  |  formularios { items [] }  |  paginasConversion []",
    "usuarios.activos 0, origenes { total 0, top null }, promedios null, compradores { 0, 0 }"
  ]);
}


/*------------------------ ---------------------------
-------------------------- Ejecución -----------------
-------------------------- -------------------------*/
async function limpiar(db) {
  const prefijo = new RegExp("^" + PREFIJO);
  await db.collection("sitios").deleteMany({ _id: prefijo });
  for (const c of ["metricas_resumen", "sesiones", "formularios", "usuarios"]) {
    await db.collection(c).deleteMany({ siteId: prefijo });
  }
  await db.collection("eventos").deleteMany({ "metadata.siteId": prefijo });
}

async function main() {
  await client.connect();
  const db = client.db("PruebaBBDD");

  await limpiar(db);
  console.log(`Datos anteriores con prefijo ${PREFIJO} borrados.`);
  if (process.argv.includes("limpiar")) return;

  completo();
  primerPeriodo();
  actualVacio();
  sinSnapshots();
  pocosDatos();

  for (const [coleccion, lista] of Object.entries(docs)) {
    if (lista.length > 0) await db.collection(coleccion).insertMany(lista);
  }
  console.log("\nInsertado: " + Object.entries(docs).map(([c, l]) => `${c} ${l.length}`).join(" | "));
  console.log("\nAhora corré leerContextos y compará cada sitio TEST_LC_* con lo esperado de arriba.");
}

main()
  .catch(e => { console.error("Error en el seed:", e); process.exitCode = 1; })
  .finally(() => client.close());