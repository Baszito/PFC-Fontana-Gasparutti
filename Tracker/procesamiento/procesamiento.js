const cron = require('node-cron');
const mongo = require('mongodb');

const uri = "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);

function condRevisado(fechaDesde) {
  return fechaDesde ? { $exists: true, $gt: fechaDesde } : { $exists: true };
}

async function obtenerSitios(db) {
  const sitios = await db.collection("sitios").find({}, { projection: { _id: 1 } }).toArray();
  return sitios.map(s => s._id.toString());
}

async function obtenerFechaUltimoCalculo(db, siteId) {
  const ultimo = await db.collection("metricas_resumen")
    .find({ siteId })
    .sort({ fechaCalculo: -1 })
    .limit(1)
    .toArray();
  return ultimo.length > 0 ? ultimo[0].fechaCalculo : null;
}

// ============================================================
// =================== MÉTRICAS DE PÁGINA =======================
// ============================================================

async function calcularPageviews(db, siteId, fechaDesde) {
  return await db.collection("eventos").aggregate([
    { $match: { "metadata.tipo": "pageview", "metadata.siteId": siteId, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: "$metadata.pagina", pageviews: { $sum: 1 } } },
    { $project: { _id: 0, pagina: "$_id", pageviews: 1 } }
  ]).toArray();
}

async function calcularScrollDepth(db, siteId, fechaDesde) {
  return await db.collection("eventos").aggregate([
    { $match: { "metadata.tipo": "scroll", "metadata.siteId": siteId, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: "$metadata.pagina", scrollDepthPromedio: { $avg: "$metadata.valor" } } },
    { $project: { _id: 0, pagina: "$_id", scrollDepthPromedio: 1 } }
  ]).toArray();
}

async function calcularClicksMuertos(db, siteId, fechaDesde) {
  return await db.collection("eventos").aggregate([
    { $match: { "metadata.tipo": "click", "metadata.elemento": '', "metadata.siteId": siteId, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: "$metadata.pagina", clicksMuertos: { $sum: 1 } } },
    { $project: { _id: 0, pagina: "$_id", clicksMuertos: 1 } }
  ]).toArray();
}

async function calcularHoverPromedio(db, siteId, fechaDesde) {
  return await db.collection("eventos").aggregate([
    { $match: { "metadata.tipo": "hover", "metadata.siteId": siteId, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: { pagina: "$metadata.pagina", elemento: "$metadata.elemento", goal: "$metadata.goal" }, hoverPromedio: { $avg: "$metadata.duracion" } } },
    { $project: { _id: 0, pagina: "$_id.pagina", elemento: "$_id.elemento", goal: "$_id.goal", hoverPromedio: 1 } }
  ]).toArray();
}

async function calcularRageClicks(db, siteId, fechaDesde) {
  const ventanaSegundos = 1.5;

  return await db.collection("eventos").aggregate([
    { $match: { "metadata.tipo": "click", "metadata.siteId": siteId, revisado: condRevisado(fechaDesde) } },
    { $sort: { timestamp: 1 } },
    {
      $group: {
        _id: { sessionId: "$metadata.sessionId", elemento: "$metadata.elemento", pagina: "$metadata.pagina" },
        timestamps: { $push: "$timestamp" }
      }
    },
    {
      $project: {
        pagina: "$_id.pagina",
        clusters: {
          $reduce: {
            input: { $slice: ["$timestamps", 1, { $size: "$timestamps" }] },
            initialValue: { clusterActual: [{ $arrayElemAt: ["$timestamps", 0] }], clustersCompletos: [] },
            in: {
              $let: {
                vars: { ultimoDelCluster: { $arrayElemAt: ["$$value.clusterActual", -1] } },
                in: {
                  $cond: {
                    if: { $lte: [{ $divide: [{ $subtract: ["$$this", "$$ultimoDelCluster"] }, 1000] }, ventanaSegundos] },
                    then: { clusterActual: { $concatArrays: ["$$value.clusterActual", ["$$this"]] }, clustersCompletos: "$$value.clustersCompletos" },
                    else: { clusterActual: ["$$this"], clustersCompletos: { $concatArrays: ["$$value.clustersCompletos", [{ $size: "$$value.clusterActual" }]] } }
                  }
                }
              }
            }
          }
        }
      }
    },
    { $project: { pagina: 1, todosLosClusters: { $concatArrays: ["$clusters.clustersCompletos", [{ $size: "$clusters.clusterActual" }]] } } },
    { $project: { pagina: 1, rageClicksDetectados: { $size: { $filter: { input: "$todosLosClusters", as: "t", cond: { $gte: ["$$t", 2] } } } } } },
    { $group: { _id: "$pagina", rageClicks: { $sum: "$rageClicksDetectados" } } },
    { $project: { _id: 0, pagina: "$_id", rageClicks: 1 } }
  ]).toArray();
}

