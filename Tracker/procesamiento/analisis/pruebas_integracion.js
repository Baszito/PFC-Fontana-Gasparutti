// =====================================================================
//  Datos de prueba - Integración etapa 3 (casos E3-M4)
//  Base: PruebaBBDD. Todas las fechas son relativas a la hora actual,
//  así que no hay que ajustar nada a mano ni pensar en zonas horarias.
//
//  Cómo usarlo
//    - mongosh:  mongosh "mongodb://localhost:27017" --quiet
//                > load("seeds_integracion.js")
//    - Compass:  pegar TODO el archivo en la consola _MONGOSH (una vez por sesión)
//
//  Luego, de a un caso:  caso01()  y  estado("E3M4-01")
//
//  Tiempos de los crons (valores actuales de prueba):
//    preprocesamiento: cada 1 min   |   procesamiento: cada 6 min
//    análisis: manual (python lectura_escritura.py)
// =====================================================================

var bd = db.getSiblingDB("PruebaBBDD");
var MIN = 60 * 1000;
var BASE = "http://localhost:3000";

// ---------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------
function esperar(ms) {
  if (typeof sleep === "function") { sleep(ms); return; }
  var fin = Date.now() + ms;
  while (Date.now() < fin) {}
}

// El preprocesamiento corre en el segundo 0 de cada minuto. Si coincide con
// la siembra puede borrar una sesión que todavía no tiene sus eventos.
function ventanaSegura() {
  var s = new Date().getSeconds();
  if (s < 5) esperar((5 - s) * 1000);
  else if (s > 50) esperar((65 - s) * 1000);
}

function crearSitio(siteId) {
  bd.sitios.replaceOne({ _id: siteId }, { _id: siteId }, { upsert: true });
}

function limpiar(prefijo) {
  var re = new RegExp("^" + prefijo);
  bd.sesiones.deleteMany({ siteId: re });
  bd.eventos.deleteMany({ "metadata.siteId": re });
  bd.formularios.deleteMany({ siteId: re });
  bd.usuarios.deleteMany({ siteId: re });
  bd.metricas_resumen.deleteMany({ siteId: re });
  bd.sitios.deleteMany({ _id: re });
  ["analisis_clusters", "analisis_patrones_secuenciales", "analisis_apriori", "analisis_random_forest"]
    .forEach(function (c) { bd[c].deleteMany({ siteId: re }); });
}

function limpiarTodo() { limpiar("E3M4-"); print("Datos de prueba E3M4-* eliminados."); }

// Siembra una sesión completa (eventos + sesión).
//   minutosAtras: cuándo empezó. Negativo = en el futuro (la sesión se mantiene "activa").
//   opciones: paginas (rutas), clicks, compra, geo, sinReferrer
function sembrarSesion(siteId, userId, sessionId, minutosAtras, o) {
  o = o || {};
  var paginas = (o.paginas || ["/"]).map(function (p) { return BASE + p; });
  var clicks = o.clicks === undefined ? 1 : o.clicks;
  var t0 = new Date(Date.now() - minutosAtras * MIN);
  var at = function (seg) { return new Date(t0.getTime() + seg * 1000); };
  var eventos = [], eventosClave = [];
  var seg = 0;

  paginas.forEach(function (p) {
    eventos.push({ timestamp: at(seg), metadata: { siteId: siteId, sessionId: sessionId, tipo: "pageview", pagina: p } });
    seg += 10;
  });
  for (var i = 0; i < clicks; i++) {
    eventos.push({ timestamp: at(seg), metadata: { siteId: siteId, sessionId: sessionId, tipo: "click", pagina: paginas[0], elemento: "boton", esInteractivo: true } });
    seg += 5;
  }
  if (o.compra) {
    var tc = at(seg);
    eventos.push({ timestamp: tc, metadata: { siteId: siteId, sessionId: sessionId, tipo: "objetivo", pagina: paginas[paginas.length - 1], subtipo: "compra" } });
    eventosClave.push({ tipo: "objetivo", subtipo: "compra", timestamp: tc });
  }

  var sesion = {
    sessionId: sessionId, siteId: siteId, userId: userId,
    inicio: t0, is_mobile: false, referrer: "directa",
    rutas: paginas.map(function (p, k) { return { pagina: p, timestamp: at(k * 10) }; }),
    eventosClave: eventosClave
  };
  if (o.geo) sesion.geo = o.geo;
  if (o.sinReferrer) delete sesion.referrer;

  bd.eventos.insertMany(eventos);
  bd.sesiones.insertOne(sesion);
}

