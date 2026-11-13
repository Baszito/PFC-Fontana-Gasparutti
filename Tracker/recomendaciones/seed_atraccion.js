/*------------------------ ---------------------------
-------------------------- Seed de la hoja 1 (funnel) -
-------------------------- -------------------------*/
// Siembra en la base los datos CRUDOS (metricas_resumen, sesiones, eventos, formularios, usuarios)
// de un sitio por cada caso de la hoja 1 que NO es de análisis: E4-M1-1 a E4-M1-51.
// El sitio de cada caso se llama TEST_M1_NN (NN = número del caso, con dos dígitos).
// Después se corre recomendaciones.js (leerContextos arma el contexto a partir de estos datos) y se
// compara con lo que este script imprime como "ESPERADO", que es el "Resultado esperado" de la hoja.
//
// Todos los sitios parten del mismo contexto base (el de contextoBase.js, pero armado con datos
// crudos) y cada caso cambia solo lo que dice la columna "Datos".
//
// NO se pueden sembrar (no son datos, se prueban con probar.js):
//   E4-M1-43 y E4-M1-44   una sección en null (es un error de lectura, no un dato)
//   E4-M1-51              una regla que lanza un error (depende del catálogo)
//
// Se borra solo lo que tenga prefijo TEST_M1_ (y TEST_ATR_, del seed anterior).
//   node seed_atraccion.js            -> borra lo anterior y siembra
//   node seed_atraccion.js limpiar    -> solo borra
//   node seed_atraccion.js seco       -> no toca la base: imprime los casos y cuántos documentos generaría
// Conexión: MONGO_URI (por defecto mongodb://mongo:27017), base PruebaBBDD.

const uri = process.env.MONGO_URI || "mongodb://mongo:27017";

const PREFIJO = "TEST_M1_";
const PREFIJOS_BORRAR = /^TEST_(M1|ATR)_/;
const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;
const url = (ruta) => `https://tienda.com${ruta}`;


/*------------------------ ---------------------------
-------------------------- Contexto base -------------
-------------------------- -------------------------*/
// Valores de contextoBase.js. Cada caso los pisa con "actual", "anterior", "paginas", etc.
const metricasBase = () => ({
  totalSesiones: 600, usuariosNuevos: 400, usuariosRecurrentes: 180, totalUsuarios: 600,
  tasaRebote: 0.40, tasaConversion: 0.04, paginasPorSesionPromedio: 3.5,
  duracionSesionPromedio: 3,          // minutos
  tiempoConversionPromedio: 120       // segundos
});

const paginasBase = () => ({
  "/home":     { pageviews: 700, clicksMuertos: 7,  rageClicks: 3, scrollDepthPromedio: 0.70, tiempoPromedioPagina: 40,
                 elementos: [{ elemento: "btn-comprar", goal: "compra", hoverPromedio: 1.5 }] },
  "/producto": { pageviews: 500, clicksMuertos: 10, rageClicks: 5, scrollDepthPromedio: 0.65, tiempoPromedioPagina: 35, elementos: [] },
  "/contacto": { pageviews: 300, clicksMuertos: 3,  rageClicks: 1, scrollDepthPromedio: 0.60, tiempoPromedioPagina: 30, elementos: [] }
});

const formulariosBase = () => [{ formId: "contacto", total: 50, tasaAbandono: 0.30, campo: "telefono" }];

const usuariosBase = () => ({
  activos: 500, recurrentes: 150, interacciones: 5, dias: 4,
  recFrecuencia: 0.5, recConversion: 0.05, nueConversion: 0.04
});


/*------------------------ ---------------------------
-------------------------- Generadores ---------------
-------------------------- -------------------------*/
function nuevoLote() {
  return { docs: { sitios: [], metricas_resumen: [], sesiones: [], eventos: [], formularios: [], usuarios: [] }, casos: [], contador: 0 };
}

// Reparte n elementos entre categorías según su fracción; la última se queda con el resto
// (así la suma da siempre n). partes: [[valor, fraccion], ...]
function repartir(n, partes) {
  const lista = [];
  partes.forEach(([valor, fraccion], i) => {
    const cantidad = i === partes.length - 1 ? n - lista.length : Math.round(n * fraccion);
    for (let k = 0; k < cantidad; k++) lista.push(valor);
  });
  return lista;
}

