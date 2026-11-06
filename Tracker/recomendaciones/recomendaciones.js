/*------------------------ ---------------------------
-------------------------- Configuracion -------------
-------------------------- -------------------------*/
const cron = require('node-cron');
const mongo = require('mongodb');
const { leerContextos } = require('./leercontextos.js');

const uri = "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);


async function recomendaciones() {
/*------------------------ ---------------------------
-------------------------- Lectura -------------------
-------------------------- -------------------------*/
  await client.connect();
  console.log("RECOMENDACIONES: Conectado a MongoDB");

  const db = client.db("PruebaBBDD");
  const contextos = await leerContextos(db);
  //for (const [siteId, ctx] of contextos) {
  //  if (siteId.startsWith("TEST_LC_")) console.log(siteId, JSON.stringify(ctx, null, 2));
  //}
/*------------------------ ---------------------------
-------------------------- Generacion de recomendaciones
-------------------------- -------------------------*/

/*------------------------ ---------------------------
-------------------------- Escritura -----------------
-------------------------- -------------------------*/

/*------------------------ ---------------------------
-------------------------- Cierre --------------------
-------------------------- -------------------------*/
  console.log("RECOMENDACIONES: Finalizado");
  await client.close();
}

cron.schedule('*/1 * * * *', recomendaciones);