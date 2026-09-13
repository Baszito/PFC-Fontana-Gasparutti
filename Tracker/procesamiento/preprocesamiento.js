const cron = require('node-cron');
const mongo = require('mongodb');

const uri = "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);

//=====================================================================================================
//===================================== LIMPIEZA ======================================================
//=====================================================================================================

function esString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function esStringOpcional(v) {
  return typeof v == "string" || v === null || v === undefined;
}
function esBooleano(v) {
  return typeof v === "boolean";
}
function esFechaValida(v) {
  return v instanceof Date && !isNaN(v.getTime());
}
function esNumero(v) {
  return typeof v === "number" && !isNaN(v);
}
function esArray(v) {
  return Array.isArray(v);
}
function tieneCamposExtra(obj, permitidos) {
  return Object.keys(obj).some(k => !permitidos.includes(k));
}

// ------------------------------
// ---------- SESIONES ----------
// ------------------------------

const LIMITE_MINUTOS_SESION_QUIETA = 2;

async function limpiarSesiones(db) {
  const coleccion = db.collection("sesiones");
  const ahora = new Date();
  const docs = await coleccion.find({ revisado: { $exists: false } }).toArray();

  const CAMPOS_PERMITIDOS_SESIONES = ["_id", "siteId", "userId", "sessionId", "inicio", "is_mobile", "referrer", "rutas", "eventosClave", "geo"];

  const idsInvalidos = [];

  for (const doc of docs) {
    let valido = true;
    const motivos = [];

    if (!esString(doc.siteId)) { valido = false; motivos.push("siteId"); }
    if (!esString(doc.userId)) { valido = false; motivos.push("userId"); }
    if (!esString(doc.sessionId)) { valido = false; motivos.push("sessionId"); }
    if (!esFechaValida(doc.inicio)) { valido = false; motivos.push("inicio"); }
    if (!esBooleano(doc.is_mobile)) { valido = false; motivos.push("isMobile"); }
    if (!esString(doc.referrer)) { valido = false; motivos.push("referrer"); }
    if (!esArray(doc.rutas) || doc.rutas.length == 0) { valido = false; motivos.push("rutas"); }
    if (!esArray(doc.eventosClave)) { valido = false; motivos.push("eventosClave"); }

    if (tieneCamposExtra(doc, CAMPOS_PERMITIDOS_SESIONES)) { valido = false; motivos.push("campos extra detectados"); }

    if (esArray(doc.rutas) && doc.rutas.length > 0) {
      const rutasValidas = doc.rutas.every(r => esString(r.pagina) && esFechaValida(r.timestamp));
      if (!rutasValidas) { valido = false; motivos.push("rutas (estructura)"); }
    }
    if (esArray(doc.eventosClave)) {
      const eventosValidos = doc.eventosClave.every(e => esString(e.tipo) && esFechaValida(e.timestamp));
      if (!eventosValidos) { valido = false; motivos.push("eventosClave (estructura)"); }
    }

    let rutasDesordenadas = false;
    if (valido && esArray(doc.rutas) && doc.rutas.length > 1) {
      for (let i = 1; i < doc.rutas.length; i++) {
        if (doc.rutas[i].timestamp < doc.rutas[i - 1].timestamp) {
          rutasDesordenadas = true;
          break;
        }
      }
      if (rutasDesordenadas) doc.rutas.sort((a, b) => a.timestamp - b.timestamp);
    }

    let eventosDesordenados = false;
    if (valido && esArray(doc.eventosClave) && doc.eventosClave.length > 1) {
      for (let i = 1; i < doc.eventosClave.length; i++) {
        if (doc.eventosClave[i].timestamp < doc.eventosClave[i - 1].timestamp) {
          eventosDesordenados = true;
          break;
        }
      }
      if (eventosDesordenados) doc.eventosClave.sort((a, b) => a.timestamp - b.timestamp);
    }

    let cerrada = false;
    if (valido) {
      let ultimoEvento = await db.collection("eventos").findOne(
        { "metadata.siteId": doc.siteId, "metadata.sessionId": doc.sessionId },
        { sort: { timestamp: -1 } }
      );

      if (!ultimoEvento) {
        console.log(`No se encontró ningún evento para sesión ${doc.sessionId} (siteId: ${doc.siteId})`);
        valido = false;
        motivos.push("sin eventos asociados");
      } else {
        let fechaUltimoEvento = ultimoEvento.timestamp;
        let dif = (ahora - fechaUltimoEvento) / (1000 * 60);
        if (dif >= LIMITE_MINUTOS_SESION_QUIETA) cerrada = true;
      }
    }

    if (!valido) {
      idsInvalidos.push(doc._id);
      console.log(`CRON LIMPIEZA sesiones: descartando ${doc._id} -> ${motivos.join(", ")}`);
    } else {
      const camposActualizar = {};
      if (rutasDesordenadas) camposActualizar.rutas = doc.rutas;
      if (eventosDesordenados) camposActualizar.eventosClave = doc.eventosClave;
      if (cerrada) camposActualizar.revisado = ahora;
      if (Object.keys(camposActualizar).length > 0) {
        await coleccion.updateOne({ _id: doc._id }, { $set: camposActualizar });
      }
    }
  }

  if (idsInvalidos.length > 0) {
    await coleccion.deleteMany({ _id: { $in: idsInvalidos } });
  }
  console.log(`CRON LIMPIEZA sesiones: ${idsInvalidos.length} documento(s) eliminado(s) de ${docs.length}`);

  const sesionesValidas = await coleccion.find({}, { projection: { siteId: 1, sessionId: 1 } }).toArray();
  return new Set(sesionesValidas.map(s => `${s.siteId}_${s.sessionId}`));
}

