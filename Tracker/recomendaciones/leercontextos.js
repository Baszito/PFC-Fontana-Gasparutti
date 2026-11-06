/*------------------------ ---------------------------
-------------------------- leerContextos -------------
-------------------------- -------------------------*/
// Etapa "Extracción de métricas y datos" del diagrama de diseño.
// Solo LEE la base: no evalúa reglas ni pondera nada.
//
// Devuelve un Map(siteId -> contexto). Cada contexto se organiza en secciones, una por
// origen de datos (la columna "Origen" del catálogo de recomendaciones):
//
// {
//   siteId,
//   meta:  { ahora, periodo: { actual, anterior }, fechasAnalisis, errores[] },
//   sitio: { actual, anterior },            // últimos dos snapshots de metricas_resumen
//   paginas:     { totalPageviews, items[] },   // metricas_paginas (con sus elementos), período actual
//   formularios: { items[] },                   // formularios, período actual
//   distribuciones: { paginaInicio, paginaAbandono, pais, dispositivo },   // sesiones, período actual
//   carrito: { sesiones, conCarrito, abandonoCarrito },                    // sesiones, período actual
//   paginasConversion: [{ pagina, cantidad }],  // eventos objetivo de conversión, período actual
//   usuarios: { ... },                          // estado actual (sin ventana)
//   analisis: { clusters, patrones, apriori, randomForest }   // último documento de cada uno
// }
//
//
// PERÍODOS: cada snapshot de metricas_resumen cubre el tramo entre el snapshot anterior y él
// (el procesamiento procesa lo revisado desde el último fechaCalculo). Como el procesamiento y
// la generación de recomendaciones corren con la misma frecuencia (cada 30 días):
//   período actual   = (fechaCalculo del penúltimo snapshot, fechaCalculo del último]
//   período anterior = (fechaCalculo del antepenúltimo,     fechaCalculo del penúltimo]
// Las secciones que se leen de sesiones / formularios / eventos usan ese mismo período, así
// todo el contexto habla del mismo tramo de tiempo.
//
// Una sección que falla queda en null y el error se registra en meta.errores: las reglas
// que dependen de ella se saltean, y las demás siguen funcionando.
// "top" = { valor, cantidad } del valor más frecuente (o null si no hay datos).

// Subtipos de eventos clave que emite el tracker (fijos)
const SUBTIPO_CARRITO = "agregar_carrito";
const SUBTIPOS_COMPRA = ["compra"];
const SUBTIPOS_CONVERSION = ["compra", "suscripcion", "contacto"];   // sin carrito


/*------------------------ ---------------------------
-------------------------- funciones auxiliares ----------------
-------------------------- -------------------------*/

const esNumero = (x) => typeof x === "number" && Number.isFinite(x);
const sumarCampo = (lista, campo) => lista.reduce((acum, x) => acum + (esNumero(x[campo]) ? x[campo] : 0), 0);

// Llos sitios salen de la colección "sitios", igual que en el procesamiento
async function obtenerSitios(db) {
  const sitios = await db.collection("sitios").find({}, { projection: { _id: 1 } }).toArray();
  return sitios.map(s => s._id.toString());
}

// misma normalización que usa PrefixSpan: sin dominio, ruta en minúsculas y sin barra final,
function normalizarPagina(url) {
  try {
    const u = new URL(url);
    const ruta = u.pathname.replace(/\/+$/, "").toLowerCase();
    const params = new Map();
    for (const [k, v] of u.searchParams) if (v !== "" && !params.has(k)) params.set(k, v);
    if (params.size > 0) {
      const consulta = [...params.keys()].sort().map(k => `${k}=${params.get(k)}`).join("&");
      return `${ruta}?${consulta}`;
    }
    return ruta || "/";
  } catch (e) {
    return String(url).toLowerCase();
  }
}

