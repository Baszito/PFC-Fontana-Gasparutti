/*------------------------ ---------------------------
-------------------------- Catalogo de reglas --------
-------------------------- -------------------------*/
// Las 34 reglas de las 5 etapas del funnel (ATR, INT, CON, ACC, FID), copiadas de
// Recomendaciones_1_.xlsx. Las reglas de análisis (PS, KM, AP, RF) quedan afuera por ahora.
// Cada regla es un objeto:
//   id, etapa, tipo       tipo: "Variación" | "Umbral" | "Calidad de datos" | "Fortaleza"
//   impacto (1-3), esfuerzo     impacto: 3 = influye en la conversión, 2 = paso intermedio / general, 1 = contexto general
//   evaluar(ctx, P)       null si no se dispara.
//                         Si se dispara: { severidad, alcance, evidencia }
//                         (Calidad de datos y Fortaleza: solo { evidencia }, no se ponderan).
//                         Las reglas por página / elemento / formulario pueden devolver un ARREGLO,
//                         una entrada por cada página (o formulario) en que se disparan.
//   texto(evidencia), accion
// ctx es el contexto de UN sitio (lo que devuelve leerContextos).
// Una sección del contexto en null (falló la lectura) hace que las reglas que la usan no se disparen.

const limitar = (x) => Math.min(1, Math.max(0, x));
const pct = (x) => Math.round(x * 100);
const esNumero = (x) => typeof x === "number" && Number.isFinite(x);

// S1: el valor supera un umbral superior.
// `maximo` es el mayor valor posible de la métrica (1 para proporciones): ahí la severidad llega a 1.
// Si no se indica, se toma el doble del umbral (métricas sin tope, como segundos).
const severidadS1 = (valor, umbral, maximo = 2 * umbral) => limitar((valor - umbral) / (maximo - umbral));
// S2: el valor está por debajo de un umbral inferior
const severidadS2 = (valor, umbral) => limitar((umbral - valor) / umbral);
// S3: la variación supera (en valor absoluto) la variación umbral
const severidadS3 = (variacion, umbral) => limitar((Math.abs(variacion) - Math.abs(umbral)) / Math.abs(umbral));


/*------------------------ ---------------------------
-------------------------- Evaluadores comunes -------
-------------------------- -------------------------*/

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
    evidencia: { variacion, actual: actual[campo], anterior: anterior[campo] }
  };
}

// Suba de una métrica del sitio respecto del período anterior (umbral positivo).
// Acá hace falta que los dos períodos tengan datos: se compara una tasa medida en ambos.
function evaluarSuba(ctx, P, campo, umbral) {
  if (!ctx.sitio || !ctx.sitio.anterior) return null;
  const { actual, anterior } = ctx.sitio;
  if (actual.totalSesiones < P.MIN_SESIONES || anterior.totalSesiones < P.MIN_SESIONES) return null;
  if (!esNumero(actual[campo]) || !(anterior[campo] > 0)) return null;
  const variacion = (actual[campo] - anterior[campo]) / anterior[campo];
  if (variacion <= umbral) return null;
  return {
    severidad: severidadS3(variacion, umbral),
    alcance: 1,
    evidencia: { variacion, actual: actual[campo], anterior: anterior[campo] }
  };
}

// Métrica del sitio contra un umbral fijo, sobre el período actual.
// modo: "superior" (dispara si valor > umbral, S1) o "inferior" (dispara si valor < umbral, S2)
function evaluarUmbralSitio(ctx, P, campo, umbral, modo, maximo) {
  if (!ctx.sitio) return null;
  const a = ctx.sitio.actual;
  const valor = a[campo];
  if (!esNumero(valor) || a.totalSesiones < P.MIN_SESIONES) return null;
  const dispara = modo === "superior" ? valor > umbral : valor < umbral;
  if (!dispara) return null;
  return {
    severidad: modo === "superior" ? severidadS1(valor, umbral, maximo) : severidadS2(valor, umbral),
    alcance: 1,                                         // A1: métrica global del sitio
    evidencia: { valor }
  };
}

