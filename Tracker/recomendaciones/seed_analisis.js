/*------------------------ ---------------------------
-------------------------- Seed de la hoja 1 (análisis)
-------------------------- -------------------------*/
// Siembra un sitio por cada caso de análisis de la hoja 1: E4-M1-52 a E4-M1-91.
// El sitio de cada caso se llama TEST_AN_NNN (NNN = número del caso, con tres dígitos).
//
// Cada sitio tiene el mismo contexto de funnel sano de seed_atraccion.js (no dispara nada) más
// los cuatro documentos de análisis SANOS de abajo (tampoco disparan nada). Cada caso cambia solo
// el documento que dice la columna "Datos".
//
// Documentos de análisis sanos (caso E4-M1-52):
//   analisis_clusters                 k = 2, silhouette 0.60, dos clusters de 250 usuarios sin nada destacable
//   analisis_patrones_secuenciales    un patrón [/home → /producto → /nosotros] con proporción 0.30
//   analisis_apriori                  una regla [/carrito → /gracias] (lift 2.5) que ninguna regla de recomendación toma
//   analisis_random_forest            los cuatro modelos con una sola variable (hora_dia), que no tiene regla
// Fecha de cada documento: dentro del período actual (vigente), salvo los casos de análisis vencido.
//
// E4-M1-89 (sin análisis) se siembra como un sitio sin ningún documento de análisis: para las
// reglas es lo mismo que ctx.analisis = null, aunque no es el mismo camino de lectura.
//
// Se borra solo lo que tenga prefijo TEST_AN_.
//   node seed_analisis.js            -> borra lo anterior y siembra
//   node seed_analisis.js limpiar    -> solo borra
//   node seed_analisis.js seco       -> no toca la base: imprime los casos y cuántos documentos generaría
// Conexión: MONGO_URI (por defecto mongodb://mongo:27017), base PruebaBBDD.

const { sitio, nuevoLote } = require("./seed_atraccion");

const uri = process.env.MONGO_URI || "mongodb://mongo:27017";
const PREFIJO = "TEST_AN_";
const DIA = 24 * 60 * 60 * 1000;


/*------------------------ ---------------------------
-------------------------- Armado de documentos ------
-------------------------- -------------------------*/
// --- Patrones: soporte = cantidad de sesiones; proporcion = soporte / sesiones analizadas
const pat = (secuencia, proporcion, sesionesAnalizadas = 600) =>
  ({ soporte: Math.round(proporcion * sesionesAnalizadas), proporcion, secuencia });

// --- Apriori
const regla = (antecedente, consecuente, confianza, lift, soporte) => ({ antecedente, consecuente, soporte, confianza, lift });

// --- Clusters: cambios con nombres cortos -> claves "metricas.*" del documento
const CLAVES = {
  conversion: "tasaConversion", interacciones: "interaccionesPromedio", rebote: "tasaRebote",
  duracion: "duracionPromedio", paginas: "paginasPorSesionPromedio", tiempo: "tiempoHastaConversion"   // tiempo en ms
};
const promediosBase = () => ({
  "metricas.tasaConversion": 0.04, "metricas.interaccionesPromedio": 5, "metricas.tasaRebote": 0.40,
  "metricas.duracionPromedio": 3, "metricas.paginasPorSesionPromedio": 3.5, "metricas.tiempoHastaConversion": 120000
});
const cl = (usuarios, cambios = {}) => {
  const promedios = promediosBase();
  for (const [k, v] of Object.entries(cambios)) promedios["metricas." + CLAVES[k]] = v;
  return [usuarios, promedios];
};

// --- Random Forest: v(importancia, dirección, forma)
const v = (importanciaPromedio, direccion, forma = "lineal") => ({ importanciaPromedio, direccion, forma });
const modelo = (variables, f1 = 0.80, sinClasePositiva = false) => ({
  shap_resumen: variables,
  reporte_clasificacion: {
    "False": { precision: 0.8, recall: 0.8, "f1-score": 0.8, support: 100 },
    ...(sinClasePositiva ? {} : { "True": { precision: 0.8, recall: 0.8, "f1-score": f1, support: 100 } }),
    accuracy: 0.8
  }
});
const MODELOS_RF = ["conversion_sesion", "abandono_carrito", "abandono_formulario", "recurrencia_usuario"];