// Un sitio completo. Opciones (todas opcionales; sin opciones es el sitio base):
//   actual, anterior     métricas del sitio que se pisan en cada snapshot (anterior: null = sin período anterior)
//   vacio                true = período actual sin sesiones (ventana vacía)
//   paginas              { "/ruta": { campo: valor } } cambios sobre las páginas del base
//   formularios          lista completa de formularios [{ formId, total, tasaAbandono, campo }]
//   fEntrada, fPais, fMovil, fOrigen   fracción de la categoría más frecuente
//   salidaTop            [página, fracción] de la página de abandono más frecuente
//   carrito              { con, abandono }: sesiones con carrito y cuántas de ellas no compran
//   compradores          { total, unaSesion }: usuarios que compran y cuántos tienen una sola sesión
//   usuarios             { activos, recurrentes, interacciones, dias, recFrecuencia, recConversion, nueConversion }
//   sinSalida            true = las sesiones no traen página de abandono
//   siteId               nombre del sitio (por defecto TEST_M1_NN)
function sitio(lote, numero, o = {}) {
  const { docs } = lote;
  const siteId = o.siteId ?? PREFIJO + String(numero).padStart(2, "0");   // o.siteId lo usa seed_analisis.js
  const ahora = new Date();
  const hace = (ms) => new Date(ahora.getTime() - ms);

  // Línea de tiempo: período anterior = (T_A, T_B], período actual = (T_B, T_C]
  const T_A = hace(60 * DIA), T_B = hace(30 * DIA), T_C = hace(5 * MIN);
  const EN_ACTUAL = hace(10 * DIA);

  const vacio = !!o.vacio;
  const actual = vacio
    ? { totalSesiones: 0, usuariosNuevos: 0, usuariosRecurrentes: null, totalUsuarios: null, tasaRebote: null, tasaConversion: null,
        paginasPorSesionPromedio: null, duracionSesionPromedio: null, tiempoConversionPromedio: null }
    : { ...metricasBase(), ...o.actual };
  const n = actual.totalSesiones;
  const chico = n < 100;                                   // con tan pocas sesiones no hay carritos ni compras
  const carrito = { con: chico ? 0 : 60, abandono: chico ? 0 : 30, ...o.carrito };
  const compradores = { total: chico ? 0 : 40, unaSesion: chico ? 0 : 20, ...o.compradores };
  const u = { ...usuariosBase(), ...o.usuarios };
  if (vacio) u.activos = 0;
  const paginas = vacio ? {} : (() => {
    const p = paginasBase();
    for (const [ruta, cambios] of Object.entries(o.paginas || {})) p[ruta] = { ...p[ruta], ...cambios };
    return p;
  })();
  const formularios = vacio ? [] : (o.formularios || formulariosBase());

  docs.sitios.push({ _id: siteId });

  // --- metricas_resumen
  const snapshot = (fechaCalculo, valores, pags = [], forms = []) =>
    docs.metricas_resumen.push({ siteId, fechaCalculo, ...valores, metricas_paginas: pags, metricas_formularios: forms });

  if (o.anterior !== null) {
    snapshot(T_A, { totalSesiones: 50, usuariosNuevos: 40, usuariosRecurrentes: 2, totalUsuarios: 42 });
    snapshot(T_B, { ...metricasBase(), ...o.anterior });
  }
  snapshot(
    T_C, actual,
    Object.entries(paginas).map(([ruta, p]) => ({ pagina: url(ruta), ...p })),
    formularios.map(f => ({ formId: f.formId, tasaAbandono: f.tasaAbandono, campoAbandonoMasComun: f.campo ?? null, tiempoPromedioCompletado: 50 }))
  );

  // --- formularios: uno por cada formulario iniciado en el período actual
  for (const f of formularios) {
    const abandonados = Math.round(f.total * f.tasaAbandono);
    for (let i = 0; i < f.total; i++) {
      const abandono = i < abandonados;
      const k = ++lote.contador;
      const doc = {
        siteId, userId: `f${k}`, sessionId: `${siteId}_f${k}`,
        Inicio: new Date(EN_ACTUAL.getTime() - 10 * MIN), Fin: new Date(EN_ACTUAL.getTime() - 5 * MIN),
        id_formulario: f.formId, completado: !abandono, camposInteractuados: [], revisado: EN_ACTUAL
      };
      if (abandono && f.campo) doc.ultimoCampoCompleto = f.campo;
      docs.formularios.push(doc);
    }
  }

  // --- sesiones: cada atributo se reparte por separado
  const fEntrada = o.fEntrada ?? 0.40, fPais = o.fPais ?? 2 / 3, fMovil = o.fMovil ?? 0.55;
  const entradas = repartir(n, [["/home", fEntrada], ["/producto", (1 - fEntrada) / 2], ["/contacto", 0]]);
  const paises = repartir(n, [["AR", fPais], ["UY", (1 - fPais) / 2], ["CL", 0]]);
  const moviles = repartir(n, [[true, fMovil], [false, 0]]);
  // salidaTop = [página, fracción]: el resto se reparte en partes iguales entre otras 4 páginas
  // (con fracción 0.50 da 0.125 cada una, igual que antes)
  const salidas = o.salidaTop
    ? (() => {
        const [top, f] = o.salidaTop;
        const otras = ["/home", "/producto", "/contacto", "/blog", "/carrito"].filter(p => p !== top).slice(0, 4);
        return repartir(n, [[top, f], ...otras.slice(0, 3).map(p => [p, (1 - f) / 4]), [otras[3], 0]]);
      })()
    : repartir(n, [["/home", 0.2], ["/producto", 0.2], ["/contacto", 0.2], ["/blog", 0.2], ["/gracias", 0]]);   // ninguna supera 30 %

  // Carritos y compras: A = carrito sin compra | Cc = carrito con compra | Co = compra sin carrito
  const T = Math.min(compradores.total, u.activos);
  const A = carrito.abandono, Cc = carrito.con - carrito.abandono, Co = Math.max(0, T - Cc);
  let compradorN = 0;
  for (let i = 0; i < n; i++) {
    const k = ++lote.contador;
    const subtipos = [];
    if (i < A) subtipos.push("agregar_carrito");
    else if (i < A + Cc) subtipos.push("agregar_carrito", "compra");
    else if (i < A + Cc + Co) subtipos.push("compra");
    const compra = subtipos.includes("compra");
    const userId = compra ? `u${++compradorN}` : `x${k}`;     // los que compran son los primeros usuarios

    const inicio = new Date(EN_ACTUAL.getTime() - 20 * MIN), Fin = new Date(EN_ACTUAL.getTime() - 1 * MIN);
    const sessionId = `${siteId}_s${k}`;
    docs.sesiones.push({
      siteId, userId, sessionId, inicio, Fin, revisado: EN_ACTUAL, referrer: "directo",
      rutas: [{ pagina: url(entradas[i]), timestamp: inicio }, { pagina: url(salidas[i]), timestamp: Fin }],
      paginaInicio: url(entradas[i]), ...(o.sinSalida ? {} : { paginaAbandono: url(salidas[i]) }),   // sinSalida: ninguna sesión trae página de abandono
      duracionSesion: 5, esRebote: false,
      eventosClave: subtipos.map(subtipo => ({ tipo: "objetivo", subtipo, timestamp: Fin })),
      is_mobile: moviles[i], geo: { pais: paises[i] }
    });
    if (compra) {
      docs.eventos.push({
        timestamp: Fin, revisado: EN_ACTUAL,
        metadata: { siteId, sessionId, tipo: "objetivo", subtipo: "compra", pagina: url("/gracias") }
      });
    }
  }

  // --- usuarios activos en el período (última sesión dentro de él)
  // Los primeros T son los compradores: los primeros "unaSesion" tienen una sola sesión y el resto más de una.
  // Después se completan los recurrentes hasta llegar a u.recurrentes.
  const fOrigen = o.fOrigen ?? 0.50;
  const origenes = repartir(u.activos, [["google", fOrigen], ["directo", (1 - fOrigen) * 0.6], ["instagram", 0]]);
  let recurrentesFaltan = Math.max(0, u.recurrentes - Math.max(0, T - compradores.unaSesion));
  for (let i = 1; i <= u.activos; i++) {
    let totalSesiones = 1;
    if (i <= T) totalSesiones = i <= compradores.unaSesion ? 1 : 2;
    else if (recurrentesFaltan > 0) { totalSesiones = 2; recurrentesFaltan--; }
    const recurrente = totalSesiones > 1;
    docs.usuarios.push({
      _id: `${siteId}_u${i}`, siteId, userId: `u${i}`, totalSesiones, fechaInicio: hace(50 * DIA),
      metricas: {
        totalSesiones, duracionPromedio: 3, tasaRebote: 0.4, paginasPorSesionPromedio: 3.5,
        tasaConversion: recurrente ? u.recConversion : u.nueConversion,
        primeraSesion: hace(50 * DIA), ultimaSesion: EN_ACTUAL,
        diasActivo: u.dias, frecuenciaRecurrencia: recurrente ? u.recFrecuencia : 0,
        tasaAbandonoCarrito: 0, origenPredominante: origenes[i - 1], interaccionesPromedio: u.interacciones, tiempoHastaConversion: null
      }
    });
  }

  return { siteId, activos: u.activos, desde: T_B };   // desde = inicio del período actual (lo usa seed_analisis.js)
}