// Proporción concentrada en un valor (página de ingreso, país, dispositivo, origen, página de salida)
function evaluarConcentracion(cantidad, total, minimo, umbral, extra) {
  if (!total || total < minimo) return null;
  const proporcion = cantidad / total;
  if (proporcion <= umbral) return null;
  return {
    severidad: severidadS1(proporcion, umbral, 1),
    alcance: proporcion,                                // A3: el propio porcentaje medido
    evidencia: { proporcion, ...extra }
  };
}

// --- Reglas por página (A2: visitas de la página / visitas totales del sitio;)
function paginasConVisitas(ctx, P) {
  if (!ctx.paginas || !(ctx.paginas.totalPageviews > 0)) return [];
  return ctx.paginas.items.filter(p => p.pageviews >= P.MIN_VISITAS_PAGINA);
}

function resultadoPagina(ctx, p, severidad, extra) {
  return {
    severidad,
    alcance: Math.min(1, p.pageviews / ctx.paginas.totalPageviews),
    evidencia: { pagina: p.pagina, visitas: p.pageviews, ...extra }
  };
}

// Métrica de la página por debajo de un umbral (S2)
function evaluarPorPagina(ctx, P, campo, umbral) {
  const disparadas = paginasConVisitas(ctx, P)
    .filter(p => esNumero(p[campo]) && p[campo] < umbral)
    .map(p => resultadoPagina(ctx, p, severidadS2(p[campo], umbral), { valor: p[campo] }));
  return disparadas.length ? disparadas : null;
}

// Conteo de eventos de la página (clics muertos, rage clicks) por encima de un umbral, en
// proporción a las visitas de la página (S1)
function evaluarProporcionPagina(ctx, P, campo, umbral) {
  const disparadas = paginasConVisitas(ctx, P)
    .map(p => ({ p, proporcion: p[campo] / p.pageviews }))
    .filter(x => x.proporcion > umbral)
    .map(x => resultadoPagina(ctx, x.p, severidadS1(x.proporcion, umbral), { n: x.p[campo], proporcion: x.proporcion }));
  return disparadas.length ? disparadas : null;
}

// --- Reglas por formulario (A8: formularios iniciados / sesiones del período)
function evaluarFormularios(ctx, P, exigeCampo) {
  if (!ctx.formularios || !ctx.sitio || !(ctx.sitio.actual.totalSesiones > 0)) return null;
  const sesiones = ctx.sitio.actual.totalSesiones;
  const disparadas = ctx.formularios.items
    .filter(f => f.total >= P.MIN_FORMULARIOS && esNumero(f.tasaAbandono) && f.tasaAbandono > P.UMBRAL_ABANDONO_FORM
                 && (!exigeCampo || f.campoAbandonoMasComun))
    .map(f => ({
      severidad: severidadS1(f.tasaAbandono, P.UMBRAL_ABANDONO_FORM),
      alcance: Math.min(1, f.total / sesiones),
      evidencia: { formId: f.formId, tasaAbandono: f.tasaAbandono, campo: f.campoAbandonoMasComun, iniciados: f.total }
    }));
  return disparadas.length ? disparadas : null;
}

// usuariosRecurrentes / totalUsuarios de un período (null si no se puede calcular)
const ratioRecurrentes = (m) =>
  (m && m.totalUsuarios > 0 && esNumero(m.usuariosRecurrentes)) ? m.usuariosRecurrentes / m.totalUsuarios : null;