// 8 compradores (3 páginas, 2 clicks, compra) + 8 rebotadores (1 página, 1 click)
// Dos perfiles muy distintos para que K-Means encuentre estructura (silhouette alto).
function sembrarSitioAnalisis(siteId, pags) {
  crearSitio(siteId);
  for (var i = 1; i <= 8; i++)
    sembrarSesion(siteId, "comp" + i, siteId + "-c" + i, 10, { paginas: pags, clicks: 2, compra: true });
  for (var j = 1; j <= 8; j++)
    sembrarSesion(siteId, "reb" + j, siteId + "-r" + j, 10, { paginas: [pags[0]], clicks: 1 });
}

// ---------------------------------------------------------------------
//  Verificación genérica
// ---------------------------------------------------------------------
function estado(siteId) {
  print("--- sesiones");
  bd.sesiones.find({ siteId: siteId }).forEach(function (d) {
    print(JSON.stringify({
      sessionId: d.sessionId, userId: d.userId,
      revisado: !!d.revisado, Fin: !!d.Fin, esRebote: d.esRebote,
      geo: Array.isArray(d.geo) ? "pendiente" : (d.geo || null)
    }));
  });
  print("--- eventos: total " + bd.eventos.countDocuments({ "metadata.siteId": siteId }) +
        ", sin revisar " + bd.eventos.countDocuments({ "metadata.siteId": siteId, revisado: { $exists: false } }));
  print("--- usuarios");
  bd.usuarios.find({ siteId: siteId }, { totalSesiones: 1, "metricas.totalSesiones": 1, "metricas.tasaConversion": 1 })
    .forEach(function (d) { print(JSON.stringify(d)); });
  print("--- snapshots de metricas_resumen (el más viejo primero)");
  bd.metricas_resumen.find({ siteId: siteId }, { fechaDesde: 1, fechaCalculo: 1, totalSesiones: 1, tasaConversion: 1, totalUsuarios: 1 })
    .sort({ fechaCalculo: 1 }).forEach(function (d) { print(JSON.stringify(d)); });
}

// ---------------------------------------------------------------------
//  E3-M4-01  Sesión cerrada fluye hasta las métricas
//  Esperado: sesión con revisado y Fin; usuario con totalSesiones=1;
//            snapshot con totalSesiones=1; metricas.tasaConversion > 0
// ---------------------------------------------------------------------
function caso01() {
  var s = "E3M4-01"; limpiar(s); crearSitio(s); ventanaSegura();
  sembrarSesion(s, "u1", "s1", 10, { paginas: ["/"], compra: true });
  print("Caso 01 sembrado. Esperar ~1 min (preprocesamiento) y hasta 6 min (procesamiento). Verificar: estado('" + s + "')");
}

// ---------------------------------------------------------------------
//  E3-M4-02  Sesión activa no pasa a procesamiento
//  s1 cerrada (cuenta) + s2 activa: sus eventos están en el FUTURO, así que
//  se mantiene abierta durante todo el caso.
//  Esperado: s2 sin revisado ni Fin; snapshot totalSesiones=1; usuario totalSesiones=1
//  Al terminar: borrar s2 (o limpiar("E3M4-02")), si no se cierra cuando pase la hora.
// ---------------------------------------------------------------------
function caso02() {
  var s = "E3M4-02"; limpiar(s); crearSitio(s); ventanaSegura();
  sembrarSesion(s, "u1", "s1", 10, { paginas: ["/"], compra: true });
  sembrarSesion(s, "u1", "s2", -60, { paginas: ["/"] });
  print("Caso 02 sembrado. Verificar: estado('" + s + "')");
}