// Registra un caso: siembra el sitio y guarda lo que se imprime como ESPERADO
function caso(lote, numero, regla, datos, opciones, esperado) {
  const s = sitio(lote, numero, opciones);
  const lineas = Array.isArray(esperado) ? esperado : [esperado];
  lote.casos.push({ id: `E4-M1-${numero}`, siteId: s.siteId, regla, datos, esperado: lineas });
}


/*------------------------ ---------------------------
-------------------------- Casos de la hoja 1 --------
-------------------------- -------------------------*/
function construir() {
  const L = nuevoLote();
  const c = (...args) => caso(L, ...args);

  c(1, "–", "Contexto base, sin cambios", {}, "0 recomendaciones, 0 avisos de calidad, 0 fortalezas");

  // --- Atracción
  c(2, "ATR-01", "ant.usuariosNuevos = 600 (act. 400)", { anterior: { usuariosNuevos: 600 } },
    "ATR-01: “Están llegando menos visitantes nuevos que en el período anterior (33% menos).”");
  c(3, "ATR-02", "ant.totalSesiones = 900 (act. 600)", { anterior: { totalSesiones: 900 } },
    "ATR-02: “El tráfico del sitio cayó 33% respecto del período anterior.”");
  c(4, "ATR-03", "totalSesiones = 12 en act. y ant.",
    { actual: { totalSesiones: 12 }, anterior: { totalSesiones: 12 }, usuarios: { activos: 15 } },
    "En calidad: ATR-03 “Hubo muy pocas visitas (12) para sacar conclusiones fiables.” 0 recomendaciones");
  c(5, "ATR-04", "paginaInicio.top = /home con 420 de 600", { fEntrada: 0.70 },
    "ATR-04: “La mayoría de las visitas (70%) entra por una sola página: /home.”");
  c(6, "ATR-05", "pais.top = AR con 540 de 600", { fPais: 0.90 },
    "ATR-05: “Casi todas las visitas (90%) provienen de AR.”");
  c(7, "ATR-06", "movil = 420, desktop = 180", { fMovil: 0.70 },
    "ATR-06: “La mayoría de las visitas (70%) llega desde un celular.”");
  c(8, "ATR-07", "movil = 180, desktop = 420", { fMovil: 0.30 },
    "ATR-07: “La mayoría de las visitas (70%) llega desde un ordenador.”");
  c(9, "ATR-08", "origenes.top = google con 400 de 500", { fOrigen: 0.80 },
    "ATR-08: “Gran parte de tus visitantes (80%) viene de un solo origen: google.”");

  // --- Interés
  c(10, "INT-01", "tasaRebote = 0.75 en act. y ant.", { actual: { tasaRebote: 0.75 }, anterior: { tasaRebote: 0.75 } },
    "INT-01: “El 75% de las visitas se va sin interactuar con el sitio.”");
  c(11, "INT-02", "act. tasaRebote = 0.50 (ant. 0.40)", { actual: { tasaRebote: 0.50 } },
    "INT-02: “El abandono inmediato aumentó 25% respecto del período anterior.”");
  c(12, "INT-03", "act. duracionSesionPromedio = 0.5", { actual: { duracionSesionPromedio: 0.5 } },
    "INT-03: “Las visitas duran en promedio 0.5 minutos, un tiempo muy corto.”");
  c(13, "INT-04", "act. paginasPorSesionPromedio = 1.2", { actual: { paginasPorSesionPromedio: 1.2 } },
    "INT-04: “Cada visitante ve en promedio 1.2 páginas.”");
  c(14, "INT-05", "/producto.scrollDepthPromedio = 0.30", { paginas: { "/producto": { scrollDepthPromedio: 0.30 } } },
    "INT-05: “En /producto poca gente llega al final: el desplazamiento promedio es 30%.”");
  c(15, "INT-06", "/producto.tiempoPromedioPagina = 5", { paginas: { "/producto": { tiempoPromedioPagina: 5 } } },
    "INT-06: “La página /producto recibe muchas visitas pero se mira muy poco tiempo (5 s).”");

  // --- Consideración
  c(16, "CON-01", "/home, elemento btn-comprar (meta compra) con hoverPromedio = 5",
    { paginas: { "/home": { elementos: [{ elemento: "btn-comprar", goal: "compra", hoverPromedio: 5 }] } } },
    "CON-01: “Los visitantes se detienen mucho tiempo sobre btn-comprar (5 s) antes de decidir.”");
  c(17, "CON-02", "/producto.clicksMuertos = 50 (10 % de 500)", { paginas: { "/producto": { clicksMuertos: 50 } } },
    "CON-02: “En /producto hay 50 clics sobre elementos que no responden.”");
  c(18, "CON-03", "/producto.rageClicks = 25 (5 % de 500)", { paginas: { "/producto": { rageClicks: 25 } } },
    "CON-03: “En /producto los visitantes hacen clics repetidos y rápidos, señal de frustración (25 casos).”");
  c(19, "CON-04", "usuarios.interaccionesPromedio = 1.5", { usuarios: { interacciones: 1.5 } },
    "CON-04: “Los visitantes interactúan poco con el sitio (1.5 acciones por visita).”");
  c(20, "CON-05", "act. tiempoConversionPromedio = 500", { actual: { tiempoConversionPromedio: 500 } },
    "CON-05: “Los visitantes que compran tardan en promedio 500 segundos en decidirse.”");

  // --- Acción
  c(21, "ACC-01", "tasaConversion = 0.01 y totalSesiones = 400 en act. y ant.",
    { actual: { totalSesiones: 400, tasaConversion: 0.01 }, anterior: { totalSesiones: 400, tasaConversion: 0.01 } },
    "ACC-01: “Solo el 1% de las visitas termina en una compra o contacto.”");
  c(22, "ACC-02", "ant. tasaConversion = 0.05, act. = 0.03", { actual: { tasaConversion: 0.03 }, anterior: { tasaConversion: 0.05 } },
    "ACC-02: “La conversión cayó 40% respecto del período anterior.”");
  c(23, "ACC-03", "tasaConversion = 0.01 en act. y ant. (sesiones 600)",
    { actual: { tasaConversion: 0.01 }, anterior: { tasaConversion: 0.01 } },
    ["ACC-03: “Tenés buen tráfico pero pocas conversiones: el desafío no es atraer más visitas, sino convertir.”",
     "Y también ACC-01 (“Solo el 1%...”), porque ACC-03 siempre acompaña a ACC-01"]);
  c(24, "ACC-04", "totalSesiones = 300 y tasaConversion = 0.06 en act. y ant.",
    { actual: { totalSesiones: 300, tasaConversion: 0.06 }, anterior: { totalSesiones: 300, tasaConversion: 0.06 } },
    "En fortalezas: ACC-04 “Tu sitio convierte bien (6%), pero recibe pocas visitas.” 0 recomendaciones");
  c(25, "ACC-05", "carrito.abandonoCarrito = 54 (de 60)", { carrito: { con: 60, abandono: 54 } },
    "ACC-05: “El 90% de quienes agregan productos al carrito no compra.”");
  c(26, "ACC-06", "formulario contacto: tasaAbandono = 0.80, campoAbandonoMasComun = null",
    { formularios: [{ formId: "contacto", total: 50, tasaAbandono: 0.80, campo: null }] },
    "ACC-06: “El 80% de quienes empiezan el formulario contacto no lo terminan.” (ACC-07 no, falta el campo)");
  c(27, "ACC-07", "formulario contacto: tasaAbandono = 0.80, campoAbandonoMasComun = “telefono”",
    { formularios: [{ formId: "contacto", total: 50, tasaAbandono: 0.80, campo: "telefono" }] },
    ["ACC-07: “La mayoría abandona el formulario contacto después del campo “telefono”.”", "Y también ACC-06"]);
  c(28, "ACC-08", "paginaAbandono.top = /carrito con 300 de 600", { salidaTop: ["/carrito", 0.50] },
    "ACC-08: “Muchas visitas terminan en /carrito (50%).”");

  // --- Fidelización
  c(29, "FID-01", "usuariosRecurrentes = 60 (de 600) en act. y ant.",
    { actual: { usuariosRecurrentes: 60 }, anterior: { usuariosRecurrentes: 60 } },
    "FID-01: “Solo el 10% de tus visitantes vuelve al sitio.”");
  c(30, "FID-02", "ant. usuariosRecurrentes = 240 (40 %), act. 180 (30 %)", { anterior: { usuariosRecurrentes: 240 } },
    "FID-02: “La proporción de visitantes que vuelve bajó 25% respecto del período anterior.”");
  c(31, "FID-03", "recurrentes.frecuenciaPromedio = 0.1", { usuarios: { recFrecuencia: 0.1 } },
    "FID-03: “Quienes vuelven lo hacen de forma espaciada.”");
  c(32, "FID-04", "diasActivoPromedio = 1", { usuarios: { dias: 1 } },
    "FID-04: “La relación de los visitantes con el sitio dura pocos días.”");
  c(33, "FID-05", "recurrentes.tasaConversionPromedio = 0.10 (nuevos 0.04)", { usuarios: { recConversion: 0.10 } },
    "En fortalezas: FID-05 “Quienes vuelven compran más que quienes llegan por primera vez.”");
  c(34, "FID-06", "compradores.unaSesion = 36 (de 40)", { compradores: { total: 40, unaSesion: 36 } },
    "FID-06: “El 90% de quienes compran no vuelve al sitio.”");
  c(35, "FID-07", "act. usuariosRecurrentes = 300 (50 % de 600)", { actual: { usuariosRecurrentes: 300 } },
    "En fortalezas: FID-07 “Una buena parte de tus visitantes (50%) vuelve al sitio: tenés una base fiel.”");

  // --- Transversales
  c(36, "ATR-04", "Umbral exacto: paginaInicio.top con 360 de 600 (60 %)", { fEntrada: 0.60 },
    "No se genera: el umbral exige superar el 60 %");
  c(37, "ATR-02", "Umbral exacto: ant.totalSesiones = 750 (act. 600, −20 %)", { anterior: { totalSesiones: 750 } },
    "No se genera: la caída tiene que superar el 20 %");
  c(38, "INT-01", "Datos insuficientes: totalSesiones = 20 y tasaRebote = 0.9 en act. y ant.",
    { actual: { totalSesiones: 20, tasaRebote: 0.9 }, anterior: { totalSesiones: 20, tasaRebote: 0.9 }, usuarios: { activos: 15 } },
    "Solo el aviso ATR-03 en calidad. INT-01 no se genera (mínimo 30 sesiones)");
  c(39, "INT-05, CON-03", "Datos insuficientes: /producto.pageviews = 10, scroll 0.1, rageClicks 5",
    { paginas: { "/producto": { pageviews: 10, scrollDepthPromedio: 0.1, rageClicks: 5 } } },
    "No se genera INT-05 ni CON-03 (mínimo 20 visitas por página)");
  c(40, "ACC-06, ACC-07", "Datos insuficientes: contacto con total = 8 y tasaAbandono = 0.9",
    { formularios: [{ formId: "contacto", total: 8, tasaAbandono: 0.9, campo: "telefono" }] },
    "No se genera ACC-06 ni ACC-07 (mínimo 10 formularios)");
  c(41, "ACC-05", "Datos insuficientes: conCarrito = 8, abandonoCarrito = 8", { carrito: { con: 8, abandono: 8 } },
    "No se genera ACC-05 (mínimo 10 carritos)");
  c(42, "CON-04, FID-04", "Datos insuficientes: activos = 10, interaccionesPromedio = 1, diasActivoPromedio = 1",
    { usuarios: { activos: 10, interacciones: 1, dias: 1 }, compradores: { total: 0, unaSesion: 0 } },
    "No se genera CON-04 ni FID-04 (mínimo 20 usuarios)");
  // E4-M1-43, 44 y 51: no se siembran (ver el encabezado)
  c(45, "ATR-01, ATR-02, ATR-03, ACC-02", "Período vacío: act. = ventana vacía (totalSesiones 0, usuariosNuevos 0, resto null); ant. = base",
    { vacio: true },
    ["ATR-01 (100 % menos), ATR-02 (cayó 100 %) y ACC-02 (cayó 100 %); en calidad ATR-03 con “(0)”.",
     "Observación: hoy ACC-02 se genera con un período vacío; confirmar si es lo deseado"]);
  c(46, "ATR-01, ATR-02, INT-02, ACC-02, FID-02", "Sin período anterior: ant. = null", { anterior: null },
    "Sin error. Las reglas de variación no se evalúan. 0 recomendaciones");
  c(47, "INT-05", "Varias páginas: /producto.scroll = 0.30 y /contacto.scroll = 0.20",
    { paginas: { "/producto": { scrollDepthPromedio: 0.30 }, "/contacto": { scrollDepthPromedio: 0.20 } } },
    "2 recomendaciones INT-05, una por página (30 % y 20 %)");
  c(48, "CON-01", "Varios elementos: /home con btn-comprar (meta compra, hover 5), btn-suscribir (meta suscripcion, hover 4) y logo (sin meta, hover 9)",
    { paginas: { "/home": { elementos: [
        { elemento: "btn-comprar", goal: "compra", hoverPromedio: 5 },
        { elemento: "btn-suscribir", goal: "suscripcion", hoverPromedio: 4 },
        { elemento: "logo", hoverPromedio: 9 }] } } },
    "2 recomendaciones CON-01 (btn-comprar 5 s, btn-suscribir 4 s). El elemento sin meta no genera");
  c(49, "ACC-06", "Varios formularios: contacto (total 50, abandono 0.80) y cotizacion (total 30, abandono 0.70), sin campo",
    { formularios: [
        { formId: "contacto", total: 50, tasaAbandono: 0.80, campo: null },
        { formId: "cotizacion", total: 30, tasaAbandono: 0.70, campo: null }] },
    "2 recomendaciones ACC-06: una con 80 % para contacto y otra con 70 % para cotizacion");
  c(50, "FID-05, FID-07", "Dos fortalezas a la vez: act. usuariosRecurrentes = 300; recurrentes.tasaConversionPromedio = 0.10 (nuevos 0.04)",
    { actual: { usuariosRecurrentes: 300 }, usuarios: { recConversion: 0.10 } },
    "2 fortalezas en fortalezas (FID-05 y FID-07). 0 recomendaciones");

  return L;
}


