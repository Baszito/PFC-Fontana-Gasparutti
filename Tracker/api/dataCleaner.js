const cron = require('node-cron');
const mongo = require('mongodb');

const uri = "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);

//=====================================================================================================
//===================================== LIMPIEZA ======================================================
//=====================================================================================================

// ============ Funciones para la validación de tipos ================
// (es STRING) Y (no es CADENA VACIA)
function esString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

// (es BOOLEANO)
function esBooleano(v) {
  return typeof v === "boolean";
}

// (es DATE) Y (es una FECHA VALIDA)
function esFechaValida(v) {
  return v instanceof Date && !isNaN(v.getTime());
}

// (es un NÚMERO) Y (no es NULO)
function esNumero(v) {
  return typeof v === "number" && !isNaN(v);
}

// (es un ARREGLO)
function esArray(v) {
  return Array.isArray(v);
}

// ------------------------------
// ---------- SESIONES ----------
// ------------------------------

const LIMITE_MINUTOS_SESION_QUIETA = 2;

async function limpiarSesiones(db) {
  //Trabajamos primero sobre la colección de sesiones
  const coleccion = db.collection("sesiones");
  //Guardamos la fecha de ejecución del cleaner para coparar con las posibles sesiones mal cerradas
  const ahora = new Date();
  //Guardamos todos los documentos de la colección en un array
  const docs = await coleccion.find({ revisado: { $exists: false } }).toArray();

  const idsInvalidos = [];

  for (const doc of docs) {
    let valido = true;
    const motivos = [];

    // --- Obligatorios: existencia ---
    if (!esString(doc.siteId)) { valido = false; motivos.push("siteId"); }
    if (!esString(doc.userId)) { valido = false; motivos.push("userId"); }
    if (!esString(doc.sessionId)) { valido = false; motivos.push("sessionId"); }
    if (!esFechaValida(doc.inicio)) { valido = false; motivos.push("inicio"); }
    if (!esBooleano(doc.is_mobile)) { valido = false; motivos.push("isMobile"); }
    if (!esString(doc.referrer)) { valido = false; motivos.push("referrer"); }
    if (!esArray(doc.rutas)) { valido = false; motivos.push("rutas"); }
    if (!esArray(doc.eventosClave)) { valido = false; motivos.push("eventosClave"); }

    // --- Validar estructura interna de rutas y eventosClave ---
    if (esArray(doc.rutas)) {
      const rutasValidas = doc.rutas.every(r => esString(r.pagina) && esFechaValida(r.timestamp));
      if (!rutasValidas) { valido = false; motivos.push("rutas (estructura)"); }
    }
    if (esArray(doc.eventosClave)) {
      const eventosValidos = doc.eventosClave.every(e => esString(e.tipo) && esFechaValida(e.timestamp));
      if (!eventosValidos) { valido = false; motivos.push("eventosClave (estructura)"); }
    }

      // Secuencia de timestamps en rutas debe ser ascendente
      if (valido && esArray(doc.rutas) && doc.rutas.length > 1) {
        for (let i = 1; i < doc.rutas.length; i++) {
          if (doc.rutas[i].timestamp < doc.rutas[i - 1].timestamp) {
            valido = false; motivos.push("rutas fuera de secuencia");
            break;
          }
        }
      }

      // Secuencia de timestamps en eventosClave debe ser ascendente
      if (valido && esArray(doc.eventosClave) && doc.eventosClave.length > 1) {
        for (let i = 1; i < doc.eventosClave.length; i++) {
          if (doc.eventosClave[i].timestamp < doc.eventosClave[i - 1].timestamp) {
            valido = false; motivos.push("eventosClave fuera de secuencia");
            break;
          }
        }
      }

      //Logica para sesión cerrada o no
      let cerrada = false;
      if (valido) {
        let ultimoEvento = await db.collection("eventos").findOne({ "metadata.siteId": doc.siteId, "metadata.sessionId": doc.sessionId }, { sort: { timestamp: -1 }});
        let fechaUltimoEvento = ultimoEvento.timestamp;

        let dif = (ahora - fechaUltimoEvento) / (1000 * 60); 
        if (dif >= LIMITE_MINUTOS_SESION_QUIETA) {
          cerrada = true;
        }
      }

      if (!valido) {
        idsInvalidos.push(doc._id);
        console.log(`CRON LIMPIEZA sesiones: descartando ${doc._id} -> ${motivos.join(", ")}`);
      } else {
        if (cerrada) {
          await coleccion.updateOne({ _id: doc._id}, { $set: { revisado: ahora}});
        }
      }
    }

  if (idsInvalidos.length > 0) {
    await coleccion.deleteMany({ _id: { $in: idsInvalidos } });
  }
  console.log(`CRON LIMPIEZA sesiones: ${idsInvalidos.length} documento(s) eliminado(s) de ${docs.length}`);

  // Devolvemos el set de sesiones válidas (siteId+sessionId) para usarlo al limpiar eventos
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

  const idsInvalidos = [];

  for (const doc of docs) {
    let valido = true;
    const motivos = [];

    // --- Obligatorios ---
    if (!esString(doc.siteId)) { valido = false; motivos.push("siteId"); }
    if (!esString(doc.userId)) { valido = false; motivos.push("userId"); }
    if (!esString(doc.sessionId)) { valido = false; motivos.push("sessionId"); }
    if (!esFechaValida(doc.Inicio)) { valido = false; motivos.push("inicio"); }
    if (!esString(doc.id_formulario)) { valido = false; motivos.push("id_formulario"); }
    if (!esBooleano(doc.completado)) { valido = false; motivos.push("completado"); }

    if (doc.camposInteractuados !== undefined && doc.camposInteractuados !== null) {
      if (!esArray(doc.camposInteractuados)) {
        valido = false; motivos.push("camposInteractuados (tipo)");
      } else {
        const camposValidos = doc.camposInteractuados.every(c => c.campo !== null && esFechaValida(c.timestamp));
        if (!camposValidos) { valido = false; motivos.push("camposInteractuados (estructura)"); }
      }
    }

    //Logica para formularios abandonados
    let cerrado = false;
    if (valido) {
      if (!esFechaValida(doc.Fin)) {
        const campos = doc.camposInteractuados || [];
        const ultimoTimestamp = campos.length > 0 ? campos[campos.length - 1].timestamp : null;

        if (ultimoTimestamp !== null) {
          let dif = (ahora - ultimoTimestamp) / (1000 * 60);
          if (dif >= LIMITE_FORMULARIO_QUIETO) {
            cerrado = true;
          }
        } else {
          let dif = (ahora - doc.Inicio) / (1000 * 60);
          if (dif >= LIMITE_FORMULARIO_QUIETO) {
            cerrado = true;
          }
        } 
      } else {
        cerrado = true;
      }
    }

    if (!valido) {
      idsInvalidos.push(doc._id);
      console.log(`CRON LIMPIEZA formularios: descartando ${doc._id} -> ${motivos.join(", ")}`);
    } else {
      if (cerrado) {
        await coleccion.updateOne({ _id: doc._id}, { $set: { revisado: ahora}});
      }
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
// Campos obligatorios de metadata según el tipo de evento
const CAMPOS_POR_TIPO = {
  pageview: ["pagina"],
  click: ["elemento", "esInteractivo", "pagina"],
  scroll: ["pagina", "valor"],
  hover: ["elemento", "pagina", "duracion", "goal"],
  objetivo: ["subtipo", "pagina"]
};

function metadataValida(tipo, metadata) {
  const campos = CAMPOS_POR_TIPO[tipo];
  if (!campos) return false; // tipo desconocido -> corrupto
  return campos.every(c => metadata[c] !== undefined && metadata[c] !== null);
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

    const meta = doc.metadata;
    if (!meta || typeof meta !== "object") {
      valido = false; motivos.push("metadata ausente");
    } else {
      if (!esString(meta.siteId)) { valido = false; motivos.push("metadata.siteId"); }
      if (!esString(meta.sessionId)) { valido = false; motivos.push("metadata.sessionId"); }
      if (!esString(meta.tipo)) {
        valido = false; motivos.push("metadata.tipo");
      } else if (!metadataValida(meta.tipo, meta)) {
        valido = false; motivos.push(`campos faltantes para tipo=${meta.tipo}`);
      }

      // Verificar que la sesión referenciada exista (si sesiones ya fue limpiada)
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
      await coleccion.updateOne({ _id: doc._id}, { $set: { revisado: ahora}});
    }
  }

  if (idsInvalidos.length > 0) {
    // eventos es time series: no se puede deleteMany por _id directamente en versiones viejas,
    // pero desde Mongo 5.1+ sí se soporta delete en colecciones time series.
    await coleccion.deleteMany({ _id: { $in: idsInvalidos } });
  } 

  console.log(`CRON LIMPIEZA eventos: ${idsInvalidos.length} documento(s) eliminado(s) de ${docs.length}`);
}

//=====================================================================================================
//================================= CIERRE DE SESIONES ================================================
//=====================================================================================================
// A partir de acá, los documentos con los que se trabaje deben tener el campo "revisado"
// Y, por supuesto, que no tengan incluidos los campos que se agregan en las funciones 


async function finSesion(db){

    let sesiones_pendientes = await db.collection("sesiones").find(
        { Fin: { $exists: false }, revisado: { $exists: true } }
    ).toArray();

    for (const doc of sesiones_pendientes) {

      //Buscar el último evento hecho por esta sesion
      let ultimoEvento = await db.collection("eventos").findOne({ "metadata.siteId": doc.siteId, "metadata.sessionId": doc.sessionId }, { sort: { timestamp: -1 }});
      
      //guardar timestamp + minutos de espera de cierre
      let fechaUltimoEvento = ultimoEvento.timestamp;
      fechaUltimoEvento.setMinutes(fechaUltimoEvento.getMinutes() + LIMITE_MINUTOS_SESION_QUIETA);

      //buscar ultima pagina visitada y la 1era
      const rutas = doc.rutas || [];
      let paginaInicio = rutas.length > 0 ? rutas[0] : null; 
      let paginaFin = rutas.length > 0 ? rutas[rutas.length - 1] : null;

      //tiempoSesion
      let tiempoSesion = (fechaUltimoEvento - doc.inicio) / (1000 * 60);
        
      //esRebote = True si doc.eventosClave === []
      let esRebote = doc.eventosClave.length > 0 ? true : false;

      //Actualziar sesion
      await db.collection("sesiones").updateOne({ _id: doc._id}, { $set: {Fin: fechaUltimoEvento, paginaInicio: paginaInicio, paginaAbandono: paginaFin, duracionSesion: tiempoSesion, esRebote: esRebote}});

      }
}

//=====================================================================================================
//============================== TRADUCCIÓN DE LOCALIZACIÓN ===========================================
//=====================================================================================================
// Como en CIERRE DE SESIONES, solo se modificarán las sesiones que tengan el campo "revisado"
// Y, nuevamente, que ya no se hayan realizado las traducciones

async function traducirGeo(lat,lon){
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            {
                headers: {
                    "User-Agent": "Keetup-TrackingSystem/1.0 (jfontana@keetup.com)"
                }
            }
        );
        const data = await response.json();
        let pais = data.address?.country || null;
        let provincia = data.address?.state || null;
        let ciudad = data.address?.city || null;
        return {pais,provincia,ciudad}
}

async function traducirGeolocalizaciones() {
    let pendientes = await client.db("PruebaBBDD").collection("sesiones").find({
         geo: { $type: "array" }, revisado: { $exists: true }
    }).toArray();
    console.log(`PREPRO  : Iniciando traducciones !`)
    for (const sesion of pendientes) {
        try {
            let geoTraducido = await traducirGeo(sesion.geo[0], sesion.geo[1]);
            await client.db("PruebaBBDD").collection("sesiones").updateOne(
                {_id: sesion._id},
                {$set: {geo: geoTraducido}}
            );
            console.log(`PREPRO : Se tradujeron ${pendientes.length} direcciones !`)
        } catch (error) {
            console.error(`Error traduciendo geo de sesión ${sesion._id}:`, error.message);
        }
        await esperar(1000);//por el limite de nominatin
    }
    
}

//=====================================================================================================
//=========================== CREACIÓN DE DOCUMENTOS DE USUARIOS ======================================
//=====================================================================================================
// Solo se van a tener en cuenta los documentos de sesiones que:
//      -> Ya hayan sido revisados.
//      -> Completos (que tengan una fecha de FIN)

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
        totalSesiones: { $sum: 1 },
        sesionesMobile: { $sum: { $cond: ["$is_mobile", 1, 0] } },
        sesionesDesktop: { $sum: { $cond: ["$is_mobile", 0, 1] } }
      }
    }
  ]).toArray();

  for (const r of resultados) {
    const idDoc = r._id.siteId + "_" + r._id.userId;
    const isMobileHabitual = r.sesionesMobile > r.sesionesDesktop; // empate -> false

    await coleccionUsuarios.updateOne(
      { _id: idDoc },
      {
        $setOnInsert: {
          siteId: r._id.siteId,
          userId: r._id.userId,
          fechaInicio: r.primeraSesion.inicio,
          referrerOriginal: r.primeraSesion.referrer
        },
        $set: {
          fechaFin: r.ultimaSesion.inicio,
          totalSesiones: r.totalSesiones,
          isMobile: isMobileHabitual
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

let dias= 3;
let old_time = (Date.now() - dias * 24 * 60 * 60 * 1000) //lo pasamos a ms
async function limpiarRawBatches(){
    let raw_borrados = await client.db("PruebaBBDD").collection("raw_batches").deleteMany({
        "procesado": true,
        "tiempo_envio":{$lt:old_time}     
    });
    console.log(`Limpieza: ${raw_borrados.deletedCount} raw_batches eliminados (procesados, +${dias} días)`);
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- Función principal ----------
async function limpiarDatos() {
  await client.connect();
  console.log("CRON LIMPIEZA: Conectado a MongoDB");

  const db = client.db("PruebaBBDD");

  const sesionesValidas = await limpiarSesiones(db);
  await limpiarFormularios(db);
  await limpiarEventos(db, sesionesValidas);

  await finSesion(db);
  await traducirGeolocalizaciones();

  await actualizarUsuarios(db);
  await limpiarRawBatches();

  console.log("CRON LIMPIEZA: Finalizado");
  await client.close();
}

// Programación: cada 2 minutos
cron.schedule('*/2 * * * *', limpiarDatos);