// ------------------------------
// -------- FORMULARIOS ---------
// ------------------------------
const LIMITE_FORMULARIO_QUIETO = 10;

async function limpiarFormularios(db) {
  const coleccion = db.collection("formularios");
  const ahora = new Date();
  const docs = await coleccion.find({ revisado: { $exists: false } }).toArray();

  const CAMPOS_PERMITIDOS_FORMULARIOS = ["_id", "siteId", "userId", "sessionId", "Inicio", "Fin", "id_formulario", "completado", "camposInteractuados", "ultimoCampoCompleto"];

  const idsInvalidos = [];

  for (const doc of docs) {
    let valido = true;
    const motivos = [];

    if (!esString(doc.siteId)) { valido = false; motivos.push("siteId"); }
    if (!esString(doc.userId)) { valido = false; motivos.push("userId"); }
    if (!esString(doc.sessionId)) { valido = false; motivos.push("sessionId"); }
    if (!esFechaValida(doc.Inicio)) { valido = false; motivos.push("inicio"); }
    if (!esString(doc.id_formulario)) { valido = false; motivos.push("id_formulario"); }
    if (!esBooleano(doc.completado)) { valido = false; motivos.push("completado"); }

    if (tieneCamposExtra(doc, CAMPOS_PERMITIDOS_FORMULARIOS)) { valido = false; motivos.push("campos extra detectados"); }

    if (doc.camposInteractuados !== undefined && doc.camposInteractuados !== null) {
      if (!esArray(doc.camposInteractuados)) {
        valido = false; motivos.push("camposInteractuados (tipo)");
      } else {
        const camposValidos = doc.camposInteractuados.every(c => c.campo !== null && esFechaValida(c.timestamp));
        if (!camposValidos) { valido = false; motivos.push("camposInteractuados (estructura)"); }
      }
    }

    let cerrado = false;
    if (valido) {
      if (!esFechaValida(doc.Fin)) {
        const campos = doc.camposInteractuados || [];
        const ultimoTimestamp = campos.length > 0 ? campos[campos.length - 1].timestamp : null;

        if (ultimoTimestamp !== null) {
          let dif = (ahora - ultimoTimestamp) / (1000 * 60);
          if (dif >= LIMITE_FORMULARIO_QUIETO) cerrado = true;
        } else {
          let dif = (ahora - doc.Inicio) / (1000 * 60);
          if (dif >= LIMITE_FORMULARIO_QUIETO) cerrado = true;
        }
      } else {
        cerrado = true;
      }
    }

    if (!valido) {
      idsInvalidos.push(doc._id);
      console.log(`CRON LIMPIEZA formularios: descartando ${doc._id} -> ${motivos.join(", ")}`);
    } else if (cerrado) {
      await coleccion.updateOne({ _id: doc._id }, { $set: { revisado: ahora } });
    }
  }

  if (idsInvalidos.length > 0) {
    await coleccion.deleteMany({ _id: { $in: idsInvalidos } });
  }
  console.log(`CRON LIMPIEZA formularios: ${idsInvalidos.length} documento(s) eliminado(s) de ${docs.length}`);
}

// ------------------------------
// ----------- EVENTOS ----------
// ------------------------------
// NOTA: "eventos" pasó a ser colección normal (ya no timeseries),
// por eso updateOne/deleteMany por _id funcionan sin restricciones acá.