// ---------------------------------------------------------------------
//  E3-M4-03  Sesión inválida no contamina las métricas
//  s-inv no tiene "referrer". Si contaminara, "/invalida" aparecería en metricas_paginas.
//  Esperado: s-inv eliminada; snapshot totalSesiones=1; usuario u2 no existe
// ---------------------------------------------------------------------
function caso03() {
  var s = "E3M4-03"; limpiar(s); crearSitio(s); ventanaSegura();
  sembrarSesion(s, "u1", "s1", 10, { paginas: ["/valida"], compra: true });
  sembrarSesion(s, "u2", "s-inv", 10, { paginas: ["/invalida"], sinReferrer: true });
  print("Caso 03 sembrado. Verificar: estado('" + s + "') y el log del preprocesamiento (motivo: referrer)");
}

// ---------------------------------------------------------------------
//  E3-M4-04  Eventos huérfanos no afectan métricas de página
//  Esperado: 0 eventos con sessionId "s-fantasma"; metricas_paginas solo con "/home" (pageviews=1)
// ---------------------------------------------------------------------
function caso04() {
  var s = "E3M4-04"; limpiar(s); crearSitio(s); ventanaSegura();
  sembrarSesion(s, "u1", "s1", 10, { paginas: ["/home"] });
  var t = Date.now() - 10 * MIN;
  bd.eventos.insertMany([0, 1, 2].map(function (i) {
    return { timestamp: new Date(t + i * 1000),
             metadata: { siteId: s, sessionId: "s-fantasma", tipo: "pageview", pagina: BASE + "/huerfana" } };
  }));
  print("Caso 04 sembrado. Verificar: verif04()");
}

function verif04() {
  var s = "E3M4-04";
  print("Eventos huérfanos restantes: " + bd.eventos.countDocuments({ "metadata.sessionId": "s-fantasma" }) + " (esperado 0)");
  var d = bd.metricas_resumen.find({ siteId: s, "metricas_paginas.0": { $exists: true } })
    .sort({ fechaCalculo: -1 }).limit(1).toArray()[0];
  if (!d) { print("Todavía no hay snapshot con métricas de página."); return; }
  print("metricas_paginas: " + JSON.stringify(d.metricas_paginas.map(function (p) { return { pagina: p.pagina, pageviews: p.pageviews }; })));
  print("(esperado: solo /home con pageviews 1)");
}

// ---------------------------------------------------------------------
//  E3-M4-05  Snapshot incremental sin doble conteo
//  Fase A: 2 sesiones (u1 compra, u2 no)  -> esperar el snapshot 1
//  Fase B: 1 sesión nueva (u3)            -> esperar el snapshot 2
//  Esperado: snapshot 2 con fechaDesde = fechaCalculo del 1 y totalSesiones = 1
// ---------------------------------------------------------------------
function caso05a() {
  var s = "E3M4-05"; limpiar(s); crearSitio(s); ventanaSegura();
  sembrarSesion(s, "u1", "s1", 10, { paginas: ["/"], compra: true });
  sembrarSesion(s, "u2", "s2", 10, { paginas: ["/"] });
  print("Fase A sembrada. Esperar a que aparezca un snapshot con totalSesiones=2, y recién ahí correr caso05b().");
}

function caso05b() {
  var s = "E3M4-05"; ventanaSegura();
  sembrarSesion(s, "u3", "s3", 3, { paginas: ["/"] });
  print("Fase B sembrada. Esperar 1 tick de preprocesamiento y 1 de procesamiento. Verificar: verif05()");
}

