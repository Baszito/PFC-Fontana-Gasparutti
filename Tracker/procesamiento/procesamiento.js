const cron = require('node-cron');
const mongo = require('mongodb');

const uri = "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);

// ============================================================
// ==================== HISTORIAL ==============================
// ============================================================

async function archivarTodo(db) {
  const docs = await db.collection("metricas_resumen").find().toArray();
  for (const doc of docs) {
    await db.collection("metricas_historial").replaceOne(
      { _id: doc._id },
      doc,
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: ${docs.length} métrica(s) archivada(s) en metricas_historial`);
}

// ============================================================
// ============ PageViews - Por página y sitio =================
// ============================================================

async function calcularPageviews(db) {
  const resultados = await db.collection("eventos").aggregate([
    { $match: { "metadata.tipo": "pageview", revisado: { $exists: true } } },
    { $group: { _id: { siteId: "$metadata.siteId", pagina: "$metadata.pagina" }, totalPageviews: { $sum: 1 } } }
  ]).toArray();

  for (const r of resultados) {
    const idDoc = r._id.siteId + "_" + r._id.pagina.replace(/\//g, "");
    await db.collection("metricas_resumen").updateOne(
      { _id: idDoc },
      { $set: { siteId: r._id.siteId, nivel: "pagina", pagina: r._id.pagina, pageviews: r.totalPageviews, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: pageviews calculados (${resultados.length} pagina(s))`);
}

// ============================================================
// ====== ScrollDepth promedio - Por página y sitio =============
// ============================================================

async function calcularScrollDepth(db) {
  const resultados = await db.collection("eventos").aggregate([
    { $match: { "metadata.tipo": "scroll", revisado: { $exists: true } } },
    { $group: { _id: { siteId: "$metadata.siteId", pagina: "$metadata.pagina" }, scrollDepthPromedio: { $avg: "$metadata.valor" } } }
  ]).toArray();

  for (const r of resultados) {
    const idDoc = r._id.siteId + "_" + r._id.pagina.replace(/\//g, "");
    await db.collection("metricas_resumen").updateOne(
      { _id: idDoc },
      { $set: { scrollDepthPromedio: r.scrollDepthPromedio } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: scrollDepth promedio calculado`);
}

// ============================================================
// ========= Clicks muertos por pagina y sitio ==================
// ============================================================

async function calcularClicksMuertos(db) {
  const resultados = await db.collection("eventos").aggregate([
    { $match: { "metadata.tipo": "click", "metadata.elemento": '', revisado: { $exists: true } } },
    { $group: { _id: { siteId: "$metadata.siteId", pagina: "$metadata.pagina" }, clicksMuertos: { $sum: 1 } } }
  ]).toArray();

  for (const r of resultados) {
    const idDoc = r._id.siteId + "_" + r._id.pagina.replace(/\//g, "");
    await db.collection("metricas_resumen").updateOne(
      { _id: idDoc },
      { $set: { clicksMuertos: r.clicksMuertos } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: clicks muertos calculados`);
}

// ============================================================
// ======= Hover promedio por elemento por sitio =================
// ============================================================

async function calcularHoverPromedio(db) {
  const resultados = await db.collection("eventos").aggregate([
    { $match: { "metadata.tipo": "hover", revisado: { $exists: true } } },
    { $group: { _id: { siteId: "$metadata.siteId", pagina: "$metadata.pagina", elemento: "$metadata.elemento", goal: "$metadata.goal"}, hoverPromedio: { $avg: "$metadata.duracion" } } }
  ]).toArray();

  for (const r of resultados) {
    const idDoc = r._id.siteId + "_" + r._id.pagina + "_" + r._id.elemento;
    await db.collection("metricas_resumen").updateOne(
      { _id: idDoc },
      { $set: { hoverPromedio: r.hoverPromedio, goal: r._id.goal } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: hover promedio calculado`);
}

// ============================================================
// ========= RageClicks por página por sitio =====================
// ============================================================

async function calcularRageClicks(db) {
  const ventanaSegundos = 1.5;

  const resultados = await db.collection("eventos").aggregate([
    { $match: { "metadata.tipo": "click", revisado: { $exists: true } } },
    { $sort: { timestamp: 1 } },
    {
      $group: {
        _id: { siteId: "$metadata.siteId", sessionId: "$metadata.sessionId", elemento: "$metadata.elemento", pagina: "$metadata.pagina" },
        timestamps: { $push: "$timestamp" }
      }
    },
    {
      $project: {
        siteId: "$_id.siteId",
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
    { $project: { siteId: 1, pagina: 1, todosLosClusters: { $concatArrays: ["$clusters.clustersCompletos", [{ $size: "$clusters.clusterActual" }]] } } },
    { $project: { siteId: 1, pagina: 1, rageClicksDetectados: { $size: { $filter: { input: "$todosLosClusters", as: "t", cond: { $gte: ["$$t", 2] } } } } } },
    { $group: { _id: { siteId: "$siteId", pagina: "$pagina" }, totalRageClicks: { $sum: "$rageClicksDetectados" } } }
  ]).toArray();

  for (const r of resultados) {
    const idDoc = r._id.siteId + "_" + r._id.pagina.replace(/\//g, "");
    await db.collection("metricas_resumen").updateOne(
      { _id: idDoc },
      { $set: { siteId: r._id.siteId, nivel: "pagina", pagina: r._id.pagina, rageClicks: r.totalRageClicks, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: rageClicks calculados`);
}

// ============================================================
// ==== Tiempo promedio de sesiones en páginas por sitio =========
// ============================================================

async function calcularTiempoPromedioPagina(db) {
  const resultados = await db.collection("sesiones").aggregate([
    { $match: { Fin: { $exists: true, $ne: null }, revisado: { $exists: true } } },
    { $project: { siteId: 1, paginas: "$rutas.pagina", timestamps: { $concatArrays: ["$rutas.timestamp", ["$Fin"]] } } },
    {
      $project: {
        siteId: 1,
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
    { $group: { _id: { siteId: "$siteId", pagina: "$pares.pagina" }, tiempoPromedioPagina: { $avg: "$pares.duracionSegundos" } } }
  ]).toArray();

  for (const r of resultados) {
    const idDoc = r._id.siteId + "_" + r._id.pagina.replace(/\//g, "");
    await db.collection("metricas_resumen").updateOne(
      { _id: idDoc },
      { $set: { siteId: r._id.siteId, nivel: "pagina", pagina: r._id.pagina, tiempoPromedioPagina: r.tiempoPromedioPagina, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: tiempo promedio por página calculado`);
}

// ============================================================
// ======= Tasa de abandono por formulario por sitio ============
// ============================================================

async function calcularTasaAbandonoFormulario(db) {
  const resultados = await db.collection("formularios").aggregate([
    { $match: { revisado: { $exists: true } } },
    { $group: { _id: { siteId: "$siteId", formId: "$id_formulario" }, total: { $sum: 1 }, abandonados: { $sum: { $cond: [{ $eq: ["$completado", false] }, 1, 0] } } } },
    { $project: { siteId: "$_id.siteId", formId: "$_id.id_formulario", tasaAbandono: { $divide: ["$abandonados", "$total"] } } }
  ]).toArray();

  for (const r of resultados) {
    const idDoc = r.siteId + "_" + r.formId;
    await db.collection("metricas_resumen").updateOne(
      { _id: idDoc },
      { $set: { siteId: r.siteId, nivel: "formulario", formId: r.formId, tasaAbandono: r.tasaAbandono, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: tasa de abandono de formularios calculada`);
}

// ============================================================
// ===== Campo de mayor abandono por formulario por sitio ========
// ============================================================

async function calcularCampoAbandono(db) {
  const resultados = await db.collection("formularios").aggregate([
    { $match: { completado: false, revisado: { $exists: true } } },
    { $group: { _id: { siteId: "$siteId", formId: "$id_formulario", campo: "$ultimoCampoCompleto" }, cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
    { $group: { _id: { siteId: "$_id.siteId", formId: "$_id.id_formulario" }, campoAbandonoMasComun: { $first: "$_id.campo" } } }
  ]).toArray();

  for (const r of resultados) {
    const idDoc = r._id.siteId + "_" + r._id.formId;
    await db.collection("metricas_resumen").updateOne(
      { _id: idDoc },
      { $set: { siteId: r._id.siteId, nivel: "formulario", formId: r._id.formId, campoAbandonoMasComun: r.campoAbandonoMasComun, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: campo de mayor abandono calculado`);
}

// ============================================================
// == Tiempo de completado promedio por formulario por sitio ======
// ============================================================

async function calcularTiempoCompletadoFormulario(db) {
  const resultados = await db.collection("formularios").aggregate([
    { $match: { completado: true, Fin: { $exists: true, $ne: null }, revisado: { $exists: true } } },
    { $project: { siteId: 1, formId: 1, duracionSegundos: { $divide: [{ $subtract: ["$Fin", "$Inicio"] }, 1000] } } },
    { $group: { _id: { siteId: "$siteId", formId: "$id_formulario" }, tiempoPromedioCompletado: { $avg: "$duracionSegundos" } } }
  ]).toArray();

  for (const r of resultados) {
    const idDoc = r._id.siteId + "_" + r._id.formId;
    await db.collection("metricas_resumen").updateOne(
      { _id: idDoc },
      { $set: { siteId: r._id.siteId, nivel: "formulario", formId: r._id.formId, tiempoPromedioCompletado: r.tiempoPromedioCompletado, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: tiempo promedio de completado calculado`);
}

// ============================================================
// ======= Usuarios nuevos y recurrentes por sitio ==============
// ============================================================

async function calcularUsuariosNuevosRecurrentes(db) {
  const resultados = await db.collection("usuarios").aggregate([
    { $group: { _id: "$siteId", usuariosNuevos: { $sum: { $cond: [{ $eq: ["$totalSesiones", 1] }, 1, 0] } }, usuariosRecurrentes: { $sum: { $cond: [{ $gt: ["$totalSesiones", 1] }, 1, 0] } } } }
  ]).toArray();

  for (const r of resultados) {
    await db.collection("metricas_resumen").updateOne(
      { _id: r._id },
      { $set: { siteId: r._id, nivel: "sitio", usuariosNuevos: r.usuariosNuevos, usuariosRecurrentes: r.usuariosRecurrentes, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: usuarios nuevos/recurrentes calculados`);
}

// ============================================================
// ============= Tasa de rebote de sesiones por sitio ============
// ============================================================

async function calcularTasaRebote(db) {
  const resultados = await db.collection("sesiones").aggregate([
    { $match: { revisado: { $exists: true } } },
    { $group: { _id: "$siteId", total: { $sum: 1 }, rebotes: { $sum: { $cond: [{ $eq: ["$esRebote", true] }, 1, 0] } } } },
    { $project: { tasaRebote: { $divide: ["$rebotes", "$total"] } } }
  ]).toArray();

  for (const r of resultados) {
    await db.collection("metricas_resumen").updateOne(
      { _id: r._id },
      { $set: { siteId: r._id, nivel: "sitio", tasaRebote: r.tasaRebote, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: tasa de rebote calculada`);
}

// ============================================================
// ============ Paginas promedio por sesión por sitio ============
// ============================================================

async function calcularPaginasPorSesion(db) {
  const resultados = await db.collection("sesiones").aggregate([
    { $match: { revisado: { $exists: true } } },
    { $project: { siteId: 1, cantidadPaginas: { $size: "$rutas" } } },
    { $group: { _id: "$siteId", paginasPorSesionPromedio: { $avg: "$cantidadPaginas" } } }
  ]).toArray();

  for (const r of resultados) {
    await db.collection("metricas_resumen").updateOne(
      { _id: r._id },
      { $set: { siteId: r._id, nivel: "sitio", paginasPorSesionPromedio: r.paginasPorSesionPromedio, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: páginas promedio por sesión calculado`);
}

// ============================================================
// =========== Duración promedio de sesión por sitio =============
// ============================================================

async function calcularDuracionSesionPromedio(db) {
  const resultados = await db.collection("sesiones").aggregate([
    { $match: { duracionSesion: { $exists: true, $ne: null }, revisado: { $exists: true } } },
    { $group: { _id: "$siteId", duracionSesionPromedio: { $avg: "$duracionSesion" } } }
  ]).toArray();

  for (const r of resultados) {
    await db.collection("metricas_resumen").updateOne(
      { _id: r._id },
      { $set: { siteId: r._id, nivel: "sitio", duracionSesionPromedio: r.duracionSesionPromedio, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: duración promedio de sesión calculada`);
}

// ============================================================
// == Tasa de conversión y tiempo de conversión promedio ==========
// ============================================================

async function calcularConversion(db) {
  const subtiposConversion = ["compra", "suscripcion", "agregar_carrito", "contacto"];

  const resultados = await db.collection("sesiones").aggregate([
    { $match: { revisado: { $exists: true } } },
    {
      $project: {
        siteId: 1,
        inicio: 1,
        eventoConversion: { $filter: { input: { $ifNull: ["$eventosClave", []] }, as: "e", cond: { $in: ["$$e.subtipo", subtiposConversion] } } }
      }
    },
    {
      $project: {
        siteId: 1,
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
    { $group: { _id: "$siteId", totalSesiones: { $sum: 1 }, sesionesConvertidas: { $sum: { $cond: ["$convirtio", 1, 0] } }, tiempoConversionPromedio: { $avg: "$tiempoConversion" } } },
    { $project: { tasaConversion: { $divide: ["$sesionesConvertidas", "$totalSesiones"] }, tiempoConversionPromedio: 1 } }
  ]).toArray();

  for (const r of resultados) {
    await db.collection("metricas_resumen").updateOne(
      { _id: r._id },
      { $set: { siteId: r._id, nivel: "sitio", tasaConversion: r.tasaConversion, tiempoConversionPromedio: r.tiempoConversionPromedio, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: tasa/tiempo de conversión calculados`);
}

// ============================================================
// ========= Dispositivo habitual de sesiones por sitio ===========
// ============================================================

async function calcularDispositivoHabitual(db) {
  const resultados = await db.collection("sesiones").aggregate([
    { $match: { is_mobile: { $exists: true, $ne: null }, revisado: { $exists: true } } },
    { $group: { _id: { siteId: "$siteId", is_mobile: "$is_mobile" }, cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
    { $group: { _id: "$_id.siteId", is_mobileHabitual: { $first: "$_id.is_mobile" } } }
  ]).toArray();

  for (const r of resultados) {
    await db.collection("metricas_resumen").updateOne(
      { _id: r._id },
      { $set: { siteId: r._id, nivel: "sitio", is_mobileHabitual: r.is_mobileHabitual, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: dispositivo habitual calculado`);
}

// ============================================================
// ============== Total de usuarios por sitio =================
// ============================================================
async function calcularTotalUsuarios(db) {
  const resultados = await db.collection("usuarios").aggregate([
    { $group: { _id: "$siteId", totalUsuarios: { $sum: 1 } } }
  ]).toArray();

  for (const r of resultados) {
    await db.collection("metricas_resumen").updateOne(
      { _id: r._id },
      { $set: { siteId: r._id, nivel: "sitio", totalUsuarios: r.totalUsuarios, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: total de usuarios calculado`);
}


// ============================================================
// ============= Total de sesiones por sitio ==================
// ============================================================
async function calcularTotalSesiones(db) {
  const resultados = await db.collection("sesiones").aggregate([
    { $match: { revisado: { $exists: true } } },
    { $group: { _id: "$siteId", totalSesiones: { $sum: 1 } } }
  ]).toArray();

  for (const r of resultados) {
    await db.collection("metricas_resumen").updateOne(
      { _id: r._id },
      { $set: { siteId: r._id, nivel: "sitio", totalSesiones: r.totalSesiones, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: total de sesiones calculado`);
}

// ============================================================
// === Pagina de ingreso y abandono más frecuente por sitio ===
// ============================================================
async function calcularPaginasHabituales(db) {
  const coleccion = db.collection("sesiones");

  const ingreso = await coleccion.aggregate([
    { $match: { paginaInicio: { $exists: true, $ne: null }, revisado: { $exists: true } } },
    { $group: { _id: { siteId: "$siteId", pagina: "$paginaInicio" }, cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
    { $group: { _id: "$_id.siteId", paginaInicioHabitual: { $first: "$_id.pagina" } } }
  ]).toArray();

  for (const r of ingreso) {
    await db.collection("metricas_resumen").updateOne(
      { _id: r._id },
      { $set: { siteId: r._id, nivel: "sitio", paginaInicioHabitual: r.paginaInicioHabitual, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }

  const abandono = await coleccion.aggregate([
    { $match: { paginaAbandono: { $exists: true, $ne: null }, revisado: { $exists: true } } },
    { $group: { _id: { siteId: "$siteId", pagina: "$paginaAbandono" }, cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
    { $group: { _id: "$_id.siteId", paginaAbandonoHabitual: { $first: "$_id.pagina" } } }
  ]).toArray();

  for (const r of abandono) {
    await db.collection("metricas_resumen").updateOne(
      { _id: r._id },
      { $set: { siteId: r._id, nivel: "sitio", paginaAbandonoHabitual: r.paginaAbandonoHabitual, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: páginas de ingreso/abandono habituales calculadas`);
}

// ============================================================
// ====== Disposición geográfica más frecuente por sitio ======
// ============================================================
// Nota: se toma "pais" como criterio principal. Ajustar a provincia/ciudad si se prefiere otro nivel de detalle.
async function calcularGeoHabitual(db) {
  const resultados = await db.collection("sesiones").aggregate([
    { $match: { "geo.pais": { $exists: true, $ne: null }, revisado: { $exists: true } } },
    { $group: { _id: { siteId: "$siteId", pais: "$geo.pais" }, cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
    { $group: { _id: "$_id.siteId", paisHabitual: { $first: "$_id.pais" } } }
  ]).toArray();

  for (const r of resultados) {
    await db.collection("metricas_resumen").updateOne(
      { _id: r._id },
      { $set: { siteId: r._id, nivel: "sitio", paisHabitual: r.paisHabitual, fechaGeneracion: new Date() } },
      { upsert: true }
    );
  }
  console.log(`PROCESAMIENTO: disposición geográfica habitual calculada`);
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
      }
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

  await archivarTodo(db);

  await calcularPageviews(db);
  await calcularScrollDepth(db);
  await calcularClicksMuertos(db);
  await calcularHoverPromedio(db);
  await calcularRageClicks(db);
  await calcularTiempoPromedioPagina(db);

  await calcularTasaAbandonoFormulario(db);
  await calcularCampoAbandono(db);
  await calcularTiempoCompletadoFormulario(db);

  await calcularUsuariosNuevosRecurrentes(db);
  await calcularTasaRebote(db);
  await calcularPaginasPorSesion(db);
  await calcularDuracionSesionPromedio(db);
  await calcularConversion(db);
  await calcularDispositivoHabitual(db);

  await calcularTotalUsuarios(db);
  await calcularTotalSesiones(db);
  await calcularPaginasHabituales(db);
  await calcularGeoHabitual(db);

  await metricas_usuario(db);

  await client.close();
}

// Programación: cada 5 minutos
cron.schedule('*/3 * * * *', procesarMetricas);

// Para pruebas manuales:
// procesarMetricas();