// filas: [{ valor, cantidad }]. Junta valores repetidos (varias URL pueden normalizar igual)
// y devuelve el total y el valor más frecuente.
function resumirFilas(filas) {
  const mapa = new Map();
  let total = 0;
  for (const f of filas) {
    total += f.cantidad;
    mapa.set(f.valor, (mapa.get(f.valor) || 0) + f.cantidad);
  }
  let top = null;
  for (const [valor, cantidad] of mapa) {
    if (!top || cantidad > top.cantidad) top = { valor, cantidad };
  }
  return { total, top };
}

// Condición común: sesiones finalizadas y revisadas dentro de la ventana
// (el mismo criterio con el que el procesamiento arma los snapshots)
const condicionSesiones = (siteId, ventana) => ({
  siteId: siteId,
  Fin: { $exists: true },
  revisado: { $gt: ventana.desde, $lte: ventana.hasta }
});


/*------------------------ ---------------------------
-------------------------- Sección: sitio ------------
-------------------------- -------------------------*/

//campos a traerme de metricas_resumen
const CAMPOS_SITIO = {
  fechaCalculo: 1,
  totalSesiones: 1,
  usuariosNuevos: 1,
  usuariosRecurrentes: 1,
  totalUsuarios: 1,
  tasaRebote: 1,
  tasaConversion: 1,
  paginasPorSesionPromedio: 1,
  duracionSesionPromedio: 1,    // en minutos
  tiempoConversionPromedio: 1   // en segundos
};

//leo los documentos que necesito
async function leerPeriodos(db, siteId) {
  const docs = await db.collection("metricas_resumen")
    .find({ siteId: siteId }, { projection: CAMPOS_SITIO })
    .sort({ fechaCalculo: -1 })
    .limit(2)
    .toArray();                                    // me traigo los dos ultimos
  if (docs.length === 0) return null;

  const periodo = (doc, previo) => ({
    desde: previo ? previo.fechaCalculo : new Date(0),
    hasta: doc.fechaCalculo,
    metricas: metricasDe(doc)
  });
  return {
    actual: periodo(docs[0], docs[1]),
    anterior: docs.length > 1 ? periodo(docs[1], docs[2]) : null
  };
}

// ventanita vacia, para devolver si no hay sesiones
function ventanaVacia() {
  return {
    totalSesiones: 0, usuariosNuevos: 0,
    usuariosRecurrentes: null, totalUsuarios: null,
    tasaRebote: null, tasaConversion: null, paginasPorSesionPromedio: null,
    duracionSesionPromedio: null, tiempoConversionPromedio: null
  };
}

function metricasDe(doc) {
  if (!(doc.totalSesiones > 0)) return ventanaVacia();
  const { fechaCalculo, _id, ...metricas } = doc;
  return metricas;
}

// y aca es donde llamo a todo.
function leerSitio(periodos) {
  return {
    actual: periodos.actual.metricas,
    anterior: periodos.anterior ? periodos.anterior.metricas : null
  };
}


/*------------------------ ---------------------------
-------------------------- Sección: páginas ----------
-------------------------- -------------------------*/
//como las metricas de pagina estan dentro de "metricas_paginas", dentro de "metricas_resumen", trabajamos sobre eso directamente

// campos a traerme.
const CAMPOS_PAGINAS = {
  "metricas_paginas.pagina": 1,
  "metricas_paginas.pageviews": 1,
  "metricas_paginas.clicksMuertos": 1,
  "metricas_paginas.rageClicks": 1,
  "metricas_paginas.scrollDepthPromedio": 1,
  "metricas_paginas.tiempoPromedioPagina": 1,
  "metricas_paginas.elementos.elemento": 1,
  "metricas_paginas.elementos.goal": 1,
  "metricas_paginas.elementos.hoverPromedio": 1
};

//lo mismo de antes, me traigo sitios, solo que, de momento, solo se calculan sobre el periodo actual
async function leerPaginas(db, siteId, periodo) {
  const doc = await db.collection("metricas_resumen")
    .findOne({ siteId: siteId, fechaCalculo: periodo.hasta }, { projection: CAMPOS_PAGINAS });
  const paginas = doc && Array.isArray(doc.metricas_paginas) ? doc.metricas_paginas : [];
  return agruparPaginas(paginas);
}


