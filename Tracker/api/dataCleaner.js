//=========================================================
//================== CRON de limpieza =====================
//=========================================================
const cron = require('node-cron');
const mongo = require('mongodb');

const uri = "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);

//Umbral para considerar una sesión/formulario "abandonado"
//La idea es:
//  Si pasadas unas 3 horas desde el inicio de un formulario o sesión, todavía no hay señales de finalización (campo fin incompleto)
//  entonces podemos inferir que la sesión no se cerró de forma correcta, o los datos no se cargaron correctamente
//  al no tener esos últimos datos, los documentos pueden considerarse invalidos, por ende los eliminamos
const HORAS_LIMITE = 3;

// ============ Funciones para la validación de tipos ================
// (es STRING) Y (no es CADENA VACIA)
function esString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
// (está INDEFINIDO) O (es NULO) O (es STRING no cadena VACIA)
function esStringOpcional(v) {
  return v === undefined || v === null || esString(v);
}

// (es BOOLEANO)
function esBooleano(v) {
  return typeof v === "boolean";
}
// (es INDEFINIDO) O (es NULO) O (es BOOLEANO)
function esBooleanoOpcional(v) {
  return v === undefined || v === null || esBooleano(v);
}

// (es DATE) Y (es una FECHA VALIDA)
function esFechaValida(v) {
  return v instanceof Date && !isNaN(v.getTime());
}
// (es INDEFINIDO) O (es NULO) O (es DATE VALIDA)
function esFechaOpcional(v) {
  return v === undefined || v === null || esFechaValida(v);
}

// (es un NÚMERO) Y (no es NULO)
function esNumero(v) {
  return typeof v === "number" && !isNaN(v);
}

// (es INDEFINIDO) O (es NULO) O (es un NÚMERO no NULO)
function esNumeroOpcional(v) {
  return v === undefined || v === null || esNumero(v);
}

// (es un ARREGLO)
function esArray(v) {
  return Array.isArray(v);
}

// ------------------------------
// ---------- SESIONES ----------
// ------------------------------

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

    // --- Opcionales: tipo, si están presentes ---
    if (!esFechaOpcional(doc.fin)) { valido = false; motivos.push("fin (tipo)"); }
    if (!esNumeroOpcional(doc.duracionTotal)) { valido = false; motivos.push("duracionTotal (tipo)"); }
    if (!esStringOpcional(doc.paginaIngreso)) { valido = false; motivos.push("paginaIngreso (tipo)"); }
    if (!esStringOpcional(doc.paginaAbandono)) { valido = false; motivos.push("paginaAbandono (tipo)"); }
    if (!esBooleanoOpcional(doc.esRebote)) { valido = false; motivos.push("esRebote (tipo)"); }

    if (doc.geo !== undefined && doc.geo !== null) {
      const g = doc.geo;
      if (typeof g !== "object" || !esStringOpcional(g.pais) || !esStringOpcional(g.provincia) || !esStringOpcional(g.ciudad)) {
        valido = false; motivos.push("geo (tipo)");
      }
    }

    // --- Validar estructura interna de rutas y eventosClave ---
    if (esArray(doc.rutas)) {
      const rutasValidas = doc.rutas.every(r => esString(r.pagina) && esFechaValida(r.timestamp));
      if (!rutasValidas) { valido = false; motivos.push("rutas (estructura)"); }
    }
    if (esArray(doc.eventosClave)) {
      const eventosValidos = doc.eventosClave.every(e => esString(e.tipo) && esStringOpcional(e.subtipo) && esFechaValida(e.timestamp));
      if (!eventosValidos) { valido = false; motivos.push("eventosClave (estructura)"); }
    }

    // --- Reglas de negocio extra (solo si lo anterior ya es válido) ---
    if (valido) {
      // Sesión sin "fin" hace más de HORAS_LIMITE horas -> se considera corrupta/abandonada
      if (!esFechaValida(doc.fin)) {
        const horasTranscurridas = (ahora - doc.inicio) / (1000 * 60 * 60);
        if (horasTranscurridas > HORAS_LIMITE) {
          valido = false; motivos.push(`sin fin luego de ${HORAS_LIMITE}hs`);
        }
      }

      // inicio debe ser antes que fin
      if (valido && esFechaValida(doc.fin) && doc.inicio >= doc.fin) {
        valido = false; motivos.push("inicio >= fin");
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
    }

    if (!valido) {
      idsInvalidos.push(doc._id);
      console.log(`CRON LIMPIEZA sesiones: descartando ${doc._id} -> ${motivos.join(", ")}`);
    } else {
      await coleccion.updateOne({ _id: doc._id}, { $set: { revisado: ahora}});
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

    // --- Opcionales: tipo ---
    if (!esFechaOpcional(doc.Fin)) { valido = false; motivos.push("fin (tipo)"); }
    if (!esStringOpcional(doc.ultimoCampoCompleto)) { valido = false; motivos.push("ultimoCampoCompletado (tipo)"); }

    if (doc.camposInteractuados !== undefined && doc.camposInteractuados !== null) {
      if (!esArray(doc.camposInteractuados)) {
        valido = false; motivos.push("camposInteractuados (tipo)");
      } else {
        const camposValidos = doc.camposInteractuados.every(c => c.campo !== null && esFechaValida(c.timestamp));
        if (!camposValidos) { valido = false; motivos.push("camposInteractuados (estructura)"); }
      }
    }

    // --- Reglas de negocio extra ---
    if (valido) {
      if (!esFechaValida(doc.Fin)) {
        const horasTranscurridas = (ahora - doc.Inicio) / (1000 * 60 * 60);
        if (horasTranscurridas > HORAS_LIMITE) {
          valido = false; motivos.push(`sin fin luego de ${HORAS_LIMITE}hs`);
        }
      }
      if (valido && esFechaValida(doc.Fin) && doc.Inicio >= doc.Fin) {
        valido = false; motivos.push("inicio >= fin");
      }
    }

    if (!valido) {
      idsInvalidos.push(doc._id);
      console.log(`CRON LIMPIEZA formularios: descartando ${doc._id} -> ${motivos.join(", ")}`);
    } else {
      await coleccion.updateOne({ _id: doc._id}, { $set: { revisado: ahora}});
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

// ---------- Función principal ----------
async function limpiarDatos() {
  await client.connect();
  console.log("CRON LIMPIEZA: Conectado a MongoDB");

  const db = client.db("PruebaBBDD");

  const sesionesValidas = await limpiarSesiones(db);
  await limpiarFormularios(db);
  await limpiarEventos(db, sesionesValidas);

  console.log("CRON LIMPIEZA: Finalizado");
  await client.close();
}

// Programación: cada 3 minutos
cron.schedule('*/3 * * * *', limpiarDatos);
