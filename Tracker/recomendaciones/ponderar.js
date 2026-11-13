const IMPACTO_MAXIMO = 3;
const PUNTAJE_MINIMO = 1;
const PUNTAJE_MAXIMO = 10;

//Funcioncita simple, que pondera.

//matematica auxiliar
const limitar = (x) => Math.min(1, Math.max(0, x));
const redondear = (x) => Math.round(x * 1000) / 1000;

//Priorizacion, es lo que importa al final
function prioridadDe(puntaje, P) {
  if (puntaje >= P.CORTE_ALTA) return "Alta";
  if (puntaje >= P.CORTE_MEDIA) return "Media";
  return "Baja";
}

//y aca calculamos.
function ponderar(impacto, medicion, P) {
  const severidad = Math.max(P.SEVERIDAD_MINIMA, limitar(medicion.severidad));
  const alcance = limitar(medicion.alcance);

  const producto = impacto * severidad * alcance;
  const puntaje = PUNTAJE_MINIMO + (PUNTAJE_MAXIMO - PUNTAJE_MINIMO) * producto / IMPACTO_MAXIMO;

  return {
    severidad: redondear(severidad),
    alcance: redondear(alcance),
    puntaje: Math.round(puntaje * 10) / 10,
    prioridad: prioridadDe(puntaje, P)
  };
}

module.exports = { ponderar };