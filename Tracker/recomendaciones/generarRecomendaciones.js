/*------------------------ ---------------------------
-------------------------- generarRecomendaciones ----
-------------------------- -------------------------*/
// Etapa "Generación de recomendación base" del diagrama, con la Ponderación adentro.
// Recibe el contexto de UN sitio (de leerContextos) y los parámetros; no toca la base.
// Evalúa las reglas de catalogo.js (hoy las 5 etapas del funnel, sin análisis).
//
// Devuelve:
//   recomendaciones  reglas disparadas con puntaje, ordenadas de mayor a menor
//   calidad          avisos de calidad de datos (no compiten en el ranking)
//   fortalezas       puntos fuertes del sitio (no compiten en el ranking)
//
// La ponderación (puntaje de 1 a 10 y prioridad) está en ponderar.js.
// Una regla puede devolver varias disparadas (una por página o formulario): cada una es una recomendación.

const { REGLAS, VERSION } = require("./catalogo");
const { ponderar } = require("./ponderar");

function generarRecomendaciones(contexto, P, reglas = REGLAS) {
  const recomendaciones = [];
  const calidad = [];
  const fortalezas = [];

  for (const regla of reglas) {
    let e;
    try {
      e = regla.evaluar(contexto, P);
    } catch (err) {
      console.log(`RECOMENDACIONES: la regla ${regla.id} falló en ${contexto.siteId}: ${err.message}`);
      continue;
    }
    if (!e) continue;

    for (const r of [].concat(e)) {
      if (regla.tipo === "Calidad de datos" || regla.tipo === "Fortaleza") {
        const aviso = { id: regla.id, siteId: contexto.siteId, etapa: regla.etapa, tipo: regla.tipo, esfuerzo: regla.esfuerzo,
                        texto: regla.texto(r.evidencia), accion: regla.accion, evidencia: r.evidencia, catalogoVersion: VERSION };
        (regla.tipo === "Calidad de datos" ? calidad : fortalezas).push(aviso);
        continue;
      }

      recomendaciones.push({
        id: regla.id,
        siteId: contexto.siteId,
        etapa: regla.etapa,
        tipo: regla.tipo,
        texto: regla.texto(r.evidencia),
        accion: regla.accion,
        esfuerzo: regla.esfuerzo,
        impacto: regla.impacto,
        ...ponderar(regla.impacto, r, P),     // severidad, alcance, puntaje, prioridad
        evidencia: r.evidencia,
        catalogoVersion: VERSION
      });
    }
  }

  recomendaciones.sort((a, b) => b.puntaje - a.puntaje);
  return { recomendaciones, calidad, fortalezas };
}

module.exports = { generarRecomendaciones };