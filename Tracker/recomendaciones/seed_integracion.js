/*------------------------ ---------------------------
-------------------------- Seed de integración (lectura y escritura)
-------------------------- -------------------------*/
// Siembra los sitios de los casos E4-M4-1 a E4-M4-10 (lectura de contextos y escritura de recomendaciones).
// Los sitios se llaman TEST_IN_NN (NN = número del caso). Todos parten del funnel sano de seed_atraccion.js.
//
//   node seed_integracion.js            -> borra lo anterior (incluidas sus recomendaciones) y siembra
//   node seed_integracion.js limpiar    -> solo borra
//   node seed_integracion.js seco       -> no toca la base: imprime los casos y cuántos documentos generaría
//   node seed_integracion.js periodo2   -> solo para E4-M4-8: agrega un snapshot nuevo a TEST_IN_08 (período nuevo)
//
// Qué se siembra y cómo se revisa cada caso (después de correr recomendaciones.js, mirar la colección 'recomendaciones'):
//   E4-M4-1   TEST_IN_01        3 snapshots (el anterior con 800 sesiones, el actual con 600): ATR-02 “cayó 25%” con
//                               periodo.desde = fecha del 2.º snapshot y periodo.hasta = fecha del 3.º
//   E4-M4-2   TEST_IN_02        1 solo snapshot, con rebote 0.75: INT-01, sin reglas de variación, periodo.desde = 1970-01-01
//   E4-M4-3   TEST_IN_03        sitio sin snapshots: no aparece en la colección; en el log de recomendaciones dice que se omite
//   E4-M4-4   TEST_IN_04a/b/c   3 sitios con datos: 1 documento cada uno (ATR-04, ATR-05 y ATR-06) y ningún error
//   E4-M4-5   (no se siembra)   una sección que falla es un error de lectura, no un dato
//   E4-M4-6   TEST_IN_06        3 documentos: recomendación ATR-04, aviso de calidad PS-05 y fortaleza FID-07
//   E4-M4-7   TEST_IN_06        sin datos nuevos: dejar que recomendaciones.js corra 2 veces (cada minuto) y contar los documentos
//   E4-M4-8   TEST_IN_08        INT-01. Correr recomendaciones.js, luego `node seed_integracion.js periodo2` y esperar otra corrida
//   E4-M4-9   TEST_IN_09        sitio sano: no escribe nada
//   E4-M4-10  TEST_IN_10        INT-05 en /producto (30 %) y /contacto (20 %): 2 documentos con _id distintos
// Conexión: MONGO_URI (por defecto mongodb://mongo:27017), base PruebaBBDD.

const { sitio, nuevoLote } = require("./seed_atraccion");

const uri = process.env.MONGO_URI || "mongodb://mongo:27017";
const DIA = 24 * 60 * 60 * 1000;
const SITIO_PERIODO2 = "TEST_IN_08";


/*------------------------ ---------------------------
-------------------------- Casos ---------------------
-------------------------- -------------------------*/
function construir() {
  const L = nuevoLote();
  L.docs.analisis_patrones_secuenciales = [];

  // caso(id, siteId, módulo, datos, opciones del sitio, esperado)
  const caso = (id, siteId, modulo, datos, opciones, esperado) => {
    const s = sitio(L, 0, { ...opciones, siteId });
    L.casos.push({ id, siteId, regla: modulo, datos, esperado: Array.isArray(esperado) ? esperado : [esperado], desde: s.desde });
  };

  // --- Lectura
  caso("E4-M4-1", "TEST_IN_01", "Lectura", "3 snapshots; el anterior con totalSesiones = 800 (el actual 600)",
    { anterior: { totalSesiones: 800 } },
    "ATR-02: “El tráfico del sitio cayó 25%…”. periodo.desde = fecha del 2.º snapshot, periodo.hasta = fecha del 3.º");

  caso("E4-M4-2", "TEST_IN_02", "Lectura", "1 solo snapshot, con tasaRebote = 0.75",
    { anterior: null, actual: { tasaRebote: 0.75 } },
    "INT-01 (rebote 75%). Sin reglas de variación. periodo.desde = 1970-01-01. Sin errores");

  // Sitio sin snapshots: solo existe en 'sitios'
  L.docs.sitios.push({ _id: "TEST_IN_03" });
  L.casos.push({ id: "E4-M4-3", siteId: "TEST_IN_03", regla: "Lectura", datos: "Sitio en 'sitios' sin documentos en metricas_resumen",
    esperado: ["No aparece en 'recomendaciones'. El log dice que no tiene snapshots y se omite. Los demás sitios siguen igual"] });

  caso("E4-M4-4", "TEST_IN_04a", "Lectura", "Sitio 1 de 3: paginaInicio.top con 70 %", { fEntrada: 0.70 },
    "1 documento: ATR-04, con siteId TEST_IN_04a");
  caso("E4-M4-4", "TEST_IN_04b", "Lectura", "Sitio 2 de 3: país top con 90 %", { fPais: 0.90 },
    "1 documento: ATR-05, con siteId TEST_IN_04b");
  caso("E4-M4-4", "TEST_IN_04c", "Lectura", "Sitio 3 de 3: celular con 70 %", { fMovil: 0.70 },
    "1 documento: ATR-06, con siteId TEST_IN_04c");

  // --- Escritura
  {
    const siteId = "TEST_IN_06";
    const s = sitio(L, 0, { siteId, fEntrada: 0.70, actual: { usuariosRecurrentes: 300 } });
    // aviso de calidad PS-05: análisis de patrones vigente y sin ningún patrón
    L.docs.analisis_patrones_secuenciales.push({
      siteId, fechaGeneracion: new Date(s.desde.getTime() + 20 * DIA), soporteMinimo: 0.10, patrones: []
    });
    L.casos.push({ id: "E4-M4-6 y E4-M4-7", siteId, regla: "Escritura",
      datos: "Genera 1 recomendación (ATR-04), 1 aviso de calidad (PS-05) y 1 fortaleza (FID-07)",
      esperado: ["3 documentos (ATR-04, PS-05, FID-07), cada uno con fechaGeneracion y periodo",
                 "E4-M4-7: tras dos corridas del mismo período siguen siendo 3, con los mismos _id"] });
  }

  caso("E4-M4-8", SITIO_PERIODO2, "Escritura", "INT-01 (tasaRebote 0.75 en actual y anterior); después se agrega un snapshot nuevo (periodo2)",
    { actual: { tasaRebote: 0.75 }, anterior: { tasaRebote: 0.75 } },
    ["Antes de periodo2: 1 documento INT-01",
     "Después de periodo2 y una corrida más: 2 documentos INT-01, con _id distintos (cambia periodo.hasta); el primero sigue ahí"]);

  caso("E4-M4-9", "TEST_IN_09", "Escritura", "Sitio sano, sin análisis", {},
    "No escribe nada (el log dice 0 documentos guardados)");

  caso("E4-M4-10", "TEST_IN_10", "Escritura", "/producto.scrollDepthPromedio = 0.30 y /contacto.scrollDepthPromedio = 0.20",
    { paginas: { "/producto": { scrollDepthPromedio: 0.30 }, "/contacto": { scrollDepthPromedio: 0.20 } } },
    "2 documentos INT-05, uno por página, con _id distintos (el _id incluye la página)");

  return L;
}