async function calcularTiempoPromedioPagina(db, siteId, fechaDesde) {
  return await db.collection("sesiones").aggregate([
    { $match: { siteId: siteId, Fin: { $exists: true, $ne: null }, revisado: condRevisado(fechaDesde) } },
    { $project: { paginas: "$rutas.pagina", timestamps: { $concatArrays: ["$rutas.timestamp", ["$Fin"]] } } },
    {
      $project: {
        pares: {
          $map: {
            input: { $range: [0, { $size: "$paginas" }] },
            as: "i",
            in: {
              pagina: { $arrayElemAt: ["$paginas", "$$i"] },
              duracionSegundos: { $divide: [{ $subtract: [{ $arrayElemAt: ["$timestamps", { $add: ["$$i", 1] }] }, { $arrayElemAt: ["$timestamps", "$$i"] }] }, 1000] }
            }
          }
        }
      }
    },
    { $unwind: "$pares" },
    { $group: { _id: "$pares.pagina", tiempoPromedioPagina: { $avg: "$pares.duracionSegundos" } } },
    { $project: { _id: 0, pagina: "$_id", tiempoPromedioPagina: 1 } }
  ]).toArray();
}

// ============================================================
// ================= MÉTRICAS DE FORMULARIO =======================
// ============================================================

async function calcularTasaAbandonoFormulario(db, siteId, fechaDesde) {
  return await db.collection("formularios").aggregate([
    { $match: { siteId: siteId, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: "$id_formulario", total: { $sum: 1 }, abandonados: { $sum: { $cond: [{ $eq: ["$completado", false] }, 1, 0] } } } },
    { $project: { _id: 0, formId: "$_id", tasaAbandono: { $divide: ["$abandonados", "$total"] } } }
  ]).toArray();
}

