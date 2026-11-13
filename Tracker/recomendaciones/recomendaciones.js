/*------------------------ ---------------------------
-------------------------- Configuracion -------------
-------------------------- -------------------------*/
const cron = require('node-cron');
const mongo = require('mongodb');

const P = require('./parametros');
const { leerContextos } = require('./leerContextos');
const { generarRecomendaciones } = require('./generarRecomendaciones');
const { organizarRecomendaciones } = require('./organizarRecomendaciones');
const { escribirRecomendaciones } = require('./escribirRecomendaciones');

const uri = "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);


async function recomendaciones() {
  try {
/*------------------------ ---------------------------
-------------------------- Lectura -------------------
-------------------------- -------------------------*/
    await client.connect();
    console.log("RECOMENDACIONES: Conectado a MongoDB");

    const db = client.db("PruebaBBDD");
    const contextos = await leerContextos(db);      // Map: siteId -> contexto del sitio

    for (const [siteId, ctx] of contextos) {
      try {
/*------------------------ ---------------------------
-------------------------- Generacion de recomendaciones
-------------------------- -------------------------*/
        const { recomendaciones, calidad, fortalezas } = generarRecomendaciones(ctx, P);
        const organizadas = organizarRecomendaciones(recomendaciones, P);

/*------------------------ ---------------------------
-------------------------- Escritura -----------------
-------------------------- -------------------------*/
        const guardados = await escribirRecomendaciones(db, ctx, organizadas, calidad, fortalezas);
        console.log(`RECOMENDACIONES: ${siteId} -> ${guardados} documentos guardados (${organizadas.filter(r => r.principal).length} principales)`);
      } catch (e) {
        console.log(`RECOMENDACIONES: error en ${siteId}: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`RECOMENDACIONES: error general: ${e.message}`);
  } finally {
/*------------------------ ---------------------------
-------------------------- Cierre --------------------
-------------------------- -------------------------*/
    console.log("RECOMENDACIONES: Finalizado");
    await client.close();
  }
}

cron.schedule('*/1 * * * *', recomendaciones);