const CAMPOS_POR_TIPO = {
  pageview: ["pagina"],
  click: ["elemento", "esInteractivo"],
  scroll: ["valor"],
  hover: ["elemento", "duracion", "goal"],
  objetivo: ["subtipo"]
};

const CAMPOS_PERMITIDOS_EVENTO = ["_id", "timestamp", "metadata", "revisado"];
const CAMPOS_BASE_METADATA = ["siteId", "sessionId", "tipo", "pagina"];
const TIPOS_CAMPOS_METADATA = {
  pagina: esString,
  elemento: esStringOpcional,
  goal: esString,
  subtipo: esString,
  esInteractivo: esBooleano,
  valor: esNumero,
  duracion: esNumero
};

function tieneCamposExtraMetadata(metadata, tipo) {
  const permitidos = [...CAMPOS_BASE_METADATA, ...(CAMPOS_POR_TIPO[tipo] || [])];
  return Object.keys(metadata).some(k => !permitidos.includes(k));
}

function metadataValida(tipo, metadata) {
  const campos = CAMPOS_POR_TIPO[tipo];
  if (!campos) return false;
  return campos.every(c => {
    if (metadata[c] === undefined || metadata[c] === null) return false;
    const validador = TIPOS_CAMPOS_METADATA[c];
    return validador ? validador(metadata[c]) : true;
  });
}

async function limpiarEventos(db, sesionesValidas) {
  const ahora = new Date();
  const coleccion = db.collection("eventos");
  const docs = await coleccion.find({ revisado: { $exists: false } }).toArray();

  const idsInvalidos = [];

  for (const doc of docs) {
    let valido = true;
    const motivos = [];

    if (!esFechaValida(doc.timestamp)) { valido = false; motivos.push("timestamp"); }
    if (tieneCamposExtra(doc, CAMPOS_PERMITIDOS_EVENTO)) { valido = false; motivos.push("campos extra detectados"); }

    const meta = doc.metadata;
    if (!meta || typeof meta !== "object") {
      valido = false; motivos.push("metadata ausente");
    } else {
      if (!esString(meta.siteId)) { valido = false; motivos.push("metadata.siteId"); }
      if (!esString(meta.sessionId)) { valido = false; motivos.push("metadata.sessionId"); }
      if (!esString(meta.pagina)) { valido = false; motivos.push("metadata.pagina"); }
      if (!esString(meta.tipo)) {
        valido = false; motivos.push("metadata.tipo");
      } else if (!metadataValida(meta.tipo, meta)) {
        valido = false; motivos.push(`campos faltantes para tipo=${meta.tipo}`);
      } else if (tieneCamposExtraMetadata(meta, meta.tipo)) {
        valido = false; motivos.push(`campos extra en metadata para tipo=${meta.tipo}`);
      }

      if (valido && esString(meta.siteId) && esString(meta.sessionId)) {
        const clave = `${meta.siteId}_${meta.sessionId}`;
        if (!sesionesValidas.has(clave)) {
          valido = false; motivos.push("sesión referenciada no existe");
        }
      }
    }

    if (!valido) {
      idsInvalidos.push(doc._id);
      console.log(`CRON LIMPIEZA eventos: descartando ${doc._id} -> ${motivos.join(", ")}`);
    } else {
      await coleccion.updateOne({ _id: doc._id }, { $set: { revisado: ahora } });
    }
  }

  if (idsInvalidos.length > 0) {
    await coleccion.deleteMany({ _id: { $in: idsInvalidos } });
  }
  console.log(`CRON LIMPIEZA eventos: ${idsInvalidos.length} documento(s) eliminado(s) de ${docs.length}`);
}

//=====================================================================================================
//================================= CIERRE DE SESIONES ================================================
//=====================================================================================================

async function finSesion(db) {
  let sesiones_pendientes = await db.collection("sesiones").find(
    { Fin: { $exists: false }, revisado: { $exists: true } }
  ).toArray();

  for (const doc of sesiones_pendientes) {
    let ultimoEvento = await db.collection("eventos").findOne(
      { "metadata.siteId": doc.siteId, "metadata.sessionId": doc.sessionId },
      { sort: { timestamp: -1 } }
    );

    if (!ultimoEvento) {
      console.log(`CRON FIN SESION: sin eventos para ${doc.sessionId}, se omite`);
      continue;
    }

    let fechaUltimoEvento = ultimoEvento.timestamp;
    fechaUltimoEvento.setMinutes(fechaUltimoEvento.getMinutes() + LIMITE_MINUTOS_SESION_QUIETA);

    const rutas = doc.rutas || [];
    let paginaInicio = rutas.length > 0 ? rutas[0].pagina : null;
    let paginaFin = rutas.length > 0 ? rutas[rutas.length - 1].pagina : null;

    let tiempoSesion = (fechaUltimoEvento - doc.inicio) / (1000 * 60);
    let esRebote = doc.eventosClave.length > 0 ? false : true;

    await db.collection("sesiones").updateOne(
      { _id: doc._id },
      { $set: { Fin: fechaUltimoEvento, paginaInicio, paginaAbandono: paginaFin, duracionSesion: tiempoSesion, esRebote } }
    );
  }
}

