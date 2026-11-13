/*------------------------ ---------------------------
-------------------------- Catalogo de reglas --------
-------------------------- -------------------------*/
// Por ahora solo ETAPA ATRACCIÓN (ATR-01..08), copiadas de Recomendaciones_1_.xlsx.
// Cada regla es un objeto:
//   id, etapa, tipo       tipo: "Variación" | "Umbral" | "Calidad de datos"
//   impacto (1-3), esfuerzo
//   evaluar(ctx, P)       null si no se dispara; si se dispara: { severidad, alcance, datos, evidencia }
//   texto(evidencia), accion
// ctx es el contexto de UN sitio (lo que devuelve leerContextos).
// Una sección del contexto en null (falló la lectura) hace que las reglas que la usan no se disparen.

const limitar = (x) => Math.min(1, Math.max(0, x));
const pct = (x) => Math.round(x * 100);

// S1: el valor supera un umbral superior
const severidadS1 = (valor, umbral) => limitar((valor - umbral) / umbral);
// S2: el valor cae por debajo de un umbral inferior
const severidadS2 = (valor, umbral) => limitar((umbral - valor) / umbral);
// S3: la variación supera (en valor absoluto) la variación umbral
const severidadS3 = (variacion, umbral) => limitar((Math.abs(variacion) - Math.abs(umbral)) / Math.abs(umbral));
// S4: la variación supera (en valor absoluto) la variación umbral, y además el valor actual está por debajo de un umbral inferior
const severidadS4 = (proporcion, soporteMin) => limitar(proporcion / (2 * soporteMin));


// Caída de una métrica del sitio respecto del período anterior (umbral negativo).
// La confianza se mide sobre el período anterior (la base de comparación): que el actual
// tenga pocos datos puede ser justamente la señal de la caída.
function evaluarCaida(ctx, P, campo, umbral) {
  if (!ctx.sitio || !ctx.sitio.anterior) return null;
  const { actual, anterior } = ctx.sitio;
  if (anterior.totalSesiones < P.MIN_SESIONES) return null;
  if (!(anterior[campo] > 0)) return null;
  const variacion = (actual[campo] - anterior[campo]) / anterior[campo];
  if (variacion >= umbral) return null;                 // tiene que caer MÁS que el umbral
  return {
    severidad: severidadS3(variacion, umbral),
    alcance: 1,                                         // A1: métrica global del sitio
    datos: anterior.totalSesiones,
    evidencia: { variacion, actual: actual[campo], anterior: anterior[campo] }
  };
}

// Proporción concentrada en un valor (página de ingreso, país, dispositivo, origen)
function evaluarConcentracion(cantidad, total, minimo, umbral, extra) {
  if (!total || total < minimo) return null;
  const proporcion = cantidad / total;
  if (proporcion <= umbral) return null;
  return {
    severidad: severidadS1(proporcion, umbral),
    alcance: proporcion,                                // A3: el propio porcentaje medido
    datos: total,
    evidencia: { proporcion, ...extra }
  };
}

// Un documento de análisis solo se usa si es del período actual
function analisisVigente(ctx, clave) {                 // clave: "clusters" | "patrones"
  const doc = ctx.analisis && ctx.analisis[clave];
  const fecha = ctx.meta.fechasAnalisis && ctx.meta.fechasAnalisis[clave];
  return doc && fecha && fecha >= ctx.meta.periodo.actual.desde ? doc : null;
}

// --- Patrones secuenciales
const ultimaPagina = (p) => p.secuencia[p.secuencia.length - 1];
const sesionesAnalizadas = (p) => Math.round(p.soporte / p.proporcion);   // soporte = cantidad; proporcion = soporte / total
const unir = (secuencia) => secuencia.join(" → ");
const conMayorProporcion = (lista) => lista.reduce((m, p) => (!m || p.proporcion > m.proporcion ? p : m), null);
const paginasDeConversion = (ctx) => new Set((ctx.paginasConversion || []).map(c => c.pagina));

function patronesFrecuentes(ctx, P) {                  // null si no hay análisis vigente
  const doc = analisisVigente(ctx, "patrones");
  if (!doc || !Array.isArray(doc.patrones)) return null;
  return doc.patrones.filter(p => Array.isArray(p.secuencia) && p.secuencia.length > 0 && p.proporcion >= P.SOPORTE_SECUENCIAL);
}

// --- Clusters
const valorDe = (perfil, nombre) => {
  const v = perfil.promedios["metricas." + nombre];    // las claves vienen con el prefijo "metricas."
  return Number.isFinite(v) ? v : null;
};