/*------------------------ ---------------------------
-------------------------- Ejecución -----------------
-------------------------- -------------------------*/
const COLECCIONES = [
  ["sitios", "_id"], ["metricas_resumen", "siteId"], ["sesiones", "siteId"],
  ["eventos", "metadata.siteId"], ["formularios", "siteId"], ["usuarios", "siteId"],
  ["analisis_patrones_secuenciales", "siteId"],
  ["recomendaciones", "siteId"]        // lo que escribió el módulo en corridas anteriores: los conteos de los casos parten de cero
];

function imprimirCasos(casos) {
  for (const k of casos) {
    console.log(`\n=== ${k.id}  ${k.siteId}  (${k.regla}) ===`);
    if (k.datos) console.log(k.datos);
    console.log("ESPERADO:");
    for (const linea of k.esperado) console.log("  - " + linea);
  }
  console.log("\nNo sembrado: E4-M4-5 (una sección que falla es un error de lectura, no un dato)");
}

async function main() {
  const modo = process.argv[2];
  const { docs, casos } = construir();
  const resumen = () => Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, v.length]));

  if (modo === "seco") {
    imprimirCasos(casos);
    console.log("\nDocumentos que se insertarían:", resumen());
    return;
  }

  const mongo = require("mongodb");           // recién acá, para que el modo "seco" no lo necesite
  const client = new mongo.MongoClient(uri);
  await client.connect();
  const db = client.db("PruebaBBDD");
  try {
    // E4-M4-8: un snapshot nuevo, copia del último, con fecha de ahora => período nuevo
    if (modo === "periodo2") {
      const [ultimo] = await db.collection("metricas_resumen")
        .find({ siteId: SITIO_PERIODO2 }).sort({ fechaCalculo: -1 }).limit(1).toArray();
      if (!ultimo) { console.log(`${SITIO_PERIODO2} no tiene snapshots: corré primero node seed_integracion.js`); return; }
      const { _id, ...copia } = ultimo;
      await db.collection("metricas_resumen").insertOne({ ...copia, fechaCalculo: new Date() });
      console.log(`Snapshot nuevo agregado a ${SITIO_PERIODO2}. Esperá la próxima corrida de recomendaciones.js`);
      return;
    }

    for (const [coleccion, campo] of COLECCIONES) {
      const r = await db.collection(coleccion).deleteMany({ [campo]: /^TEST_IN_/ });
      console.log(`Borrados ${r.deletedCount} documentos de ${coleccion}`);
    }
    if (modo === "limpiar") return;

    imprimirCasos(casos);
    for (const [coleccion] of COLECCIONES) {
      if (docs[coleccion] && docs[coleccion].length > 0) await db.collection(coleccion).insertMany(docs[coleccion]);
    }
    console.log("\nInsertados:", resumen());
    console.log("Ahora corré recomendaciones.js y mirá la colección 'recomendaciones' (siteId que empiece con TEST_IN_).");
  } finally {
    await client.close();
  }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { construir };