/*------------------------ ---------------------------
-------------------------- Reglas --------------------
-------------------------- -------------------------*/
const REGLAS = [

  // ===================== ATRACCIÓN =====================
  {
    id: "ATR-01", etapa: "Atracción", tipo: "Variación", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarCaida(ctx, P, "usuariosNuevos", P.VAR_USUARIOS_NUEVOS),
    texto: (ev) => `Están llegando menos visitantes nuevos que en el período anterior (${pct(Math.abs(ev.variacion))}% menos).`,
    accion: "Reforzar los canales de difusión (redes, publicidad, buscadores) y revisar qué cambió."
  },
  {
    id: "ATR-02", etapa: "Atracción", tipo: "Variación", impacto: 2, esfuerzo: "Medio",
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
    id: "ATR-06", etapa: "Atracción", tipo: "Umbral", impacto: 1, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const d = ctx.distribuciones && ctx.distribuciones.dispositivo;
      if (!d) return null;
      return evaluarConcentracion(d.movil, d.total, P.MIN_SESIONES, P.UMBRAL_MOVIL, {});
    },
    texto: (ev) => `La mayoría de las visitas (${pct(ev.proporcion)}%) llega desde un celular.`,
    accion: "Priorizar la experiencia en celular: botones grandes, carga rápida y formularios cortos."
  },
  {
    id: "ATR-07", etapa: "Atracción", tipo: "Umbral", impacto: 1, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const d = ctx.distribuciones && ctx.distribuciones.dispositivo;
      if (!d) return null;
      return evaluarConcentracion(d.desktop, d.total, P.MIN_SESIONES, P.UMBRAL_DESKTOP, {});
    },
    texto: (ev) => `La mayoría de las visitas (${pct(ev.proporcion)}%) llega desde un ordenador.`,
    accion: "Priorizar la experiencia en escritorio: diseño amplio, navegación completa y contenido detallado."
  },
  {
    // Único caso de Atracción que mide usuarios y no sesiones: el mínimo es MIN_USUARIOS y la confianza usa usuarios
    id: "ATR-08", etapa: "Atracción", tipo: "Umbral", impacto: 1, esfuerzo: "Alto",
    evaluar: (ctx, P) => {
      const d = ctx.usuarios && ctx.usuarios.origenes;
      if (!d || !d.top) return null;
      return evaluarConcentracion(d.top.cantidad, d.total, P.MIN_USUARIOS, P.UMBRAL_CONCENTRACION_ORIGEN, { origen: d.top.valor });
    },
    texto: (ev) => `Gran parte de tus visitantes (${pct(ev.proporcion)}%) viene de un solo origen: ${ev.origen}.`,
    accion: "Diversificar los canales para no depender de uno solo."
  },

  // ===================== INTERÉS =====================
  {
    id: "INT-01", etapa: "Interés", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarUmbralSitio(ctx, P, "tasaRebote", P.UMBRAL_REBOTE, "superior", 1),
    texto: (ev) => `El ${pct(ev.valor)}% de las visitas se va sin interactuar con el sitio.`,
    accion: "Revisar la página de entrada: mensaje claro, imagen relevante y un llamado a la acción visible."
  },
  {
    id: "INT-02", etapa: "Interés", tipo: "Variación", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarSuba(ctx, P, "tasaRebote", P.VAR_REBOTE),
    texto: (ev) => `El abandono inmediato aumentó ${pct(ev.variacion)}% respecto del período anterior.`,
    accion: "Revisar cambios recientes en el sitio o en las campañas que traen visitas."
  },
  {
    id: "INT-03", etapa: "Interés", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarUmbralSitio(ctx, P, "duracionSesionPromedio", P.UMBRAL_DURACION, "inferior"),
    texto: (ev) => `Las visitas duran en promedio ${ev.valor.toFixed(1)} minutos, un tiempo muy corto.`,
    accion: "Mejorar el contenido inicial y destacar productos o servicios para retener al visitante."
  },
  {
    id: "INT-04", etapa: "Interés", tipo: "Umbral", impacto: 2, esfuerzo: "Bajo",
    evaluar: (ctx, P) => evaluarUmbralSitio(ctx, P, "paginasPorSesionPromedio", P.UMBRAL_PAGINAS, "inferior"),
    texto: (ev) => `Cada visitante ve en promedio ${ev.valor.toFixed(1)} páginas.`,
    accion: "Mejorar la navegación: enlaces a productos relacionados, menú claro y buscador."
  },
  {
    id: "INT-05", etapa: "Interés", tipo: "Umbral", impacto: 2, esfuerzo: "Bajo",
    evaluar: (ctx, P) => evaluarPorPagina(ctx, P, "scrollDepthPromedio", P.UMBRAL_SCROLL),
    texto: (ev) => `En ${ev.pagina} poca gente llega al final: el desplazamiento promedio es ${pct(ev.valor)}%.`,
    accion: "Subir el contenido más importante (precio, botón de compra) y acortar la página."
  },
  {
    id: "INT-06", etapa: "Interés", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarPorPagina(ctx, P, "tiempoPromedioPagina", P.UMBRAL_TIEMPO_PAGINA),
    texto: (ev) => `La página ${ev.pagina} recibe muchas visitas pero se mira muy poco tiempo (${Math.round(ev.valor)} s).`,
    accion: "Revisar si el contenido es relevante y atractivo para quienes llegan a esa página."
  },

  // ===================== CONSIDERACIÓN (CON) =====================
  {
    // Un resultado por cada elemento con meta (goal) cuyo hover supera el umbral, en páginas con visitas suficientes
    id: "CON-01", etapa: "Consideración", tipo: "Umbral", impacto: 2, esfuerzo: "Bajo",
    evaluar: (ctx, P) => {
      const disparadas = [];
      for (const p of paginasConVisitas(ctx, P)) {
        for (const el of p.elementos || []) {
          if (el.goal === null || el.goal === undefined) continue;
          if (!esNumero(el.hoverPromedio) || el.hoverPromedio <= P.UMBRAL_HOVER) continue;
          disparadas.push(resultadoPagina(ctx, p, severidadS1(el.hoverPromedio, P.UMBRAL_HOVER),
                                          { elemento: el.elemento, valor: el.hoverPromedio }));
        }
      }
      return disparadas.length ? disparadas : null;
    },
    texto: (ev) => `Los visitantes se detienen mucho tiempo sobre ${ev.elemento} (${Math.round(ev.valor)} s) antes de decidir.`,
    accion: "Agregar cerca de ese elemento información que resuelva dudas (precio, envío, garantía, opiniones)."
  },
  {
    id: "CON-02", etapa: "Consideración", tipo: "Umbral", impacto: 2, esfuerzo: "Bajo",
    evaluar: (ctx, P) => evaluarProporcionPagina(ctx, P, "clicksMuertos", P.UMBRAL_CLICKS_MUERTOS),
    texto: (ev) => `En ${ev.pagina} hay ${ev.n} clics sobre elementos que no responden.`,
    accion: "Convertir ese elemento en un enlace o botón, o cambiar su aspecto para que no parezca clicable."
  },
  {
    id: "CON-03", etapa: "Consideración", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarProporcionPagina(ctx, P, "rageClicks", P.UMBRAL_RAGE_CLICKS),
    texto: (ev) => `En ${ev.pagina} los visitantes hacen clics repetidos y rápidos, señal de frustración (${ev.n} casos).`,
    accion: "Revisar si el elemento funciona y responde rápido; puede haber un error o una carga lenta."
  },
  {
    id: "CON-04", etapa: "Consideración", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const u = ctx.usuarios;
      if (!u || u.activos < P.MIN_USUARIOS || !esNumero(u.interaccionesPromedio)) return null;
      if (u.interaccionesPromedio >= P.UMBRAL_INTERACCIONES) return null;
      return {
        severidad: severidadS2(u.interaccionesPromedio, P.UMBRAL_INTERACCIONES),
        alcance: 1,
        evidencia: { valor: u.interaccionesPromedio }
      };
    },
    texto: (ev) => `Los visitantes interactúan poco con el sitio (${ev.valor.toFixed(1)} acciones por visita).`,
    accion: "Invitar a explorar: botones de llamado a la acción, galerías, filtros o contenido interactivo."
  },
  {
    
    id: "CON-05", etapa: "Consideración", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      if (!ctx.sitio) return null;
      const a = ctx.sitio.actual;
      if (!esNumero(a.tiempoConversionPromedio) || !esNumero(a.tasaConversion)) return null;
      const conversiones = Math.round(a.tasaConversion * a.totalSesiones);
      if (conversiones < P.MIN_CONVERSIONES) return null;
      if (a.tiempoConversionPromedio <= P.UMBRAL_TIEMPO_CONVERSION) return null;
      return {
        severidad: severidadS1(a.tiempoConversionPromedio, P.UMBRAL_TIEMPO_CONVERSION),
        alcance: a.tasaConversion,
        evidencia: { valor: a.tiempoConversionPromedio, conversiones }
      };
    },
    texto: (ev) => `Los visitantes que compran tardan en promedio ${Math.round(ev.valor)} segundos en decidirse.`,
    accion: "Simplificar la comparación de opciones y ofrecer ayuda (chat, preguntas frecuentes)."
  },

  // ===================== ACCIÓN (ACC) =====================
  {
    id: "ACC-01", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Alto",
    evaluar: (ctx, P) => evaluarUmbralSitio(ctx, P, "tasaConversion", P.UMBRAL_CONVERSION, "inferior"),
    texto: (ev) => `Solo el ${pct(ev.valor)}% de las visitas termina en una compra o contacto.`,
    accion: "Revisar el recorrido hacia la compra y quitar pasos innecesarios."
  },
  {
    id: "ACC-02", etapa: "Acción", tipo: "Variación", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => evaluarCaida(ctx, P, "tasaConversion", P.VAR_CONVERSION),
    texto: (ev) => `La conversión cayó ${pct(Math.abs(ev.variacion))}% respecto del período anterior.`,
    accion: "Revisar qué cambió: precios, páginas modificadas, campañas nuevas o fallas técnicas."
  },
  {
    // Tráfico alto medido en sesiones (UMBRAL_TRAFICO_ALTO está en sesiones)
    id: "ACC-03", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Alto",
    evaluar: (ctx, P) => {
      if (!ctx.sitio || ctx.sitio.actual.totalSesiones < P.UMBRAL_TRAFICO_ALTO) return null;
      return evaluarUmbralSitio(ctx, P, "tasaConversion", P.UMBRAL_CONVERSION, "inferior");
    },
    texto: () => "Tenés buen tráfico pero pocas conversiones: el desafío no es atraer más visitas, sino convertir.",
    accion: "Enfocar el esfuerzo en el recorrido de compra y no en conseguir más visitas."
  },
  {
    // Fortaleza: no entra al ranking
    id: "ACC-04", etapa: "Acción", tipo: "Fortaleza", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      if (!ctx.sitio) return null;
      const a = ctx.sitio.actual;
      if (a.totalSesiones < P.MIN_SESIONES || a.totalSesiones >= P.UMBRAL_TRAFICO_ALTO) return null;
      if (!esNumero(a.tasaConversion) || a.tasaConversion < P.UMBRAL_CONVERSION_ALTA) return null;
      return { evidencia: { valor: a.tasaConversion, sesiones: a.totalSesiones } };
    },
    texto: (ev) => `Tu sitio convierte bien (${pct(ev.valor)}%), pero recibe pocas visitas.`,
    accion: "Invertir en difusión: el sitio ya está preparado para convertir más tráfico."
  },
  {
    // A7 = sesiones con carrito / sesiones totales
    id: "ACC-05", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const c = ctx.carrito;
      if (!c || !ctx.sitio || c.conCarrito < P.MIN_CARRITOS) return null;
      const total = ctx.sitio.actual.totalSesiones;
      if (!(total > 0)) return null;
      const tasa = c.abandonoCarrito / c.conCarrito;
      if (tasa <= P.UMBRAL_ABANDONO_CARRITO) return null;
      return {
        severidad: severidadS1(tasa, P.UMBRAL_ABANDONO_CARRITO, 1),
        alcance: c.conCarrito / total,
        evidencia: { tasa, carritos: c.conCarrito }
      };
    },
    texto: (ev) => `El ${pct(ev.tasa)}% de quienes agregan productos al carrito no compra.`,
    accion: "Simplificar el pago, mostrar los costos de envío desde el inicio y ofrecer más medios de pago."
  },
  {
    id: "ACC-06", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Bajo",
    evaluar: (ctx, P) => evaluarFormularios(ctx, P, false),
    texto: (ev) => `El ${pct(ev.tasaAbandono)}% de quienes empiezan el formulario ${ev.formId} no lo terminan.`,
    accion: "Acortar el formulario y pedir solo los datos imprescindibles."
  },
  {
    id: "ACC-07", etapa: "Acción", tipo: "Umbral", impacto: 3, esfuerzo: "Bajo",
    evaluar: (ctx, P) => evaluarFormularios(ctx, P, true),
    texto: (ev) => `La mayoría abandona el formulario ${ev.formId} después del campo "${ev.campo}".`,
    accion: "Revisar el campo siguiente: simplificarlo, hacerlo opcional o explicar para qué se pide."
  },
  {
    id: "ACC-08", etapa: "Acción", tipo: "Umbral", impacto: 2, esfuerzo: "Bajo",
    evaluar: (ctx, P) => {
      const d = ctx.distribuciones && ctx.distribuciones.paginaAbandono;
      if (!d || !d.top) return null;
      return evaluarConcentracion(d.top.cantidad, d.total, P.MIN_SESIONES, P.UMBRAL_CONCENTRACION_SALIDA, { pagina: d.top.valor });
    },
    texto: (ev) => `Muchas visitas terminan en ${ev.pagina} (${pct(ev.proporcion)}%).`,
    accion: "Revisar esa página: si no es de cierre, agregar un camino claro para continuar."
  },

  // ===================== FIDELIZACIÓN (FID) =====================
  {
    id: "FID-01", etapa: "Fidelización", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      if (!ctx.sitio) return null;
      const a = ctx.sitio.actual;
      const r = ratioRecurrentes(a);
      if (r === null || a.totalUsuarios < P.MIN_USUARIOS || r >= P.UMBRAL_RECURRENTES) return null;
      return {
        severidad: severidadS2(r, P.UMBRAL_RECURRENTES),
        alcance: 1,
        evidencia: { proporcion: r }
      };
    },
    texto: (ev) => `Solo el ${pct(ev.proporcion)}% de tus visitantes vuelve al sitio.`,
    accion: "Pensar en formas de contacto posterior: suscripción a novedades, ofertas para volver."
  },
  {
    id: "FID-02", etapa: "Fidelización", tipo: "Variación", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      if (!ctx.sitio || !ctx.sitio.anterior) return null;
      const { actual, anterior } = ctx.sitio;
      if (actual.totalUsuarios < P.MIN_USUARIOS || anterior.totalUsuarios < P.MIN_USUARIOS) return null;
      const ra = ratioRecurrentes(actual);
      const rb = ratioRecurrentes(anterior);
      if (ra === null || rb === null || !(rb > 0)) return null;
      const variacion = (ra - rb) / rb;
      if (variacion >= P.VAR_RECURRENTES) return null;
      return {
        severidad: severidadS3(variacion, P.VAR_RECURRENTES),
        alcance: 1,
        evidencia: { variacion, actual: ra, anterior: rb }
      };
    },
    texto: (ev) => `La proporción de visitantes que vuelve bajó ${pct(Math.abs(ev.variacion))}% respecto del período anterior.`,
    accion: "Revisar novedades, promociones o comunicaciones que antes motivaban el regreso."
  },
  {
    // La métrica es un promedio sobre los recurrentes: el mínimo y la confianza usan esos usuarios.
    // A9 = recurrentes / usuarios activos
    id: "FID-03", etapa: "Fidelización", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const u = ctx.usuarios;
      if (!u || !(u.activos > 0)) return null;
      const r = u.recurrentes;
      if (r.usuarios < P.MIN_USUARIOS || !esNumero(r.frecuenciaPromedio)) return null;
      if (r.frecuenciaPromedio >= P.UMBRAL_FRECUENCIA) return null;
      return {
        severidad: severidadS2(r.frecuenciaPromedio, P.UMBRAL_FRECUENCIA),
        alcance: r.usuarios / u.activos,
        evidencia: { valor: r.frecuenciaPromedio }
      };
    },
    texto: () => "Quienes vuelven lo hacen de forma espaciada.",
    accion: "Enviar recordatorios o novedades para acortar el tiempo entre visitas."
  },
  {
    id: "FID-04", etapa: "Fidelización", tipo: "Umbral", impacto: 1, esfuerzo: "Alto",
    evaluar: (ctx, P) => {
      const u = ctx.usuarios;
      if (!u || u.activos < P.MIN_USUARIOS || !esNumero(u.diasActivoPromedio)) return null;
      if (u.diasActivoPromedio >= P.UMBRAL_DIAS_ACTIVO) return null;
      return {
        severidad: severidadS2(u.diasActivoPromedio, P.UMBRAL_DIAS_ACTIVO),
        alcance: 1,
        evidencia: { valor: u.diasActivoPromedio }
      };
    },
    texto: () => "La relación de los visitantes con el sitio dura pocos días.",
    accion: "Ofrecer incentivos para mantener el vínculo (programa de puntos, contenido periódico)."
  },
  {
    // Fortaleza: no entra al ranking
    id: "FID-05", etapa: "Fidelización", tipo: "Fortaleza", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const u = ctx.usuarios;
      if (!u || u.activos < P.MIN_USUARIOS) return null;
      const rec = u.recurrentes.tasaConversionPromedio;
      const nue = u.nuevos.tasaConversionPromedio;
      if (!esNumero(rec) || !esNumero(nue) || !(rec > 0)) return null;
      if (rec <= P.DIF_CONVERSION * nue) return null;
      return { evidencia: { recurrentes: rec, nuevos: nue } };
    },
    texto: () => "Quienes vuelven compran más que quienes llegan por primera vez.",
    accion: "Incentivar el regreso: es el público que mejor convierte."
  },
  {
    // A10 = compradores / usuarios activos
    id: "FID-06", etapa: "Fidelización", tipo: "Umbral", impacto: 2, esfuerzo: "Medio",
    evaluar: (ctx, P) => {
      const u = ctx.usuarios;
      if (!u || !(u.activos > 0) || u.compradores.total < P.MIN_USUARIOS) return null;
      const proporcion = u.compradores.unaSesion / u.compradores.total;
      if (proporcion <= P.UMBRAL_NO_REGRESAN) return null;
      return {
        severidad: severidadS1(proporcion, P.UMBRAL_NO_REGRESAN, 1),
        alcance: u.compradores.total / u.activos,
        evidencia: { proporcion }
      };
    },
    texto: (ev) => `El ${pct(ev.proporcion)}% de quienes compran no vuelve al sitio.`,
    accion: "Mantener el contacto después de la compra: seguimiento, recomendaciones y ofertas."
  },
  {
    // Fortaleza: no entra al ranking
    id: "FID-07", etapa: "Fidelización", tipo: "Fortaleza", impacto: 1, esfuerzo: "Bajo",
    evaluar: (ctx, P) => {
      if (!ctx.sitio) return null;
      const a = ctx.sitio.actual;
      const r = ratioRecurrentes(a);
      if (r === null || a.totalUsuarios < P.MIN_USUARIOS || r <= P.UMBRAL_RECURRENTES_ALTA) return null;
      return { evidencia: { proporcion: r } };
    },
    texto: (ev) => `Una buena parte de tus visitantes (${pct(ev.proporcion)}%) vuelve al sitio: tenés una base fiel.`,
    accion: "Aprovecharla: pedir opiniones, ofrecer beneficios y fomentar las recomendaciones."
  }
];

module.exports = { VERSION: "1.0-funnel", REGLAS };