function leerClusters(ctx) {
  const doc = analisisVigente(ctx, "clusters");
  if (!doc || !doc.perfiles || !Number.isFinite(doc.silhouette)) return null;
  const perfiles = Object.entries(doc.perfiles)
    .map(([id, p]) => ({ id, usuarios: p.cantidadUsuarios || 0, promedios: p.promedios || {} }));
  const total = perfiles.reduce((acum, p) => acum + p.usuarios, 0);
  if (total === 0) return null;
  // promedio general = promedio de los clusters ponderado por su tamaño
  const general = (nombre) => {
    let suma = 0, peso = 0;
    for (const p of perfiles) {
      const v = valorDe(p, nombre);
      if (v === null) continue;
      suma += v * p.usuarios;
      peso += p.usuarios;
    }
    return peso > 0 ? suma / peso : null;
  };
  return { total, perfiles, silhouette: doc.silhouette, general };
}

// cumple(perfil, clusters) devuelve la severidad, o null si el cluster no cumple la condición
function evaluarClusters(ctx, P, cumple) {
  const c = leerClusters(ctx);
  if (!c) return null;
  let mejor = null;
  for (const p of c.perfiles) {
    if (p.usuarios < P.MIN_USUARIOS_CLUSTER) continue;
    const severidad = cumple(p, c);
    if (severidad === null) continue;
    const alcance = p.usuarios / c.total;              // A4
    if (!mejor || severidad * alcance > mejor.severidad * mejor.alcance) {
      mejor = { severidad, alcance, datos: c.total, confianza: limitar(c.silhouette),   // C2
                evidencia: { cluster: p.id, proporcion: alcance } };
    }
  }
  return mejor;
}

// --- Apriori
const SUBTIPOS_COMPRA = ["compra"];                         // igual que en leercontextos.js
const legible = (s) => String(s).replace(/_/g, " ");        // solo para subtipos de eventos
const unirY = (items) => items.join(" y ");

const peso = (r) => r.severidad * r.alcance * (r.confianza === undefined ? 1 : r.confianza);
const mejorResultado = (lista) => lista.reduce((m, r) => (!m || peso(r) > peso(m) ? r : m), null);

function reglasAsociacion(ctx, P, clave) {                  // clave: "apriori_rutas" | "apriori_eventosClave"
  const doc = analisisVigente(ctx, "apriori");
  if (!doc || !doc[clave] || !Array.isArray(doc[clave].reglas)) return null;
  if (!ctx.sitio || ctx.sitio.actual.totalSesiones < P.MIN_SESIONES) return null;
  return doc[clave].reglas.filter(r => r.confianza >= P.UMBRAL_CONFIANZA && r.lift >= P.UMBRAL_LIFT);
}

const resultadoRegla = (r, P, ctx, evidencia) => ({
  severidad: severidadS1(r.lift, P.UMBRAL_LIFT),           // S1 sobre el lift
  alcance: r.soporte,                                      // A5
  confianza: r.confianza,                                  // C4
  datos: ctx.sitio.actual.totalSesiones,
  evidencia
});

// --- Random Forest
const FORMAS_NO_LINEALES = ["forma_u", "forma_u_invertida"];
const esU = (v) => FORMAS_NO_LINEALES.includes(v.forma);

function modeloRF(ctx, P, nombre, permitirFormaU = false) {
  const doc = analisisVigente(ctx, "randomForest");
  const m = doc && doc.modelos && doc.modelos[nombre];
  if (!m || !m.shap_resumen || !m.reporte_clasificacion) return null;
  const positiva = m.reporte_clasificacion["True"];
  const f1 = positiva && positiva["f1-score"];
  if (!Number.isFinite(f1) || f1 < P.UMBRAL_CALIDAD_MODELO) return null;
  const variables = Object.entries(m.shap_resumen)
    .map(([variable, v]) => ({ variable, importancia: v.importanciaPromedio, direccion: v.direccion, forma: v.forma }))
    .filter(v => Number.isFinite(v.importancia) && Number.isFinite(v.direccion));
  const suma = variables.reduce((acum, v) => acum + v.importancia, 0);
  if (!(suma > 0)) return null;
  const direccionClara = (v) => Math.abs(v.direccion) >= P.UMBRAL_DIRECCION;
  const relevantes = variables
    .filter(v => v.importancia >= P.UMBRAL_IMPORTANCIA_SHAP)
    .filter(v => permitirFormaU ? (esU(v) || direccionClara(v)) : (!esU(v) && direccionClara(v)))
    .sort((a, b) => b.importancia - a.importancia)
    .slice(0, P.TOP_VARIABLES);
  return { f1, suma, relevantes };
}

// Evalúa una fila de la tabla del modelo; "coincide" recibe el nombre de la variable
function evaluarVariableRF(ctx, P, modelo, coincide, permitirFormaU = false) {
  const m = modeloRF(ctx, P, modelo, permitirFormaU);
  if (!m) return null;
  const v = m.relevantes.find(r => coincide(r.variable));
  if (!v) return null;
  return {
    severidad: v.importancia / m.suma,                             // S5
    alcance: 1,                                                    // A1
    confianza: m.f1,                                               // C5
    evidencia: { variable: v.variable, sentido: v.direccion > 0 ? "favorece" : "perjudica",
                 nivelOptimo: esU(v), importancia: v.importancia, direccion: v.direccion }
  };
}