function verif05() {
  var s = "E3M4-05";
  var snaps = bd.metricas_resumen.find({ siteId: s }).sort({ fechaCalculo: 1 }).toArray();
  var cadena = true, suma = 0;
  snaps.forEach(function (d, i) {
    suma += d.totalSesiones;
    if (i > 0 && +d.fechaDesde !== +snaps[i - 1].fechaCalculo) cadena = false;
    print(JSON.stringify({ n: i + 1, fechaDesde: d.fechaDesde, fechaCalculo: d.fechaCalculo, totalSesiones: d.totalSesiones }));
  });
  print("Cadena fechaDesde(n+1) = fechaCalculo(n): " + cadena);
  print("Suma de totalSesiones en snapshots: " + suma + " | sesiones revisadas: " +
        bd.sesiones.countDocuments({ siteId: s, revisado: { $exists: true } }) + " (esperado: ambos 3)");
}

// ---------------------------------------------------------------------
//  E3-M4-06  Aislamiento entre sitios (pipeline completo)
//  Dos sitios con 16 usuarios cada uno y páginas propias (/a/... y /b/...).
//  Orden: caso06() -> esperar preprocesamiento y procesamiento -> correr análisis -> verif06()
// ---------------------------------------------------------------------
function caso06() {
  limpiar("E3M4-06"); ventanaSegura();
  sembrarSitioAnalisis("E3M4-06A", ["/a/home", "/a/catalogo", "/a/producto"]);
  sembrarSitioAnalisis("E3M4-06B", ["/b/inicio", "/b/ofertas", "/b/carrito"]);
  print("Caso 06 sembrado. Esperar a que ambos sitios tengan usuarios con métricas (estado), y correr el análisis.");
}

function verif06() {
  [["E3M4-06A", "/a/"], ["E3M4-06B", "/b/"]].forEach(function (x) {
    var s = x[0], pref = x[1];
    print("=== " + s);
    print("sesiones: " + bd.sesiones.countDocuments({ siteId: s }) + " | usuarios: " + bd.usuarios.countDocuments({ siteId: s }) +
          " | snapshots: " + bd.metricas_resumen.countDocuments({ siteId: s }));
    var c = bd.analisis_clusters.find({ siteId: s }).sort({ fechaGeneracion: -1 }).limit(1).toArray()[0];
    if (!c) print("clusters: SIN DOCUMENTO (revisar usuarios con metricas y silhouette)");
    else print("clusters: k=" + c.k + ", silhouette=" + c.silhouette + ", asignaciones=" + c.asignaciones.length +
               ", todas del sitio=" + c.asignaciones.every(function (a) { return String(a._id).indexOf(s) === 0; }));
    var p = bd.analisis_patrones_secuenciales.find({ siteId: s }).sort({ fechaGeneracion: -1 }).limit(1).toArray()[0];
    if (!p) print("patrones: SIN DOCUMENTO");
    else print("patrones: " + JSON.stringify(p.patrones.map(function (q) { return q.secuencia; })) +
               ", solo páginas propias=" + p.patrones.every(function (q) { return q.secuencia.every(function (pg) { return pg.indexOf(pref) === 0; }); }));
  });
}

// ---------------------------------------------------------------------
//  E3-M4-07  (opcional) Ventana temporal del análisis
//  Con el análisis actual (ventana de 30 días) una 2da corrida inmediata
//  vuelve a analizar la misma ventana. Este seed prueba lo que SÍ garantiza:
//  solo entran las sesiones de los últimos 30 días.
//  Esperado: patrones solo con /x/... (sesiones recientes), nada de /y/...
// ---------------------------------------------------------------------
function caso07ventana() {
  var s = "E3M4-07"; limpiar(s); crearSitio(s); ventanaSegura();
  var DIAS40 = 40 * 24 * 60;
  for (var i = 1; i <= 3; i++) {
    sembrarSesion(s, "rec" + i, s + "-rec" + i, 10, { paginas: ["/x/home", "/x/lista", "/x/detalle"] });
    sembrarSesion(s, "vie" + i, s + "-vie" + i, DIAS40, { paginas: ["/y/inicio", "/y/ofertas", "/y/carrito"] });
  }
  print("Caso 07 (ventana) sembrado. Esperar preprocesamiento, correr el análisis y mirar analisis_patrones_secuenciales del sitio.");
}