/*------------------------ ---------------------------
-------------------------- Ejecución -----------------
-------------------------- -------------------------*/
const COLECCIONES = [
  ["sitios", "_id"], ["metricas_resumen", "siteId"], ["sesiones", "siteId"],
  ["eventos", "metadata.siteId"], ["formularios", "siteId"], ["usuarios", "siteId"]
];

function imprimirCasos(casos) {
  for (const k of casos) {
    console.log(`\n=== ${k.id}  ${k.siteId}  (${k.regla}) ===`);
    console.log(k.datos);
    console.log("ESPERADO:");
    for (const linea of k.esperado) console.log("  - " + linea);
  }
  console.log("\nNo sembrados (se prueban con probar.js): E4-M1-43, E4-M1-44 y E4-M1-51");
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
      const r = await db.collection(coleccion).deleteMany({ [campo]: PREFIJOS_BORRAR });
      console.log(`Borrados ${r.deletedCount} documentos de ${coleccion}`);
    }
    if (modo === "limpiar") return;

    imprimirCasos(casos);
    for (const [coleccion] of COLECCIONES) {
      if (docs[coleccion].length > 0) await db.collection(coleccion).insertMany(docs[coleccion]);
    }
    console.log("\nInsertados:", resumen());
    console.log("Ahora corré recomendaciones.js y mirá la colección 'recomendaciones' (siteId que empiece con TEST_M1_).");
  } finally {
    await client.close();
  }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { construir, sitio, nuevoLote };