async function calcularCampoAbandono(db, siteId, fechaDesde) {
  return await db.collection("formularios").aggregate([
    { $match: { siteId: siteId, completado: false, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: { formId: "$id_formulario", campo: "$ultimoCampoCompleto" }, cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
    { $group: { _id: "$_id.formId", campoAbandonoMasComun: { $first: "$_id.campo" } } },
    { $project: { _id: 0, formId: "$_id", campoAbandonoMasComun: 1 } }
  ]).toArray();
}

async function calcularTiempoCompletadoFormulario(db, siteId, fechaDesde) {
  return await db.collection("formularios").aggregate([
    { $match: { siteId: siteId, completado: true, Fin: { $exists: true, $ne: null }, revisado: condRevisado(fechaDesde) } },
    { $project: { id_formulario: 1, duracionSegundos: { $divide: [{ $subtract: ["$Fin", "$Inicio"] }, 1000] } } },
    { $group: { _id: "$id_formulario", tiempoPromedioCompletado: { $avg: "$duracionSegundos" } } },
    { $project: { _id: 0, formId: "$_id", tiempoPromedioCompletado: 1 } }
  ]).toArray();
}

// ============================================================
// =================== MÉTRICAS DE SITIO =========================
// ============================================================

async function calcularUsuariosNuevosRecurrentes(db, siteId) {
  const r = await db.collection("usuarios").aggregate([
    { $match: { siteId: siteId } },
    { $group: { _id: null, usuariosNuevos: { $sum: { $cond: [{ $eq: ["$totalSesiones", 1] }, 1, 0] } }, usuariosRecurrentes: { $sum: { $cond: [{ $gt: ["$totalSesiones", 1] }, 1, 0] } } } }
  ]).toArray();
  return r[0] || { usuariosNuevos: 0, usuariosRecurrentes: 0 };
}

async function calcularTotalUsuarios(db, siteId) {
  const total = await db.collection("usuarios").countDocuments({ siteId: siteId });
  return { totalUsuarios: total };
}

async function calcularTasaRebote(db, siteId, fechaDesde) {
  const r = await db.collection("sesiones").aggregate([
    { $match: { siteId: siteId, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: null, total: { $sum: 1 }, rebotes: { $sum: { $cond: [{ $eq: ["$esRebote", true] }, 1, 0] } } } },
    { $project: { _id: 0, tasaRebote: { $divide: ["$rebotes", "$total"] } } }
  ]).toArray();
  return r[0] || { tasaRebote: null };
}

async function calcularPaginasPorSesion(db, siteId, fechaDesde) {
  const r = await db.collection("sesiones").aggregate([
    { $match: { siteId: siteId, revisado: condRevisado(fechaDesde) } },
    { $project: { cantidadPaginas: { $size: "$rutas" } } },
    { $group: { _id: null, paginasPorSesionPromedio: { $avg: "$cantidadPaginas" } } }
  ]).toArray();
  return r[0] ? { paginasPorSesionPromedio: r[0].paginasPorSesionPromedio } : { paginasPorSesionPromedio: null };
}

async function calcularDuracionSesionPromedio(db, siteId, fechaDesde) {
  const r = await db.collection("sesiones").aggregate([
    { $match: { siteId: siteId, duracionSesion: { $exists: true, $ne: null }, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: null, duracionSesionPromedio: { $avg: "$duracionSesion" } } }
  ]).toArray();
  return r[0] ? { duracionSesionPromedio: r[0].duracionSesionPromedio } : { duracionSesionPromedio: null };
}

async function calcularConversion(db, siteId, fechaDesde) {
  const subtiposConversion = ["compra", "suscripcion", "agregar_carrito", "contacto"];

  const r = await db.collection("sesiones").aggregate([
    { $match: { siteId: siteId, revisado: condRevisado(fechaDesde) } },
    {
      $project: {
        inicio: 1,
        eventoConversion: { $filter: { input: { $ifNull: ["$eventosClave", []] }, as: "e", cond: { $in: ["$$e.subtipo", subtiposConversion] } } }
      }
    },
    {
      $project: {
        convirtio: { $gt: [{ $size: "$eventoConversion" }, 0] },
        tiempoConversion: {
          $cond: [
            { $gt: [{ $size: "$eventoConversion" }, 0] },
            { $divide: [{ $subtract: [{ $arrayElemAt: ["$eventoConversion.timestamp", 0] }, "$inicio"] }, 1000] },
            null
          ]
        }
      }
    },
    { $group: { _id: null, totalSesiones: { $sum: 1 }, sesionesConvertidas: { $sum: { $cond: ["$convirtio", 1, 0] } }, tiempoConversionPromedio: { $avg: "$tiempoConversion" } } },
    { $project: { _id: 0, tasaConversion: { $divide: ["$sesionesConvertidas", "$totalSesiones"] }, tiempoConversionPromedio: 1 } }
  ]).toArray();

  return r[0] || { tasaConversion: null, tiempoConversionPromedio: null };
}

async function calcularDispositivoHabitual(db, siteId, fechaDesde) {
  const r = await db.collection("sesiones").aggregate([
    { $match: { siteId: siteId, is_mobile: { $exists: true, $ne: null }, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: "$is_mobile", cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
    { $limit: 1 }
  ]).toArray();
  return r[0] ? { is_mobileHabitual: r[0]._id } : { is_mobileHabitual: null };
}

async function calcularTotalSesiones(db, siteId, fechaDesde) {
  const total = await db.collection("sesiones").countDocuments({ siteId: siteId, revisado: condRevisado(fechaDesde) });
  return { totalSesiones: total };
}

async function calcularPaginasHabituales(db, siteId, fechaDesde) {
  const coleccion = db.collection("sesiones");

  const ingreso = await coleccion.aggregate([
    { $match: { siteId: siteId, paginaInicio: { $exists: true, $ne: null }, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: "$paginaInicio", cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
    { $limit: 1 }
  ]).toArray();

  const abandono = await coleccion.aggregate([
    { $match: { siteId: siteId, paginaAbandono: { $exists: true, $ne: null }, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: "$paginaAbandono", cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
    { $limit: 1 }
  ]).toArray();

  return {
    paginaInicioHabitual: ingreso[0] ? ingreso[0]._id : null,
    paginaAbandonoHabitual: abandono[0] ? abandono[0]._id : null
  };
}

async function calcularGeoHabitual(db, siteId, fechaDesde) {
  const r = await db.collection("sesiones").aggregate([
    { $match: { siteId: siteId, "geo.pais": { $exists: true, $ne: null }, revisado: condRevisado(fechaDesde) } },
    { $group: { _id: "$geo.pais", cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
    { $limit: 1 }
  ]).toArray();
  return { paisHabitual: r[0] ? r[0]._id : null };
}

// ============================================================
// ============ ENSAMBLADO DEL DOCUMENTO POR SITIO ================
// ============================================================

function mergeEnMapa(mapa, filas, clave) {
  for (const fila of filas) {
    const key = fila[clave];
    const actual = mapa.get(key) || {};
    mapa.set(key, { ...actual, ...fila });
  }
}

async function construirDocumentoSitio(db, siteId, fechaDesde) {
  // ---- Páginas y elementos ----
  const [pageviews, scrollDepth, clicksMuertos, hovers, rageClicks, tiempoPagina] = await Promise.all([
    calcularPageviews(db, siteId, fechaDesde),
    calcularScrollDepth(db, siteId, fechaDesde),
    calcularClicksMuertos(db, siteId, fechaDesde),
    calcularHoverPromedio(db, siteId, fechaDesde),
    calcularRageClicks(db, siteId, fechaDesde),
    calcularTiempoPromedioPagina(db, siteId, fechaDesde)
  ]);

  const mapaPaginas = new Map();
  mergeEnMapa(mapaPaginas, pageviews, "pagina");
  mergeEnMapa(mapaPaginas, scrollDepth, "pagina");
  mergeEnMapa(mapaPaginas, clicksMuertos, "pagina");
  mergeEnMapa(mapaPaginas, rageClicks, "pagina");
  mergeEnMapa(mapaPaginas, tiempoPagina, "pagina");

  // elementos (hover) se agrupan por página antes de anidarlos
  const elementosPorPagina = new Map();
  for (const h of hovers) {
    const lista = elementosPorPagina.get(h.pagina) || [];
    lista.push({ elemento: h.elemento, goal: h.goal, hoverPromedio: h.hoverPromedio });
    elementosPorPagina.set(h.pagina, lista);
  }

  const metricas_paginas = [];
  for (const [pagina, datos] of mapaPaginas.entries()) {
    metricas_paginas.push({
      ...datos,
      elementos: elementosPorPagina.get(pagina) || []
    });
  }
  // páginas que solo tuvieron hover y ninguna otra métrica (caso borde)
  for (const [pagina, elementos] of elementosPorPagina.entries()) {
    if (!mapaPaginas.has(pagina)) {
      metricas_paginas.push({ pagina, elementos });
    }
  }

  // ---- Formularios ----
  const [tasaAbandonoForm, campoAbandono, tiempoCompletado] = await Promise.all([
    calcularTasaAbandonoFormulario(db, siteId, fechaDesde),
    calcularCampoAbandono(db, siteId, fechaDesde),
    calcularTiempoCompletadoFormulario(db, siteId, fechaDesde)
  ]);

  const mapaFormularios = new Map();
  mergeEnMapa(mapaFormularios, tasaAbandonoForm, "formId");
  mergeEnMapa(mapaFormularios, campoAbandono, "formId");
  mergeEnMapa(mapaFormularios, tiempoCompletado, "formId");
  const metricas_formularios = Array.from(mapaFormularios.values());

  // ---- Métricas de sitio ----
  const [
    usuariosNR, totalUsuarios, tasaRebote, paginasPorSesion,
    duracionSesion, conversion, dispositivoHabitual,
    totalSesiones, paginasHabituales, geoHabitual
  ] = await Promise.all([
    calcularUsuariosNuevosRecurrentes(db, siteId),
    calcularTotalUsuarios(db, siteId),
    calcularTasaRebote(db, siteId, fechaDesde),
    calcularPaginasPorSesion(db, siteId, fechaDesde),
    calcularDuracionSesionPromedio(db, siteId, fechaDesde),
    calcularConversion(db, siteId, fechaDesde),
    calcularDispositivoHabitual(db, siteId, fechaDesde),
    calcularTotalSesiones(db, siteId, fechaDesde),
    calcularPaginasHabituales(db, siteId, fechaDesde),
    calcularGeoHabitual(db, siteId, fechaDesde)
  ]);

  return {
    siteId,
    fechaCalculo: new Date(),
    fechaDesde: fechaDesde || null,
    ...usuariosNR,
    ...totalUsuarios,
    ...tasaRebote,
    ...paginasPorSesion,
    ...duracionSesion,
    ...conversion,
    ...dispositivoHabitual,
    ...totalSesiones,
    ...paginasHabituales,
    ...geoHabitual,
    metricas_paginas,
    metricas_formularios
  };
}


// ============================================================
// ====== Metricas de usuario ======
// ============================================================
async function metricas_usuario(db) {
  //Me traigo las colecciones que voy a usar
  const usuarios = db.collection("usuarios");
  const sesiones = db.collection("sesiones");

  //Solo se van a recalcular las metricas de los usuarios que tengan una sesion hace 24 hs
  const hace24hs = new Date(Date.now() - 24 * 60 * 60 * 1000);
  //Esto es un pequeño salvaguarda, si no hay users nuevos, no se recalcula nada
  const activos = await sesiones.aggregate([
    { $match: { inicio: { $gte: hace24hs } } },
    { $group: { _id: { siteId: "$siteId", userId: "$userId" } } }
  ]).toArray();

  if (activos.length === 0) {
    console.log("CRON METRICAS: sin usuarios activos en las últimas 24hs");
    return;
  }

  //Me guardo los id de los usuarios activos del sitio
  const clavesActivas = activos.map(a => `${a._id.siteId}_${a._id.userId}`);

  //Esto es una agregacion que se hizo despues, despues lo explico bien en la docu
  
  //primero, vamos con las metricas "totales"
  const totales = await sesiones.aggregate([

    { $match: { Fin: { $exists: true } } }, //solo agarro las que terminaron
    { $addFields: { claveUsuario: { $concat: ["$siteId", "_", "$userId"] } } }, //aca me sirve el mapa, es para matchear con las claves de usuario que armo lucas
    { $match: { claveUsuario: { $in: clavesActivas } } }, //y busco por eso que arme
    {
      $addFields: {
        cantidadPaginas: { $size: { $ifNull: ["$rutas", []] } }, //contador de rutas en  las sesiones que tuvo
        tuvoConversion: { $gt: [{ $size: { $ifNull: ["$eventosClave", []] } }, 0] }, // esto me va a servir para varias cosas
        tuvoCarrito: {$in: ["agregar_carrito", { $ifNull: ["$eventosClave.subtipo", []] }]},
        tuvoCompra: {$in: ["compra", { $ifNull: ["$eventosClave.subtipo", []] }]}
      }
    },
    {
      $group: {
        _id: { siteId: "$siteId", userId: "$userId" }, 
        totalSesiones: { $sum: 1 },
        duracionPromedio: { $avg: "$duracionSesion" }, 
        tasaRebote: { $avg: { $cond: ["$esRebote", 1, 0] } },
        paginasPorSesionPromedio: { $avg: "$cantidadPaginas" },
        tasaConversion: { $avg: { $cond: ["$tuvoConversion", 1, 0] } },
        sesionesConCarrito: { $sum: { $cond: ["$tuvoCarrito", 1, 0] } },
        sesionesAbandonoCarrito: { $sum: { $cond: [{ $and: ["$tuvoCarrito", { $not: ["$tuvoCompra"] }] }, 1, 0] } },
        usuarioMobile: { $first: "$is_mobile" },
        primeraSesion: { $min: "$inicio" },
        ultimaSesion: { $max: "$inicio" }
      }
    },
    {
      $addFields: {
        diasActivo: { $ceil: { $divide: [{ $subtract: ["$ultimaSesion", "$primeraSesion"] }, 1000 * 60 * 60 * 24] } }
      },
    },
    {
      $addFields: {
        frecuenciaRecurrencia: {
          $cond: [{ $eq: ["$diasActivo", 0] }, 0, { $divide: ["$totalSesiones", "$diasActivo"] }] //frecuencia de recurrencia
        },
        tasaAbandonoCarrito: {
          $cond: [{ $eq: ["$sesionesConCarrito", 0] }, 0, { $divide: ["$sesionesAbandonoCarrito", "$sesionesConCarrito"] }]
        }
      }
    },
    {
      $project: {
        sesionesConCarrito: 0,
        sesionesAbandonoCarrito: 0
      }
    }
  ]).toArray(); // lo metemos en un array a todo esto

  //todoooo esto es para calcular el origen predominante, esto nos sirve para saber si es que siempre
  //entran por otra pag, o entran directo
  const origenes = await sesiones.aggregate([
    { $addFields: { claveUsuario: { $concat: ["$siteId", "_", "$userId"] } } }, //
    { $match: { claveUsuario: { $in: clavesActivas } } },
    { $group: { _id: { siteId: "$siteId", userId: "$userId", referrer: "$referrer" }, cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
    { $group: { _id: { siteId: "$_id.siteId", userId: "$_id.userId" }, origenPredominante: { $first: "$_id.referrer" } } }
  ]).toArray();

  //y ahora van las metricas de interaccion promedio
  //y tiempo hasta conversion
  const interacciones = await sesiones.aggregate([
    { $match: { Fin: { $exists: true } } },
    { $addFields: { claveUsuario: { $concat: ["$siteId", "_", "$userId"] } } },
    { $match: { claveUsuario: { $in: clavesActivas } } },
    {
      $lookup: {
        from: "eventos",
        let: { site: "$siteId", session: "$sessionId" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$metadata.siteId", "$$site"] },
            { $eq: ["$metadata.sessionId", "$$session"] }
          ] } } }
        ],
        as: "eventosSesion"
      }
    },
    {
      $addFields: {
        cantidadInteracciones: {
          $size: {
            $filter: {
              input: "$eventosSesion",
              cond: { $in: ["$$this.metadata.tipo", ["click", "hover", "scroll"]] }
            }
          }
        },
        primerObjetivo: {
          $min: {
            $map: {
              input: { $filter: { input: "$eventosSesion", cond: { $eq: ["$$this.metadata.tipo", "objetivo"] } } },
              as: "e",
              in: "$$e.timestamp"
            }
          }
        }
      }
    },
    {
      $addFields: {
        tiempoHastaConversionSesion: {
          $cond: [{ $eq: ["$primerObjetivo", null] }, null, { $subtract: ["$primerObjetivo", "$inicio"] }]
        }
      }
    },
    {
      $group: {
        _id: { siteId: "$siteId", userId: "$userId" },
        interaccionesPromedio: { $avg: "$cantidadInteracciones" },
        tiempoHastaConversion: { $avg: "$tiempoHastaConversionSesion"}
      }
    }
  ]).toArray();

  //y ahora va toda una logica para matchear con un mapa 
  //las que van en usuario o no
  const mapa = new Map();

  for (const t of totales) {
    const key = `${t._id.siteId}_${t._id.userId}`;
    const { _id, ...resto } = t;
    mapa.set(key, resto);
  }
  for (const o of origenes) {
    const key = `${o._id.siteId}_${o._id.userId}`;
    mapa.set(key, { ...(mapa.get(key) || {}), origenPredominante: o.origenPredominante });
  }
  for (const i of interacciones) {
    const key = `${i._id.siteId}_${i._id.userId}`;
    mapa.set(key, { ...(mapa.get(key) || {}), interaccionesPromedio: i.interaccionesPromedio, tiempoHastaConversion: i.tiempoHastaConversion });
  }

  //aca hago los update de las metricas
  const operaciones = [];
  for (const [idDoc, metricas] of mapa.entries()) {
    operaciones.push({
      updateOne: {
        filter: { _id: idDoc },
        update: { $set: { metricas } }
      }
    });
  }

  //Pequeño if, para saber cuantos actualize
  if (operaciones.length > 0) {
    const resultado = await usuarios.bulkWrite(operaciones);
    console.log(`CRON METRICAS: ${resultado.modifiedCount} usuario(s) actualizado(s)`);
  }

}

// ============================================================
// ======================= FUNCIÓN PRINCIPAL ========================
// ============================================================

async function procesarMetricas() {
  await client.connect();
  console.log("CRON PROCESAMIENTO: Conectado a MongoDB");

  const db = client.db("PruebaBBDD");
  await db.collection("metricas_resumen").createIndex({ siteId: 1, fechaCalculo: -1 });

  const sitios = await obtenerSitios(db);

  for (const siteId of sitios) {
    const fechaDesde = await obtenerFechaUltimoCalculo(db, siteId);
    const documento = await construirDocumentoSitio(db, siteId, fechaDesde);
    await db.collection("metricas_resumen").insertOne(documento);
    console.log(`PROCESAMIENTO: snapshot generado para ${siteId} (desde ${fechaDesde || "el origen"})`);
  }

  await metricas_usuario(db);

  await client.close();
}

cron.schedule('*/10 * * * *', procesarMetricas);

// Para pruebas manuales:
// procesarMetricas();