//=====================================================================================================
//============================== TRADUCCIÓN DE LOCALIZACIÓN ===========================================
//=====================================================================================================

async function traducirGeo(lat, lon) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
    { headers: { "User-Agent": "Keetup-TrackingSystem/1.0 (jfontana@keetup.com)" } }
  );
  const data = await response.json();
  return {
    pais: data.address?.country || null,
    provincia: data.address?.state || null,
    ciudad: data.address?.city || null
  };
}

async function traducirGeolocalizaciones(db) {
  let pendientes = await db.collection("sesiones").find({
    geo: { $type: "array" }, revisado: { $exists: true }
  }).toArray();

  console.log(`PREPRO: Iniciando traducciones de ${pendientes.length} sesión(es)`);
  for (const sesion of pendientes) {
    try {
      let geoTraducido = await traducirGeo(sesion.geo[0], sesion.geo[1]);
      await db.collection("sesiones").updateOne({ _id: sesion._id }, { $set: { geo: geoTraducido } });
    } catch (error) {
      console.error(`Error traduciendo geo de sesión ${sesion._id}:`, error.message);
    }
    await esperar(1000);
  }
}

//=====================================================================================================
//=========================== CREACIÓN/ACTUALIZACIÓN DE USUARIOS ======================================
//=====================================================================================================

async function actualizarUsuarios(db) {
  const coleccionSesiones = db.collection("sesiones");
  const coleccionUsuarios = db.collection("usuarios");

  const resultados = await coleccionSesiones.aggregate([
    { $match: { revisado: { $exists: true }, Fin: { $exists: true } } },
    { $sort: { inicio: 1 } },
    {
      $group: {
        _id: { siteId: "$siteId", userId: "$userId" },
        primeraSesion: { $first: "$$ROOT" },
        ultimaSesion: { $last: "$$ROOT" },
        totalSesiones: { $sum: 1 }
      }
    }
  ]).toArray();

  for (const r of resultados) {
    const idDoc = r._id.siteId + "_" + r._id.userId;

    await coleccionUsuarios.updateOne(
      { _id: idDoc },
      {
        $setOnInsert: {
          siteId: r._id.siteId,
          userId: r._id.userId,
          fechaInicio: r.primeraSesion.inicio,
          referrerOriginal: r.primeraSesion.referrer,
          is_mobile: r.primeraSesion.is_mobile // corregido: antes era r.is_mobile, que no existía
        },
        $set: {
          ultimaConexion: r.ultimaSesion.inicio,
          totalSesiones: r.totalSesiones
        }
      },
      { upsert: true }
    );
  }

  console.log(`CRON AGREGACION: ${resultados.length} usuario(s) actualizado(s)/creado(s)`);
}

//=====================================================================================================
//============================== BORRADO DE RAW_BATCHES VIEJOS ========================================
//=====================================================================================================

async function limpiarRawBatches(db) {
  const dias = 3;
  const old_time = Date.now() - dias * 24 * 60 * 60 * 1000;
  let raw_borrados = await db.collection("raw_batches").deleteMany({
    procesado: true,
    tiempo_envio: { $lt: old_time }
  });
  console.log(`Limpieza: ${raw_borrados.deletedCount} raw_batches eliminados (procesados, +${dias} días)`);
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- Función principal ----------
async function limpiarDatos() {
  try {
    await client.connect();
    console.log("CRON LIMPIEZA: Conectado a MongoDB");

    const db = client.db("PruebaBBDD");

    const sesionesValidas = await limpiarSesiones(db);
    await limpiarFormularios(db);
    await limpiarEventos(db, sesionesValidas);

    await finSesion(db);
    await traducirGeolocalizaciones(db);

    await actualizarUsuarios(db);
    await limpiarRawBatches(db);

    console.log("CRON LIMPIEZA: Finalizado");
  } catch (error) {
    console.error("CRON LIMPIEZA: error en la corrida", error);
  } finally {
    await client.close();
  }
}

cron.schedule('*/3 * * * *', limpiarDatos);