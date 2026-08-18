//=========================================================
//================== CRON agregación ======================
//======= sesiones actualizadas y usuarios ================

const cron = require('node-cron');
const mongo = require('mongodb');

const uri = "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);

const MIN_LIMITE = 2;

// ============= Completar campos de SESIONES =============
async function completarSesiones(db) {
  const coleccion = db.collection("sesiones");
  const ahora = new Date();
  // Para la prox: prodría revisar que el find solo filtre las que revisadas y las que no tengan el campo esRebote, entonces no intento actualizar algo que ya está
  const sesiones = await coleccion.find({ revisado: { $exists: true } /*, esRebote: {$exists: true}  */ }).toArray();

  let actualizadas = 0;

  for (const doc of sesiones) {
    const rutas = doc.rutas || [];
    const eventosClave = doc.eventosClave || [];

    const esRebote = eventosClave.length === 0;
    const paginaInicio = rutas.length > 0 ? rutas[0].pagina : null;
    const paginaFin = rutas.length > 0 ? rutas[rutas.length - 1].pagina : null;
    const horaFInPag = rutas[rutas.length - 1].timestamp;

    let diferenciaMin = (ahora - horaFInPag)/ 1000*60; //Esto nos da la diferencia en minutos entre ahora y la última página de la sesión
    const fin = diferenciaMin>MIN_LIMITE ? horaFInPag : null;

    let duracionTotal = null;
    if (doc.inicio && fin) {
      duracionTotal = (fin - doc.inicio) / 1000; // en segundos
    }

    await coleccion.updateOne(
      { _id: doc._id },
      {
        $set: {
          esRebote: esRebote,
          paginaInicio: paginaInicio,
          paginaFin: paginaFin,
          duracionTotal: duracionTotal,
          fin: fin
        }
      }
    );
    actualizadas++;
  }

  console.log(`CRON AGREGACION: ${actualizadas} sesion(es) completada(s) con campos calculados`);
}

//========== Construir/actualizar usuarios ==========
async function actualizarUsuarios(db) {
  const coleccionSesiones = db.collection("sesiones");
  const coleccionUsuarios = db.collection("usuarios");

  const resultados = await coleccionSesiones.aggregate([
    { $match: { revisado: { $exists: true }, fin: { $ne: null } } },
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

// ---------- Función principal ----------
async function procesarAgregacion() {
  await client.connect();
  console.log("CRON AGREGACION: Conectado a MongoDB");

  const db = client.db("PruebaBBDD");

  await completarSesiones(db);
  await actualizarUsuarios(db);

  console.log("CRON AGREGACION: Finalizado");
  await client.close();
}

// Programación: ajustable, ejemplo cada 5 minutos para pruebas
cron.schedule('*/5 * * * *', procesarAgregacion);