// Promedio de varios valores ponderado por visitas. Ignora los que no tienen valor; si ninguno lo tiene, null.
function promediarPorVisitas(items) {          // items: [{ valor, visitas }]
  let suma = 0, peso = 0;
  for (const { valor, visitas } of items) {
    if (!esNumero(valor)) continue;
    const w = Math.max(esNumero(visitas) ? visitas : 0, 1);
    suma += valor * w;
    peso += w;
  }
  return peso > 0 ? suma / peso : null;
}

// esta es como la funcion maestra
function agruparPaginas(paginas) {
  const grupos = new Map();
  for (const p of paginas) {
    if (typeof p.pagina !== "string") continue;
    const clave = normalizarPagina(p.pagina);
    //hay que normalizarlas
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(p);
  }
  //con todo esto creamos el mapa

  //aca hay algo que no tuvimos en cuenta, y era normalizar antes
  //asi que sumamos ahora, despues se podria modificar
  const items = [...grupos].map(([pagina, entradas]) => ({
    pagina,
    pageviews: sumarCampo(entradas, "pageviews"), //sumas de cosas obtenidas
    clicksMuertos: sumarCampo(entradas, "clicksMuertos"),
    rageClicks: sumarCampo(entradas, "rageClicks"),
    scrollDepthPromedio: promediarPorVisitas(entradas.map(e => ({ valor: e.scrollDepthPromedio, visitas: e.pageviews }))),
    tiempoPromedioPagina: promediarPorVisitas(entradas.map(e => ({ valor: e.tiempoPromedioPagina, visitas: e.pageviews }))),
    elementos: agruparElementos(entradas)
  })).sort((a, b) => b.pageviews - a.pageviews);

  return { totalPageviews: items.reduce((acum, p) => acum + p.pageviews, 0), items };
}

// Elementos de una página, agrupados por (elemento, goal); el hover se pondera por las visitas
// de la entrada de la que viene.
function agruparElementos(entradas) {
  const grupos = new Map();
  for (const e of entradas) {
    for (const el of e.elementos || []) {
      const goal = el.goal === undefined ? null : el.goal;
      const clave = JSON.stringify([el.elemento, goal]);
      if (!grupos.has(clave)) grupos.set(clave, { elemento: el.elemento, goal, hovers: [] });
      grupos.get(clave).hovers.push({ valor: el.hoverPromedio, visitas: e.pageviews });
    }
  }
  return [...grupos.values()].map(g => ({
    elemento: g.elemento, goal: g.goal, hoverPromedio: promediarPorVisitas(g.hovers)
  }));
}

/*------------------------ ---------------------------
-------------------------- Sección: formularios ------
-------------------------- -------------------------*/
// La tasa de abandono y el campo de abandono más común vienen de metricas_resumen 
// total de formularios -> Conteo sobre formularios
const CAMPOS_FORMULARIOS = {
  "metricas_formularios.formId": 1,
  "metricas_formularios.tasaAbandono": 1,
  "metricas_formularios.campoAbandonoMasComun": 1
};

async function leerFormularios(db, siteId, periodo) {
  const [doc, totales] = await Promise.all([
    db.collection("metricas_resumen")
      .findOne({ siteId: siteId, fechaCalculo: periodo.hasta }, { projection: CAMPOS_FORMULARIOS }),
    db.collection("formularios").aggregate([
      { $match: { siteId: siteId, revisado: { $gt: periodo.desde, $lte: periodo.hasta } } },
      { $group: { _id: "$id_formulario", total: { $sum: 1 } } }
    ]).toArray()
  ]);

  const totalDe = new Map(totales.map(t => [t._id, t.total]));
  const guardados = doc && Array.isArray(doc.metricas_formularios) ? doc.metricas_formularios : [];
  const items = guardados.map(f => ({
    formId: f.formId,
    total: totalDe.get(f.formId) || 0,
    tasaAbandono: f.tasaAbandono ?? null,
    campoAbandonoMasComun: f.campoAbandonoMasComun ?? null
  })).sort((a, b) => b.total - a.total);

  return { items };
}

