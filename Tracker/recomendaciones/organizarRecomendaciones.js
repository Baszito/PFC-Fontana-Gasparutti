/*------------------------ ---------------------------
-------------------------- Organizar Recomendaciones ---
-------------------------- -------------------------*/
/*
Se encarga de organizarlas en tres sentidos : 
1- Que no se guarden mas de X numero, no queremos tirarle 50 recomendaciones de una
2- Que no sean todas de la misma etapa del embudo, para que sean mas variadas
3- Lo mismo, pero para pagina
*/

//Entran recomendaciones y parametros
function organizarRecomendaciones(recomendaciones, P) {
  const porEtapa = {};
  const porPagina = {};
  let totalPrincipales = 0;

  //Las ordeno de mayor a menor
  const ordenadas = [...recomendaciones].sort((a, b) => b.puntaje - a.puntaje);
  //Paso por una recomendacion
  return ordenadas.map((r, i) => {
    const pagina = (r.evidencia && r.evidencia.pagina) || null;
    //si hay lugar en la pagina
    const hayLugar =
      totalPrincipales < P.TOPE_RECOMENDACIONES &&
      (porEtapa[r.etapa] || 0) < P.TOPE_POR_ETAPA &&
      (pagina === null || (porPagina[pagina] || 0) < P.TOPE_POR_PAGINA);
    //si hay lugar en la etapa
    if (hayLugar) {
      //Si hay lugar en el sitio
      totalPrincipales++;
      porEtapa[r.etapa] = (porEtapa[r.etapa] || 0) + 1;
      if (pagina !== null) porPagina[pagina] = (porPagina[pagina] || 0) + 1;
    }

    return { ...r, pagina, posicion: i + 1, principal: hayLugar };
  });
}

module.exports = { organizarRecomendaciones };