// ---------------------------------------------------------------------
//  E3-M4-08  Fallo aislado por técnica
//  Sitio nuevo con sesiones sin analizar. Antes de correr el análisis, agregar
//  temporalmente  raise RuntimeError("fallo forzado")  como primera línea de kmeans().
//  Esperado: error de K-Means en consola; patrones/apriori/RF sí se guardan;
//            analisis_clusters sin documento nuevo.
// ---------------------------------------------------------------------
function caso08() {
  limpiar("E3M4-08"); ventanaSegura();
  sembrarSitioAnalisis("E3M4-08", ["/h/home", "/h/catalogo", "/h/producto"]);
  print("Caso 08 sembrado. Esperar preprocesamiento y procesamiento, forzar el fallo y correr el análisis.");
}

// ---------------------------------------------------------------------
//  E3-M4-09  Recorrido completo: sin script. Navegar el sitio de prueba y
//  verificar con estado("<siteId del sitio de prueba>").
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
//  E3-M4-10  Consistencia entre colecciones
// ---------------------------------------------------------------------
function consistencia(s) {
  var u = bd.usuarios.aggregate([{ $match: { siteId: s } }, { $group: { _id: null, t: { $sum: "$totalSesiones" } } }]).toArray();
  var m = bd.metricas_resumen.aggregate([{ $match: { siteId: s } }, { $group: { _id: null, t: { $sum: "$totalSesiones" } } }]).toArray();
  var r = bd.sesiones.countDocuments({ siteId: s, revisado: { $exists: true }, Fin: { $exists: true } });
  var tu = u.length ? u[0].t : 0, tm = m.length ? m[0].t : 0;
  print(s + " -> usuarios: " + tu + " | sesiones revisadas con Fin: " + r + " | snapshots: " + tm +
        ((tu === r && r === tm) ? "   OK" : "   DIFERENCIA"));
}

function consistenciaTodos() {
  bd.sitios.find({ _id: /^E3M4-/ }).sort({ _id: 1 }).forEach(function (d) { consistencia(d._id); });
}

// ---------------------------------------------------------------------
//  E3-M4-11  Reinicio de un contenedor a mitad de corrida
//  25 sesiones con coordenadas: la traducción tarda ~1 s por sesión (Nominatim),
//  lo que da tiempo para frenar el contenedor en plena ejecución:
//    docker compose stop preprocesamiento     (cuando el log diga "Iniciando traducciones")
//    docker compose start preprocesamiento    (y esperar 2 ticks)
//  Esperado: 25 sesiones y 25 usuarios, sin duplicados; geo pendiente = 0 al final.
// ---------------------------------------------------------------------
function caso11() {
  var s = "E3M4-11"; limpiar(s); crearSitio(s); ventanaSegura();
  for (var i = 1; i <= 25; i++)
    sembrarSesion(s, "u" + i, "s" + i, 10, { paginas: ["/"], geo: [-34.6037, -58.3816] });
  print("Caso 11 sembrado (25 sesiones con geo). Verificar: verif11()");
}

function verif11() {
  var s = "E3M4-11";
  print("sesiones: " + bd.sesiones.countDocuments({ siteId: s }) + " | usuarios: " + bd.usuarios.countDocuments({ siteId: s }) +
        " | geo pendiente (array): " + bd.sesiones.countDocuments({ siteId: s, geo: { $type: "array" } }) +
        " (esperado 25 | 25 | 0 al final)");
}

print("seeds_integracion.js cargado. Funciones: caso01..caso06, caso07ventana, caso08, caso11, estado(siteId), verif04/05/06/11, consistenciaTodos, limpiarTodo");