/*------------------------ ---------------------------
-------------------------- Sección: distribuciones ---
-------------------------- -------------------------*/
// metricas_resumen solo guarda el valor "habitual" (la página de ingreso más frecuente, el país
// más frecuente...), no qué proporción de las sesiones representa. Para esa proporción hay que
// contar sobre las sesiones.
async function leerDistribuciones(db, siteId, ventana) {
  const sesiones = db.collection("sesiones");
  const base = condicionSesiones(siteId, ventana);
  const contarPor = (campo, tipo) => sesiones.aggregate([
    { $match: { ...delPeriodo, $expr: { $eq: [{ $type: "$" + campo }, tipo] } } },
    { $group: { _id: "$" + campo, cantidad: { $sum: 1 } } }
  ]).toArray();

  const [entradas, salidas, paises, dispositivos] = await Promise.all([
    agrupar("paginaInicio", "string"),
    agrupar("paginaAbandono", "string"),
    agrupar("geo.pais", "string"),
    agrupar("is_mobile", "bool")
  ]);

  const cantidadDe = (valor) => (dispositivos.find(d => d._id === valor) || { cantidad: 0 }).cantidad;
  const movil = cantidadDe(true);
  const desktop = cantidadDe(false);

  return {
    paginaInicio: resumirFilas(entradas.map(f => ({ valor: normalizarPagina(f._id), cantidad: f.cantidad }))),
    paginaAbandono: resumirFilas(salidas.map(f => ({ valor: normalizarPagina(f._id), cantidad: f.cantidad }))),
    pais: resumirFilas(paises.map(f => ({ valor: f._id, cantidad: f.cantidad }))),
    dispositivo: { total: movil + desktop, movil, desktop }
  };
}


/*------------------------ ---------------------------
-------------------------- Sección: carrito ----------
-------------------------- -------------------------*/
//aca hubo algo que no previmos
//calculamos la tasa de abandono de carrito de usuario
//pero no algo como tasaAbandonototal/tasaconAgregarCarrito
async function leerCarrito(db, siteId, periodo) {
  const subtipos = { $ifNull: ["$eventosClave.subtipo", []] };
  const hubo = (lista) => ({ $gt: [{ $size: { $setIntersection: [lista, subtipos] } }, 0] });

  const [r] = await db.collection("sesiones").aggregate([
    { $match: { siteId: siteId, revisado: { $gt: periodo.desde, $lte: periodo.hasta } } },
    { $project: { conCarrito: hubo([SUBTIPO_CARRITO]), conCompra: hubo(SUBTIPOS_COMPRA) } },
    { $group: {
        _id: null,
        conCarrito: { $sum: { $cond: ["$conCarrito", 1, 0] } },
        abandonoCarrito: { $sum: { $cond: [{ $and: ["$conCarrito", { $not: ["$conCompra"] }] }, 1, 0] } }
    } }
  ]).toArray();

  return { conCarrito: r ? r.conCarrito : 0, abandonoCarrito: r ? r.abandonoCarrito : 0 };
}


