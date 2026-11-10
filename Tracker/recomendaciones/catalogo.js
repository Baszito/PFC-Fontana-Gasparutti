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
// S3: la variación supera (en valor absoluto) la variación umbral
const severidadS3 = (variacion, umbral) => limitar((Math.abs(variacion) - Math.abs(umbral)) / Math.abs(umbral));

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
  }
];

module.exports = { VERSION: "0.2-atraccion", REGLAS };