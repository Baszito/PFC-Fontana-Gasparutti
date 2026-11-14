/*------------------------ ---------------------------
-------------------------- Configuracion -------------
-------------------------- -------------------------*/
require('dotenv').config();           // antes de cargar mejora.js: ahí se lee ANTHROPIC_API_KEY
const cron = require('node-cron');
const mongo = require('mongodb');

const P = require('./parametros');
const { leerContextos } = require('./leerContextos');
const { generarRecomendaciones } = require('./generarRecomendaciones');
const { organizarRecomendaciones } = require('./organizarRecomendaciones');
const { escribirRecomendaciones } = require('./escribirRecomendaciones');
const { procesarRecomendaciones } = require('./mejorarRecomendaciones');

const uri = "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);

// La mejora con IA llama a la API de Anthropic (tiene costo). Se puede apagar con MEJORAR_CON_IA=false
const MEJORAR_CON_IA = process.env.MEJORAR_CON_IA !== "false";

// Evita que dos corridas se pisen: con muchos sitios la mejora tarda más que el intervalo del cron,
// y la primera en terminar cerraría la conexión de la otra
let enCurso = false;


async function recomendaciones() {
  if (enCurso) {
    console.log("RECOMENDACIONES: la corrida anterior sigue en curso, se omite esta");
    return;
  }
  enCurso = true;
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

/*------------------------ ---------------------------
-------------------------- Mejora con IA -------------
-------------------------- -------------------------*/
    // Con todo ya escrito, mejora lo pendiente. Si falla, las recomendaciones base ya están guardadas
    if (MEJORAR_CON_IA) {
      try {
        await procesarRecomendaciones(db);
      } catch (e) {
        console.log(`RECOMENDACIONES: no se pudo mejorar con IA: ${e.message}`);
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
    enCurso = false;
  }
}

cron.schedule('*/1 * * * *', recomendaciones);