/*------------------------ ---------------------------
-------------------------- Sección: páginas de conversión
-------------------------- -------------------------*/
// esta es para apoyar a PrefixSpan
async function leerPaginasConversion(db, siteId, periodo) {
  const filas = await db.collection("eventos").aggregate([
    { $match: {
        "metadata.siteId": siteId,
        "metadata.tipo": "objetivo",
        "metadata.subtipo": { $in: SUBTIPOS_CONVERSION },
        revisado: { $gt: periodo.desde, $lte: periodo.hasta }
    } },
    { $group: { _id: "$metadata.pagina", cantidad: { $sum: 1 } } }
  ]).toArray();

  // varias URL pueden normalizar a la misma página: se suman sus conversiones
  const porPagina = new Map();
  for (const f of filas) {
    if (typeof f._id !== "string") continue;
    const pagina = normalizarPagina(f._id);
    porPagina.set(pagina, (porPagina.get(pagina) || 0) + f.cantidad);
  }
  return [...porPagina].map(([pagina, cantidad]) => ({ pagina, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
}


/*------------------------ ---------------------------
-------------------------- Sección: usuarios ---------
-------------------------- -------------------------*/
// usuarios.metricas es el estado acumulado de cada usuario (no está dividido por períodos). Para que
// esta sección hable del mismo tramo que las demás, se consideran los usuarios ACTIVOS en el período
// actual: los que tuvieron su última sesión dentro de él (metricas.ultimaSesion).
//   recurrentes = usuarios con más de una sesión | nuevos = usuarios con una sola sesión
async function leerUsuarios(db, siteId, periodo) {
  const usuarios = db.collection("usuarios");
  const activos = { siteId: siteId, "metricas.ultimaSesion": { $gt: periodo.desde, $lte: periodo.hasta } };
  const esRecurrente = { $gt: ["$totalSesiones", 1] };

  const [origenes, promedios, compradores] = await Promise.all([
    // ATR-08: cuántos usuarios hay por cada origen predominante
    usuarios.aggregate([
      { $match: { ...activos, "metricas.origenPredominante": { $type: "string" } } },
      { $group: { _id: "$metricas.origenPredominante", cantidad: { $sum: 1 } } }
    ]).toArray(),

    // CON-04, FID-03, FID-04, FID-05: promedios sobre los usuarios activos
    usuarios.aggregate([
      { $match: activos },
      { $group: {
          _id: null,
          usuarios: { $sum: 1 },
          interaccionesPromedio: { $avg: "$metricas.interaccionesPromedio" },
          diasActivoPromedio: { $avg: "$metricas.diasActivo" },
          recurrentes: { $sum: { $cond: [esRecurrente, 1, 0] } },
          frecuenciaRecurrentes: { $avg: { $cond: [esRecurrente, "$metricas.frecuenciaRecurrencia", null] } },
          conversionRecurrentes: { $avg: { $cond: [esRecurrente, "$metricas.tasaConversion", null] } },
          nuevos: { $sum: { $cond: [esRecurrente, 0, 1] } },
          conversionNuevos: { $avg: { $cond: [esRecurrente, null, "$metricas.tasaConversion"] } }
      } }
    ]).toArray(),

    // FID-06: usuarios que compraron en el período y cuántos de ellos tienen una sola sesión.
    // El _id de usuarios es siteId_userId.
    db.collection("sesiones").aggregate([
      { $match: { siteId: siteId, revisado: { $gt: periodo.desde, $lte: periodo.hasta }, "eventosClave.subtipo": { $in: SUBTIPOS_COMPRA } } },
      { $group: { _id: "$userId" } },
      { $project: { _id: 0, claveUsuario: { $concat: [siteId, "_", "$_id"] } } },
      { $lookup: { from: "usuarios", localField: "claveUsuario", foreignField: "_id", as: "usuario" } },
      { $unwind: "$usuario" },
      { $group: { _id: null, total: { $sum: 1 }, unaSesion: { $sum: { $cond: [{ $eq: ["$usuario.totalSesiones", 1] }, 1, 0] } } } }
    ]).toArray()
  ]);

  const p = promedios[0];
  const c = compradores[0];
  return {
    activos: p ? p.usuarios : 0,
    origenes: resumirFilas(origenes.map(o => ({ valor: o._id, cantidad: o.cantidad }))),
    interaccionesPromedio: p ? p.interaccionesPromedio : null,
    diasActivoPromedio: p ? p.diasActivoPromedio : null,
    recurrentes: {
      usuarios: p ? p.recurrentes : 0,
      frecuenciaPromedio: p ? p.frecuenciaRecurrentes : null,
      tasaConversionPromedio: p ? p.conversionRecurrentes : null
    },
    nuevos: {
      usuarios: p ? p.nuevos : 0,
      tasaConversionPromedio: p ? p.conversionNuevos : null
    },
    compradores: { total: c ? c.total : 0, unaSesion: c ? c.unaSesion : 0 }
  };
}


/*------------------------ ---------------------------
-------------------------- Sección: análisis ---------
-------------------------- -------------------------*/
// Último documento de cada técnica para el sitio. Se ordena por _id y no por fecha, porque el
// campo se llama distinto según la colección (fechaGeneracion o fechaCalculo).
// Se devuelve tal cual está guardado, salvo las asignaciones de clusters (una por usuario),
// que las recomendaciones no usan. Si todavía no hay resultados para el sitio, queda en null.
async function ultimoDocumento(db, coleccion, siteId, projection) {
  const r = await db.collection(coleccion)
    .find({ siteId: siteId }, { projection: projection || {} })
    .sort({ _id: -1 })
    .limit(1)
    .toArray();
  return r.length > 0 ? r[0] : null;
}

async function leerAnalisis(db, siteId) {
  const [clusters, patrones, apriori, randomForest] = await Promise.all([
    ultimoDocumento(db, "analisis_clusters", siteId, { asignaciones: 0 }),
    ultimoDocumento(db, "analisis_patrones_secuenciales", siteId),
    ultimoDocumento(db, "analisis_apriori", siteId),
    ultimoDocumento(db, "analisis_random_forest", siteId)
  ]);
  return { clusters, patrones, apriori, randomForest };
}

const fechaDe = (doc) => (doc ? (doc.fechaGeneracion || doc.fechaCalculo || null) : null);


/*------------------------ ---------------------------
-------------------------- leerContextos -------------
-------------------------- -------------------------*/
// opciones: { ahora }. Se deja por si hay que sumar mas cosas
async function leerContextos(db, opciones = {}) {
  const { ahora = new Date() } = opciones;
  const sitios = await obtenerSitios(db);
  const contextos = new Map();

  for (const siteId of sitios) {
    const periodos = await leerPeriodos(db, siteId);
    if (!periodos) {
      console.log(`RECOMENDACIONES: ${siteId} todavía no tiene snapshots en metricas_resumen, se omite`);
      continue;
    }

    const errores = [];
    // Una sección que falla queda en null; las demás siguen
    const seccion = async (nombre, fn) => {
      try {
        return await fn();
      } catch (e) {
        errores.push(`${nombre}: ${e.message}`);
        console.log(`RECOMENDACIONES: error leyendo '${nombre}' de ${siteId}: ${e.message}`);
        return null;
      }
    };

    const actual = periodos.actual;
    const [sitio, paginas, formularios, distribuciones, carrito, paginasConversion, usuarios, analisis] = await Promise.all([
      seccion("sitio", () => leerSitio(periodos)),
      seccion("paginas", () => leerPaginas(db, siteId, actual)),
      seccion("formularios", () => leerFormularios(db, siteId, actual)),
      seccion("distribuciones", () => leerDistribuciones(db, siteId, actual)),
      seccion("carrito", () => leerCarrito(db, siteId, actual)),
      seccion("paginasConversion", () => leerPaginasConversion(db, siteId, actual)),
      seccion("usuarios", () => leerUsuarios(db, siteId, actual)),
      seccion("analisis", () => leerAnalisis(db, siteId))
    ]);

    contextos.set(siteId, {
      siteId,
      meta: {
        ahora,
        periodo: {
          actual: { desde: actual.desde, hasta: actual.hasta },
          anterior: periodos.anterior ? { desde: periodos.anterior.desde, hasta: periodos.anterior.hasta } : null
        },
        //fechasAnalisis: {
         // clusters: fechaDe(analisis && analisis.clusters),
          //patrones: fechaDe(analisis && analisis.patrones),
          //apriori: fechaDe(analisis && analisis.apriori),
          //randomForest: fechaDe(analisis && analisis.randomForest)
        //},
        errores
      },
      sitio,
      paginas,
      formularios,
      distribuciones,
      carrito,
      paginasConversion,
      usuarios
    });
  }

  return contextos;
}

module.exports = {
  leerContextos, normalizarPagina, resumirFilas, agruparPaginas
};