// Documento de un cierto análisis, con la fecha que corresponda al caso
// modo: undefined = vigente | "vencido" = un día antes del período | "exacto" = justo al inicio del período
const fechaDe = (desde, modo) =>
  modo === "vencido" ? new Date(desde.getTime() - DIA)
  : modo === "exacto" ? new Date(desde.getTime())
  : new Date(desde.getTime() + 20 * DIA);

function documentosDeAnalisis(siteId, desde, a = {}) {
  const docs = {};
  const f = (clave) => fechaDe(desde, (a.fechas || {})[clave]);

  // clusters: a.clusters = null (sin documento) | { silhouette, k, perfiles: [[usuarios, promedios], ...] }
  if (a.clusters !== null) {
    const c = { silhouette: 0.60, k: 2, perfiles: [cl(250), cl(250)], ...a.clusters };
    const doc = {
      siteId, fechaGeneracion: f("clusters"), k: c.perfiles.length, silhouette: c.silhouette,
      perfiles: Object.fromEntries(c.perfiles.map(([cantidadUsuarios, promedios], i) => [String(i), { cantidadUsuarios, promedios }]))
    };
    if (c.silhouette === null) delete doc.silhouette;                 // documento sin silhouette
    docs.analisis_clusters = doc;
  }

  // patrones: a.patrones = null | lista de patrones
  if (a.patrones !== null) {
    const patrones = a.patrones || [pat(["/home", "/producto", "/nosotros"], 0.30)];
    docs.analisis_patrones_secuenciales = { siteId, fechaGeneracion: f("patrones"), soporteMinimo: 0.10, patrones };
  }

  // apriori: a.apriori = null | { rutas: [...], eventos: [...] }
  if (a.apriori !== null) {
    const ap = a.apriori || { rutas: [regla(["/carrito"], ["/gracias"], 0.80, 2.5, 0.20)], eventos: [] };
    docs.analisis_apriori = {
      siteId, fechaCalculo: f("apriori"),
      apriori_rutas: { itemsets: [], reglas: ap.rutas || [] },
      apriori_eventosClave: { itemsets: [], reglas: ap.eventos || [] }
    };
  }

  // randomForest: a.rf = null | { nombreModelo: modelo(...) } (los que no se nombran quedan sanos)
  if (a.rf !== null) {
    const modelos = Object.fromEntries(MODELOS_RF.map(m => [m, modelo({ hora_dia: v(0.4, 0.5) })]));
    Object.assign(modelos, a.rf || {});
    docs.analisis_random_forest = { siteId, fechaCalculo: f("rf"), modelos };
  }
  return docs;
}


/*------------------------ ---------------------------
-------------------------- Registro de casos ---------
-------------------------- -------------------------*/
const COLECCIONES_ANALISIS = ["analisis_clusters", "analisis_patrones_secuenciales", "analisis_apriori", "analisis_random_forest"];

function nuevoLoteAnalisis() {
  const L = nuevoLote();
  for (const c of COLECCIONES_ANALISIS) L.docs[c] = [];
  return L;
}

// numero: número de caso | sufijo: "a", "b" (si el caso tiene dos pruebas) | spec: { sitio, clusters, patrones, apriori, rf, fechas }
function caso(L, numero, sufijo, regla_, datos, spec, esperado) {
  const siteId = PREFIJO + String(numero).padStart(3, "0") + sufijo;
  const s = sitio(L, numero, { ...(spec.sitio || {}), siteId });
  const docs = documentosDeAnalisis(siteId, s.desde, spec);
  for (const [coleccion, doc] of Object.entries(docs)) L.docs[coleccion].push(doc);
  L.casos.push({
    id: `E4-M1-${numero}${sufijo ? ` (${sufijo})` : ""}`, siteId, regla: regla_, datos,
    esperado: Array.isArray(esperado) ? esperado : [esperado]
  });
}

const SEC3 = ["/home", "/producto", "/gracias"];
const POCAS_SESIONES = { actual: { totalSesiones: 20 }, anterior: { totalSesiones: 20 } };   // + 15 usuarios, como los casos 4 y 38