// Solo recomienda en el sentido indicado ("Sin acción" o "Caso atípico" en la planilla)
const soloSi = (resultado, sentido) => (resultado && resultado.evidencia.sentido === sentido ? resultado : null);
const origenDe = (variable) => variable.replace(/^referrer(Original)?_/, "");

const reglaRecurrenciaContinua = (id, variable, sujeto, masDe) => ({
  id, etapa: "Fidelización", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
  evaluar: (ctx, P) => evaluarVariableRF(ctx, P, "recurrencia_usuario", v => v === variable, true),
  texto: (ev) => ev.nivelOptimo
    ? `${sujeto} en la primera visita influye en que los visitantes vuelvan, y existe un nivel óptimo.`
    : `Las primeras visitas con ${masDe} se asocian con ${ev.sentido === "favorece" ? "más" : "menos"} regresos.`,
  accion: (ev) => ev.nivelOptimo
    ? `Buscar ese punto óptimo en lugar de maximizar o minimizar ${sujeto.toLowerCase()}.`
    : "Lograr compromiso en la primera visita e invitar a volver."
});


const REGLAS = [
  {
    id: "ATR-01", etapa: "Atracción", tipo: "Variación", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarCaida(ctx, P, "usuariosNuevos", P.VAR_USUARIOS_NUEVOS),
    texto: (ev) => `Están llegando menos visitantes nuevos que en el período anterior (${pct(Math.abs(ev.variacion))}% menos).`,
    accion: "Reforzar los canales de difusión (redes, publicidad, buscadores) y revisar qué cambió."
  },
  {
    id: "ATR-02", etapa: "Atracción", tipo: "Variación", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarCaida(ctx, P, "totalSesiones", P.VAR_SESIONES),
    texto: (ev) => `El tráfico del sitio cayó ${pct(Math.abs(ev.variacion))}% respecto del período anterior.`,
    accion: "Revisar campañas y publicaciones recientes y recuperar los canales que dejaron de traer visitas."
  },
  {
    // Calidad de datos: no entra al ranking
    id: "ATR-03", etapa: "Atracción", tipo: "Calidad de datos", esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      if (!ctx.sitio) return null;
      const n = ctx.sitio.actual.totalSesiones;
      return n < P.MIN_SESIONES ? { evidencia: { valor: n } } : null;
    },
    texto: (ev) => `Hubo muy pocas visitas (${ev.valor}) para sacar conclusiones fiables.`,
    accion: "Aumentar la difusión del sitio; mientras tanto, el resto de las recomendaciones se muestran con cautela."
  },
  {
    id: "ATR-04", etapa: "Atracción", tipo: "Umbral", impacto: 2, esfuerzo: "Bajo",
    evaluar: (ctx, P) => {
      const d = ctx.distribuciones && ctx.distribuciones.paginaInicio;
      if (!d || !d.top) return null;
      return evaluarConcentracion(d.top.cantidad, d.total, P.MIN_SESIONES, P.UMBRAL_CONCENTRACION_ENTRADA, { pagina: d.top.valor });
    },
    texto: (ev) => `La mayoría de las visitas (${pct(ev.proporcion)}%) entra por una sola página: ${ev.pagina}.`,
    accion: "Cuidar esa página como puerta de entrada: mensaje claro y accesos visibles a productos y contacto."
  },
  {
    id: "ATR-05", etapa: "Atracción", tipo: "Umbral", impacto: 1, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const d = ctx.distribuciones && ctx.distribuciones.pais;
      if (!d || !d.top) return null;
      return evaluarConcentracion(d.top.cantidad, d.total, P.MIN_SESIONES, P.UMBRAL_CONCENTRACION_PAIS, { pais: d.top.valor });
    },
    texto: (ev) => `Casi todas las visitas (${pct(ev.proporcion)}%) provienen de ${ev.pais}.`,
    accion: "Adaptar campañas, idioma y envíos a ese público, o evaluar si conviene abrir otros mercados."
  },
  {
    id: "ATR-06", etapa: "Atracción", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const d = ctx.distribuciones && ctx.distribuciones.dispositivo;
      if (!d) return null;
      return evaluarConcentracion(d.movil, d.total, P.MIN_SESIONES, P.UMBRAL_MOVIL, {});
    },
    texto: (ev) => `La mayoría de las visitas (${pct(ev.proporcion)}%) llega desde un celular.`,
    accion: "Priorizar la experiencia en celular: botones grandes, carga rápida y formularios cortos."
  },
  {
    id: "ATR-07", etapa: "Atracción", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const d = ctx.distribuciones && ctx.distribuciones.dispositivo;
      if (!d) return null;
      return evaluarConcentracion(d.desktop, d.total, P.MIN_SESIONES, P.UMBRAL_DESKTOP, {});
    },
    texto: (ev) => `La mayoría de las visitas (${pct(ev.proporcion)}%) llega desde un ordenador.`,
    accion: "Priorizar la experiencia en escritorio: diseño amplio, navegación completa y contenido detallado."
  },
  {
    // Único caso que mide usuarios y no sesiones: el mínimo es MIN_USUARIOS y la confianza usa usuarios
    id: "ATR-08", etapa: "Atracción", tipo: "Umbral", impacto: 2, esfuerzo: "Alto",
    evaluar: (ctx, P) => {
      const d = ctx.usuarios && ctx.usuarios.origenes;
      if (!d || !d.top) return null;
      return evaluarConcentracion(d.top.cantidad, d.total, P.MIN_USUARIOS, P.UMBRAL_CONCENTRACION_ORIGEN, { origen: d.top.valor });
    },
    texto: (ev) => `Gran parte de tus visitantes (${pct(ev.proporcion)}%) viene de un solo origen: ${ev.origen}.`,
    accion: "Diversificar los canales para no depender de uno solo."
  },


  {
    id: "PS-01", etapa: "Acción", tipo: "Fortaleza", impacto: 2, esfuerzo: "Bajo",
    evaluar: (ctx, P) => {
      const patrones = patronesFrecuentes(ctx, P);
      if (!patrones || !ctx.paginasConversion) return null;
      const conv = paginasDeConversion(ctx);
      const mejor = conMayorProporcion(patrones.filter(p => conv.has(ultimaPagina(p))));
      if (!mejor) return null;
      const datos = sesionesAnalizadas(mejor);
      if (datos < P.MIN_SESIONES) return null;
      return {
        severidad: severidadS4(mejor.proporcion, P.SOPORTE_SECUENCIAL),
        alcance: mejor.proporcion,                                   // A5
        datos,
        evidencia: { secuencia: mejor.secuencia, proporcion: mejor.proporcion }
      };
    },
    texto: (ev) => `Un recorrido frecuente termina en compra: ${unir(ev.secuencia)}.`,
    accion: "Reforzar ese camino: que cada página de la secuencia lleve claramente a la siguiente."
  },
  {
    id: "PS-02", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const patrones = patronesFrecuentes(ctx, P);
      const salida = ctx.distribuciones && ctx.distribuciones.paginaAbandono;
      if (!patrones || !salida || !salida.top) return null;
      // si la salida habitual es una página de conversión, irse de ahí no es una pérdida
      if (paginasDeConversion(ctx).has(salida.top.valor)) return null;
      const mejor = conMayorProporcion(patrones.filter(p => ultimaPagina(p) === salida.top.valor));
      if (!mejor) return null;
      const datos = sesionesAnalizadas(mejor);
      if (datos < P.MIN_SESIONES) return null;
      return {
        severidad: severidadS4(mejor.proporcion, P.SOPORTE_SECUENCIAL),
        alcance: mejor.proporcion,                                   // A5
        datos,
        evidencia: { pagina: salida.top.valor, secuencia: mejor.secuencia, proporcion: mejor.proporcion }
      };
    },
    texto: (ev) => `Un recorrido muy común termina en ${ev.pagina}, la página donde más visitas se van: ${unir(ev.secuencia)}.`,
    accion: "Revisar ese recorrido para encontrar en qué paso se pierde el interés y ofrecer una salida alternativa."
  },
  {
    id: "PS-03", etapa: "Acción", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const patrones = patronesFrecuentes(ctx, P);
      if (!patrones || !ctx.paginasConversion) return null;
      const conv = paginasDeConversion(ctx);
      let mejor = null;
      for (const p of patrones) {
        const idx = p.secuencia.findIndex(pg => conv.has(pg));
        if (idx < 0 || idx + 1 <= P.UMBRAL_PASOS) continue;          // pasos hasta la primera conversión
        if (!mejor || p.proporcion > mejor.p.proporcion) mejor = { p, pasos: idx + 1, pagina: p.secuencia[idx] };
      }
      if (!mejor) return null;
      const datos = sesionesAnalizadas(mejor.p);
      if (datos < P.MIN_SESIONES) return null;
      return {
        severidad: severidadS1(mejor.pasos, P.UMBRAL_PASOS),
        alcance: mejor.p.proporcion,                                 // A5
        datos,
        evidencia: { pagina: mejor.pagina, pasos: mejor.pasos, secuencia: mejor.p.secuencia }
      };
    },
    texto: (ev) => `Para llegar a ${ev.pagina} los visitantes necesitan al menos ${ev.pasos} pasos.`,
    accion: "Acortar el camino con accesos directos desde las páginas anteriores."
  },
  {
    id: "PS-04", etapa: "Interés", tipo: "Umbral", impacto: 2, esfuerzo: "Bajo",
    evaluar: (ctx, P) => {
      const patrones = patronesFrecuentes(ctx, P);
      if (!patrones || patrones.length === 0 || !ctx.paginas || !(ctx.paginas.totalPageviews > 0)) return null;
      const datos = sesionesAnalizadas(patrones[0]);
      if (datos < P.MIN_SESIONES) return null;
      const cuenta = new Map();                                      // página -> patrones donde es paso intermedio
      for (const p of patrones) {
        for (const pg of new Set(p.secuencia.slice(1, -1))) cuenta.set(pg, (cuenta.get(pg) || 0) + 1);
      }
      let mejor = null;
      for (const [pagina, n] of cuenta) {
        if (n < P.UMBRAL_PATRONES) continue;
        const item = ctx.paginas.items.find(i => i.pagina === pagina);
        if (!item) continue;
        const alcance = Math.min(1, item.pageviews / ctx.paginas.totalPageviews);   // A2
        const severidad = severidadS1(n, P.UMBRAL_PATRONES);
        if (!mejor || severidad * alcance > mejor.severidad * mejor.alcance) mejor = { pagina, n, severidad, alcance };
      }
      if (!mejor) return null;
      return { severidad: mejor.severidad, alcance: mejor.alcance, datos, evidencia: { pagina: mejor.pagina, patrones: mejor.n } };
    },
    texto: (ev) => `La página ${ev.pagina} es un paso obligado en varios recorridos frecuentes.`,
    accion: "Asegurarse de que cargue rápido y funcione bien: de ella depende gran parte de la navegación."
  },
  {
    id: "PS-05", etapa: "Transversal", tipo: "Calidad de datos", esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const patrones = patronesFrecuentes(ctx, P);                   // null si no hay análisis vigente
      if (!patrones || !ctx.sitio) return null;
      if (ctx.sitio.actual.totalSesiones < P.MIN_SESIONES) return null;   // pocos datos: lo cubre ATR-03
      return patrones.length === 0 ? { evidencia: { sesiones: ctx.sitio.actual.totalSesiones } } : null;
    },
    texto: () => "No se detectan recorridos repetidos: cada visitante navega de forma distinta.",
    accion: "Ordenar el sitio con un camino principal claro (menú, destacados, llamados a la acción)."
  },

  {
    id: "KM-01", etapa: "Fidelización", tipo: "Fortaleza", impacto: 2, esfuerzo: "Bajo",
    evaluar: (ctx, P) => evaluarClusters(ctx, P, (p, c) => {
      const conversion = valorDe(p, "tasaConversion");
      const inter = valorDe(p, "interaccionesPromedio");
      const interGeneral = c.general("interaccionesPromedio");
      if (conversion === null || inter === null || interGeneral === null) return null;
      if (conversion < P.UMBRAL_CONVERSION_ALTA || inter < P.REL_ALTO * interGeneral) return null;
      return severidadS1(conversion, P.UMBRAL_CONVERSION_ALTA);
    }),
    texto: (ev) => `Hay un grupo de usuarios (${pct(ev.proporcion)}% del total) muy comprometido que compra con frecuencia.`,
    accion: "Mantener y potenciar lo que les gusta: destacar esos productos y comunicarles novedades."
  },
  {
    id: "KM-02", etapa: "Atracción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarClusters(ctx, P, (p, c) => {
      const rebote = valorDe(p, "tasaRebote");
      if (rebote === null || rebote <= P.UMBRAL_REBOTE || p.usuarios / c.total < P.UMBRAL_TAMANO_CLUSTER) return null;
      return severidadS1(rebote, P.UMBRAL_REBOTE);
    }),
    texto: (ev) => `Un grupo grande de visitantes (${pct(ev.proporcion)}%) se va casi enseguida.`,
    accion: "Revisar el origen del tráfico y la primera impresión del sitio para ese público."
  },
  {
    id: "KM-03", etapa: "Consideración", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarClusters(ctx, P, (p, c) => {
      const conversion = valorDe(p, "tasaConversion");
      const duracion = valorDe(p, "duracionPromedio");
      const paginas = valorDe(p, "paginasPorSesionPromedio");
      const duracionGeneral = c.general("duracionPromedio");
      const paginasGeneral = c.general("paginasPorSesionPromedio");
      if ([conversion, duracion, paginas, duracionGeneral, paginasGeneral].includes(null)) return null;
      if (duracion < P.REL_ALTO * duracionGeneral || paginas < P.REL_ALTO * paginasGeneral) return null;
      if (conversion >= P.UMBRAL_CONVERSION) return null;
      return severidadS2(conversion, P.UMBRAL_CONVERSION);
    }),
    texto: (ev) => `Hay un grupo que explora mucho pero no compra (${pct(ev.proporcion)}%).`,
    accion: "Ofrecer un incentivo o resolver dudas (descuento de primera compra, chat, garantías)."
  },
  {
    id: "KM-04", etapa: "Consideración", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarClusters(ctx, P, (p) => {
      const tiempo = valorDe(p, "tiempoHastaConversion");
      const conversion = valorDe(p, "tasaConversion");
      if (tiempo === null || conversion === null) return null;
      const segundos = tiempo / P.DIVISOR_TIEMPO_CONVERSION_USUARIO;
      if (segundos <= P.UMBRAL_TIEMPO_CONVERSION || conversion < P.UMBRAL_CONVERSION_ALTA) return null;
      return severidadS1(segundos, P.UMBRAL_TIEMPO_CONVERSION);
    }),
    texto: () => "Hay un grupo que compra, pero tarda en decidirse.",
    accion: "Facilitar la decisión con comparativas, reseñas o promociones por tiempo limitado."
  },
  {
    id: "KM-05", etapa: "Transversal", tipo: "Calidad de datos", esfuerzo: "Bajo",
    evaluar: (ctx, P) => {
      if (!ctx.usuarios || ctx.usuarios.activos < P.MIN_USUARIOS) return null;   // pocos usuarios: no es falta de estructura
      const doc = analisisVigente(ctx, "clusters");
      if (doc && doc.silhouette > P.UMBRAL_SILHOUETTE) return null;
      return { evidencia: { silhouette: doc ? doc.silhouette : null } };
    },
    texto: () => "Todavía no se distinguen tipos de visitantes claros en tu sitio.",
    accion: "Seguir acumulando datos: los perfiles aparecen con más visitantes."
  },

  {
    id: "AP-01", etapa: "Consideración", tipo: "Umbral", impacto: 2, esfuerzo: "Bajo",
    evaluar: (ctx, P) => {
      const reglas = reglasAsociacion(ctx, P, "apriori_rutas");
      if (!reglas) return null;
      const conv = paginasDeConversion(ctx);
      return mejorResultado(reglas
        .filter(r => !r.consecuente.some(pg => conv.has(pg)))      // si llega a una conversión, lo cubre AP-03
        .map(r => resultadoRegla(r, P, ctx, { antecedente: r.antecedente, consecuente: r.consecuente, confianza: r.confianza })));
    },
    texto: (ev) => `Quienes visitan ${unirY(ev.antecedente)} suelen visitar también ${unirY(ev.consecuente)} (confianza ${pct(ev.confianza)}%).`,
    accion: "Enlazar ambas páginas entre sí y ofrecer productos relacionados."
  },
  {
    id: "AP-02", etapa: "Acción", tipo: "Fortaleza", impacto: 3, esfuerzo: "Bajo",
    evaluar: (ctx, P) => {
      const reglas = reglasAsociacion(ctx, P, "apriori_eventosClave");
      if (!reglas) return null;
      return mejorResultado(reglas
        .filter(r => r.consecuente.length === 1 && SUBTIPOS_COMPRA.includes(r.consecuente[0])
                     && !r.antecedente.some(a => SUBTIPOS_COMPRA.includes(a)))
        .map(r => resultadoRegla(r, P, ctx, { accion: r.antecedente, confianza: r.confianza })));
    },
    texto: (ev) => `Quienes realizan ${ev.accion.map(legible).join(" y ")} suelen terminar comprando (${pct(ev.confianza)}%).`,
    accion: "Impulsar esa acción: hacerla más visible y fácil de realizar."
  },
  {
    id: "AP-03", etapa: "Consideración", tipo: "Umbral", impacto: 2, esfuerzo: "Bajo",
    evaluar: (ctx, P) => {
      const reglas = reglasAsociacion(ctx, P, "apriori_rutas");
      if (!reglas || !ctx.paginasConversion) return null;
      const conv = paginasDeConversion(ctx);
      const esEmbudo = (pg) => P.FRAGMENTOS_PAGINAS_EMBUDO.some(f => pg.includes(f));
      return mejorResultado(reglas
        .filter(r => r.consecuente.some(pg => conv.has(pg)))
        .filter(r => r.antecedente.every(pg => !conv.has(pg) && !esEmbudo(pg)))    // informativa
        .map(r => resultadoRegla(r, P, ctx, { informativa: r.antecedente,
                                              conversion: r.consecuente.filter(pg => conv.has(pg)),
                                              confianza: r.confianza })));
    },
    texto: (ev) => `Ver ${unirY(ev.informativa)} aumenta la probabilidad de llegar a ${unirY(ev.conversion)}.`,
    accion: "Destacar esa página informativa en el recorrido (por ejemplo, en el menú o en la página de inicio)."
  },
  {
    id: "AP-04", etapa: "Transversal", tipo: "Calidad de datos", esfuerzo: "Bajo",
    evaluar: (ctx, P) => {
      const doc = analisisVigente(ctx, "apriori");
      if (!doc || !ctx.sitio || ctx.sitio.actual.totalSesiones < P.MIN_SESIONES) return null;
      const reglas = [...((doc.apriori_rutas || {}).reglas || []), ...((doc.apriori_eventosClave || {}).reglas || [])];
      return reglas.some(r => r.lift >= P.UMBRAL_LIFT) ? null : { evidencia: { reglas: reglas.length } };
    },
    texto: () => "No se detectan relaciones claras entre páginas o acciones.",
    accion: "Por ahora no hay asociaciones para aprovechar; se reevaluará con más datos."
  },

    {
    id: "RF-01.1", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarVariableRF(ctx, P, "conversion_sesion", v => v === "is_mobile"),
    texto: (ev) => ev.sentido === "favorece"
      ? "Las visitas desde celular se asocian con más conversiones."
      : "Las visitas desde celular se asocian con menos conversiones.",
    accion: (ev) => ev.sentido === "favorece"
      ? "Mantener la experiencia móvil y priorizar campañas para celular."
      : "Revisar la experiencia en celular: carga, botones, formularios cortos."
  },
  {
    id: "RF-01.2", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarVariableRF(ctx, P, "conversion_sesion", v => v === "is_mobile"),
    texto: (ev) => ev.sentido === "favorece"
      ? "Las visitas desde computadora se asocian con menos conversiones."
      : "Las visitas desde computadora se asocian con más conversiones.",
    accion: (ev) => ev.sentido === "favorece"
      ? "Revisar la experiencia en computadoras: carga, botones, tamaño de páginas."
      : "Mantener la experiencia desktop y priorizar campañas para computadoras."
  },
  {
    id: "RF-01.3", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarVariableRF(ctx, P, "conversion_sesion", v => v.startsWith("referrer_")),
    texto: (ev) => `Los visitantes que llegan desde ${ev.variable.replace(/^referrer_/, "")} se asocian con ${ev.sentido === "favorece" ? "más" : "menos"} conversiones.`,
    accion: (ev) => ev.sentido === "favorece"
      ? "Reforzar ese canal: trae visitantes que compran."
      : "Revisar que el mensaje del canal coincida con la página de destino."
  },
  {
    id: "RF-01.4", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const r = evaluarVariableRF(ctx, P, "conversion_sesion", v => v === "rage_click");
      return r && r.evidencia.sentido === "perjudica" ? r : null;      // "favorece" es un caso atípico: no se recomienda
    },
    texto: () => "Las visitas con clics repetidos y rápidos se asocian con menos conversiones.",
    accion: "Corregir elementos que generan clics repetidos debido a incomodidad o irritan."
  },
  {
    id: "RF-01.5", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarVariableRF(ctx, P, "conversion_sesion", v => v === "cantidad_paginas"),
    texto: (ev) => ev.sentido === "favorece"
      ? "Las visitas con más páginas vistas se asocian con más conversiones."
      : "Las visitas con más páginas vistas se asocian con menos conversiones: el visitante se pierde en el camino.",
    accion: (ev) => ev.sentido === "favorece"
      ? "Facilitar el descubrimiento: productos relacionados y enlaces internos."
      : "Acortar el camino: menú claro y accesos directos."
  },
  {
    id: "RF-01.6", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarVariableRF(ctx, P, "conversion_sesion", v => v === "duracionSesion"),
    texto: (ev) => ev.sentido === "favorece"
      ? "Las visitas más largas se asocian con más conversiones."
      : "Las visitas más largas se asocian con menos conversiones: puede haber dudas sin resolver.",
    accion: (ev) => ev.sentido === "favorece"
      ? "Sostener el interés con contenido útil."
      : "Ayudar a decidir: chat, preguntas frecuentes, garantías."
  },


    {
    id: "RF-02.1", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarVariableRF(ctx, P, "abandono_carrito", v => v === "is_mobile"),
    texto: (ev) => ev.sentido === "favorece"
      ? "El abandono del carrito es mayor en las visitas desde celular."
      : "El abandono del carrito es mayor en las visitas desde computadora.",
    accion: (ev) => ev.sentido === "favorece"
      ? "Optimizar el pago en celular: autocompletado, billeteras digitales, campos mínimos."
      : "Revisar el pago en computadora, donde se abandona más."
  },
  {
    id: "RF-02.3", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarVariableRF(ctx, P, "abandono_carrito", v => v.startsWith("referrer_")),
    texto: (ev) => `Los visitantes que llegan desde ${origenDe(ev.variable)} abandonan ${ev.sentido === "favorece" ? "más" : "menos"} el carrito.`,
    accion: (ev) => ev.sentido === "favorece"
      ? "Mostrar costo total y envío desde el inicio para ese canal."
      : "Reforzar ese canal."
  },
  {
    id: "RF-02.4", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => soloSi(evaluarVariableRF(ctx, P, "abandono_carrito", v => v === "rage_click"), "favorece"),
    texto: () => "Las visitas con clics repetidos y rápidos se asocian con más abandono del carrito.",
    accion: "Buscar fallas en carrito y pago: botones que no responden, validación, lentitud."
  },
  {
    id: "RF-02.5", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => soloSi(evaluarVariableRF(ctx, P, "abandono_carrito", v => v === "cantidad_paginas"), "favorece"),
    texto: () => "Las visitas con más páginas vistas se asocian con más abandono del carrito.",
    accion: "Acortar el recorrido hasta el pago."
  },
  {
    id: "RF-02.6", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => soloSi(evaluarVariableRF(ctx, P, "abandono_carrito", v => v === "duracionSesion"), "favorece"),
    texto: () => "Las visitas más largas se asocian con más abandono del carrito: señal de indecisión.",
    accion: "Reducir la indecisión: costos totales, garantías, opiniones, recordatorio de carrito."
  },


    {
    id: "RF-03.1", etapa: "Acción", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => soloSi(evaluarVariableRF(ctx, P, "abandono_formulario", v => v === "is_mobile"), "favorece"),
    texto: () => "El abandono de formularios es mayor en las visitas desde celular.",
    accion: "Formularios cortos, teclado según el tipo de campo, autocompletado."
  },
  {
    id: "RF-03.2", etapa: "Acción", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => soloSi(evaluarVariableRF(ctx, P, "abandono_formulario", v => v.startsWith("referrer_")), "favorece"),
    texto: (ev) => `Los visitantes que llegan desde ${origenDe(ev.variable)} abandonan más los formularios.`,
    accion: "Pedir menos datos al inicio a ese público."
  },
  {
    id: "RF-03.3", etapa: "Acción", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => soloSi(evaluarVariableRF(ctx, P, "abandono_formulario", v => v === "rage_click"), "favorece"),
    texto: () => "Las visitas con clics repetidos y rápidos se asocian con más abandono de formularios.",
    accion: "Revisar validaciones y mensajes de error."
  },
  {
    id: "RF-03.4", etapa: "Acción", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => soloSi(evaluarVariableRF(ctx, P, "abandono_formulario", v => v === "cantidad_paginas"), "favorece"),
    texto: () => "Las visitas con más páginas vistas abandonan más los formularios.",
    accion: "Acercar el formulario al inicio del recorrido."
  },
  {
    id: "RF-03.5", etapa: "Acción", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => soloSi(evaluarVariableRF(ctx, P, "abandono_formulario", v => v === "duracionSesion"), "favorece"),
    texto: () => "Las visitas más largas abandonan más los formularios: puede resultar largo o confuso.",
    accion: "Dividirlo en pasos o reducir campos."
  },

  {
    id: "RF-04.1", etapa: "Fidelización", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarVariableRF(ctx, P, "recurrencia_usuario", v => v === "is_mobile"),
    texto: (ev) => ev.sentido === "favorece"
      ? "Quienes llegan desde celular tienden a volver."
      : "Quienes llegan desde celular tienden a no volver.",
    accion: (ev) => ev.sentido === "favorece"
      ? "Mantener la experiencia móvil."
      : "Facilitar el regreso: recordatorios, acceso directo a la pantalla de inicio."
  },
  {
    id: "RF-04.2", etapa: "Fidelización", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarVariableRF(ctx, P, "recurrencia_usuario", v => v === "is_mobile"),
    texto: (ev) => ev.sentido === "favorece"
      ? "Quienes llegan desde computadora tienden a no volver."
      : "Quienes llegan desde computadora tienden a volver.",
    accion: (ev) => ev.sentido === "favorece"
      ? "Facilitar el regreso: accesos directos al inicio, correos, suscripciones."
      : "Mantener la experiencia desktop."
  },
  {
    id: "RF-04.3", etapa: "Fidelización", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarVariableRF(ctx, P, "recurrencia_usuario", v => v.startsWith("referrerOriginal_")),
    texto: (ev) => `Los visitantes que llegan desde ${origenDe(ev.variable)} tienden a ${ev.sentido === "favorece" ? "volver" : "no volver"}.`,
    accion: (ev) => ev.sentido === "favorece"
      ? "Priorizar la captación por ese canal."
      : "Sumar retención desde la primera visita (suscripciones, mensajes)."
  },
  reglaRecurrenciaContinua("RF-04.4", "cantidad_paginas", "La cantidad de páginas vistas", "más páginas"),
  reglaRecurrenciaContinua("RF-04.5", "duracionSesion", "La duración", "más duración"),

];

module.exports = { VERSION: "0.2-atraccion", REGLAS };