/*------------------------ ---------------------------
-------------------------- Casos de la hoja 1 --------
-------------------------- -------------------------*/
function construir() {
  const L = nuevoLoteAnalisis();
  const c = (n, r, d, spec, e) => caso(L, n, "", r, d, spec, e);
  const rf = (modeloRF, variables) => ({ rf: { [modeloRF]: modelo(variables) } });   // una sola variable, importancia 0.3

  c(52, "Todas (análisis)", "Contexto base de análisis", {}, "Ninguna recomendación, aviso ni fortaleza");

  // --- Patrones secuenciales
  c(53, "PS-01", "Patrón [/home → /producto → /gracias], prop. 0.30",
    { patrones: [pat(SEC3, 0.30)] },
    "Fortaleza PS-01: “Un recorrido frecuente termina en compra: /home → /producto → /gracias.”");
  c(54, "PS-02", "Salida top = /producto; patrón [/home → /producto] prop. 0.25",
    { sitio: { salidaTop: ["/producto", 0.25] }, patrones: [pat(["/home", "/producto"], 0.25)] },
    "PS-02: severidad 1, alcance 0.25, puntaje 3.3 Baja");
  c(55, "PS-03", "Patrón de 7 pasos hasta /gracias, prop. 0.15",
    { patrones: [pat(["/home", "/producto", "/blog", "/contacto", "/carrito", "/pago", "/gracias"], 0.15)] },
    "PS-03: severidad 0.4, alcance 0.15, puntaje 1.4 Baja, “al menos 7 pasos”. También fortaleza PS-01");
  c(56, "PS-04", "3 patrones donde /producto es paso intermedio (prop. 0.15, 0.13, 0.12)",
    { patrones: [pat(["/home", "/producto", "/nosotros"], 0.15), pat(["/blog", "/producto", "/nosotros"], 0.13), pat(["/contacto", "/producto", "/nosotros"], 0.12)] },
    "PS-04: severidad 0.10 (piso), alcance 0.333, puntaje 1.2 Baja");
  c(57, "PS-05", "Lista de patrones vacía, 600 sesiones",
    { patrones: [] },
    "Calidad PS-05 con sesiones = 600");

  // --- Clusters
  c(58, "KM-01", "Cluster 0: 150 usuarios, conversión 0.08, interacciones 8; cluster 1: 350 usuarios",
    { clusters: { perfiles: [cl(150, { conversion: 0.08, interacciones: 8 }), cl(350)] } },
    "Fortaleza KM-01 (30% del total), cluster “0”");
  c(59, "KM-02", "Cluster 0: 150 usuarios (25 %), rebote 0.80; cluster 1: 450",
    { clusters: { perfiles: [cl(150, { rebote: 0.80 }), cl(450)] } },
    "KM-02: severidad 0.333, alcance 0.25, puntaje 1.8 Baja");
  c(60, "KM-03", "Cluster de 150: duración 6, páginas 7, conversión 0.01",
    { clusters: { perfiles: [cl(150, { duracion: 6, paginas: 7, conversion: 0.01 }), cl(350)] } },
    "KM-03: severidad 0.5, alcance 0.3, puntaje 2.3 Baja");
  c(61, "KM-04", "Cluster de 150: tiempoHastaConversion 400000 (ms), conversión 0.08",
    { clusters: { perfiles: [cl(150, { tiempo: 400000, conversion: 0.08 }), cl(350)] } },
    "KM-04: severidad 0.333, alcance 0.3, puntaje 1.6 Baja");
  c(62, "KM-05", "Silhouette 0.20, 500 usuarios activos",
    { clusters: { silhouette: 0.20 } },
    "Calidad KM-05 con silhouette 0.20");

  // --- Apriori
  c(63, "AP-01", "Ruta [/blog → /producto], confianza 0.80, lift 2.5, soporte 0.20",
    { apriori: { rutas: [regla(["/blog"], ["/producto"], 0.80, 2.5, 0.20)] } },
    "AP-01: severidad 0.667, alcance 0.2, puntaje 1.8 Baja");
  c(64, "AP-02", "eventosClave [click_boton_comprar → compra], confianza 0.75, lift 3",
    { apriori: { eventos: [regla(["click_boton_comprar"], ["compra"], 0.75, 3, 0.15)] } },
    "Fortaleza AP-02: “click boton comprar”");
  c(65, "AP-03", "Ruta [/blog → /gracias], confianza 0.80, lift 2.5",
    { apriori: { rutas: [regla(["/blog"], ["/gracias"], 0.80, 2.5, 0.20)] } },
    "AP-03: “Ver /blog aumenta la probabilidad de llegar a /gracias.” Puntaje 1.8 Baja");
  c(66, "AP-04", "Una sola regla con lift 1.2",
    { apriori: { rutas: [regla(["/home"], ["/producto"], 0.80, 1.2, 0.20)] } },
    "Calidad AP-04 con reglas = 1");

  // --- Random Forest: una variable por caso (importancia 0.3 -> severidad 1)
  c(67, "RF-01.1", "conversion_sesion: is_mobile dirección +0.6", rf("conversion_sesion", { is_mobile: v(0.3, 0.6) }),
    "RF-01.1: “celular… más conversiones”, 10 Alta. ⚠ También dispara RF-01.2 (duplicada)");
  c(68, "RF-01.2", "conversion_sesion: is_mobile dirección −0.6", rf("conversion_sesion", { is_mobile: v(0.3, -0.6) }),
    "RF-01.2: “computadora… más conversiones”, 10 Alta. ⚠ También dispara RF-01.1 (duplicada)");
  c(69, "RF-01.3", "conversion_sesion: referrer_google dirección +0.5", rf("conversion_sesion", { referrer_google: v(0.3, 0.5) }),
    "“…desde google se asocian con más conversiones.” 10 Alta");
  c(70, "RF-01.4", "conversion_sesion: rage_click dirección −0.5", rf("conversion_sesion", { rage_click: v(0.3, -0.5) }),
    "RF-01.4, 10 Alta");
  c(71, "RF-01.5", "conversion_sesion: cantidad_paginas dirección +0.5", rf("conversion_sesion", { cantidad_paginas: v(0.3, 0.5) }),
    "RF-01.5: “más páginas… más conversiones”, 10 Alta");
  c(72, "RF-01.6", "conversion_sesion: duracionSesion dirección +0.5", rf("conversion_sesion", { duracionSesion: v(0.3, 0.5) }),
    "RF-01.6: “visitas más largas… más conversiones”, 10 Alta");

  c(73, "RF-02.1", "abandono_carrito: is_mobile dirección +0.6", rf("abandono_carrito", { is_mobile: v(0.3, 0.6) }),
    "RF-02.1: “abandono… mayor en celular”, 10 Alta");
  c(74, "RF-02.3", "abandono_carrito: referrer_facebook dirección −0.5", rf("abandono_carrito", { referrer_facebook: v(0.3, -0.5) }),
    "RF-02.3: “…desde facebook abandonan menos el carrito”, 10 Alta");
  c(75, "RF-02.4", "abandono_carrito: rage_click dirección +0.5", rf("abandono_carrito", { rage_click: v(0.3, 0.5) }),
    "RF-02.4, 10 Alta");
  c(76, "RF-02.5", "abandono_carrito: cantidad_paginas dirección +0.5", rf("abandono_carrito", { cantidad_paginas: v(0.3, 0.5) }),
    "RF-02.5, 10 Alta");
  c(77, "RF-02.6", "abandono_carrito: duracionSesion dirección +0.5", rf("abandono_carrito", { duracionSesion: v(0.3, 0.5) }),
    "RF-02.6, 10 Alta");

  c(78, "RF-03.1", "abandono_formulario: is_mobile dirección +0.6", rf("abandono_formulario", { is_mobile: v(0.3, 0.6) }),
    "RF-03.1, 7 Alta");
  c(79, "RF-03.2", "abandono_formulario: referrer_google dirección +0.5", rf("abandono_formulario", { referrer_google: v(0.3, 0.5) }),
    "RF-03.2: “…desde google abandonan más los formularios”, 7 Alta");
  c(80, "RF-03.3", "abandono_formulario: rage_click dirección +0.5", rf("abandono_formulario", { rage_click: v(0.3, 0.5) }),
    "RF-03.3, 7 Alta");
  c(81, "RF-03.4", "abandono_formulario: cantidad_paginas dirección +0.5", rf("abandono_formulario", { cantidad_paginas: v(0.3, 0.5) }),
    "RF-03.4, 7 Alta");
  c(82, "RF-03.5", "abandono_formulario: duracionSesion dirección +0.5", rf("abandono_formulario", { duracionSesion: v(0.3, 0.5) }),
    "RF-03.5, 7 Alta");

  c(83, "RF-04.1", "recurrencia_usuario: is_mobile dirección +0.6", rf("recurrencia_usuario", { is_mobile: v(0.3, 0.6) }),
    "RF-04.1: “desde celular tienden a volver”, 7 Alta. ⚠ También dispara RF-04.2 (duplicada)");
  c(84, "RF-04.2", "recurrencia_usuario: is_mobile dirección −0.6", rf("recurrencia_usuario", { is_mobile: v(0.3, -0.6) }),
    "RF-04.2: “desde computadora tienden a volver”, 7 Alta. ⚠ También dispara RF-04.1 (duplicada)");
  c(85, "RF-04.3", "recurrencia_usuario: referrerOriginal_google dirección +0.6", rf("recurrencia_usuario", { referrerOriginal_google: v(0.3, 0.6) }),
    "“…desde google tienden a volver.”, 7 Alta");
  c(86, "RF-04.4", "recurrencia_usuario: cantidad_paginas dirección +0.6 (lineal)", rf("recurrencia_usuario", { cantidad_paginas: v(0.3, 0.6) }),
    "RF-04.4: “más páginas… más regresos”, 7 Alta");
  c(87, "RF-04.5", "recurrencia_usuario: duracionSesion dirección −0.6 (lineal)", rf("recurrencia_usuario", { duracionSesion: v(0.3, -0.6) }),
    "RF-04.5: “más duración… menos regresos”, 7 Alta");

  // --- Transversales
  c(88, "PS-01, PS-05", "Fecha del análisis de patrones = un día antes de periodo.actual.desde; patrón [/home → /producto → /gracias] 0.30",
    { patrones: [pat(SEC3, 0.30)], fechas: { patrones: "vencido" } },
    "Análisis vencido: no dispara PS-01 ni PS-05");
  c(89, "Todas (análisis)", "Sin ningún documento de análisis",
    { clusters: null, patrones: null, apriori: null, rf: null },
    "Ninguna regla de análisis se dispara, tampoco KM-05. 0 recomendaciones, 0 avisos, 0 fortalezas");

  // --- Casos que hoy fallan o están por definir
  c(90, "KM-02", "Igual a E4-M1-59, con rebote 1.0",
    { clusters: { perfiles: [cl(150, { rebote: 1.0 }), cl(450)] } },
    "Esperado: severidad 1. ⚠ Hoy da 0.667, porque no pasa maximo = 1 como INT-01");
  c(91, "RF-01.1", "Una sola variable, is_mobile con importancia 0.05 (mínima) y dirección +0.6",
    rf("conversion_sesion", { is_mobile: v(0.05, 0.6) }),
    "Dispara. ⚠ Severidad 1 y puntaje 10 Alta con importancia mínima: a definir si es lo deseado");

  return L;
}


/*------------------------ ---------------------------
-------------------------- Ejecución -----------------
-------------------------- -------------------------*/
const COLECCIONES = [
  ["sitios", "_id"], ["metricas_resumen", "siteId"], ["sesiones", "siteId"],
  ["eventos", "metadata.siteId"], ["formularios", "siteId"], ["usuarios", "siteId"],
  ...COLECCIONES_ANALISIS.map(c => [c, "siteId"])
];

function imprimirCasos(casos) {
  for (const k of casos) {
    console.log(`\n=== ${k.id}  ${k.siteId}  (${k.regla}) ===`);
    console.log(k.datos);
    console.log("ESPERADO:");
    for (const linea of k.esperado) console.log("  - " + linea);
  }
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
    for (const [coleccion, campo] of COLECCIONES) {
      const r = await db.collection(coleccion).deleteMany({ [campo]: /^TEST_AN_/ });
      console.log(`Borrados ${r.deletedCount} documentos de ${coleccion}`);
    }
    if (modo === "limpiar") return;

    imprimirCasos(casos);
    for (const [coleccion] of COLECCIONES) {
      if (docs[coleccion].length > 0) await db.collection(coleccion).insertMany(docs[coleccion]);
    }
    console.log("\nInsertados:", resumen());
    console.log("Ahora corré recomendaciones.js y mirá la colección 'recomendaciones' (siteId que empiece con TEST_AN_).");
  } finally {
    await client.close();
  }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { construir };