/*------------------------ ---------------------------
-------------------------- escribirRecomendaciones ---
-------------------------- -------------------------*/
// Guarda en la colección "recomendaciones" lo que generó UN sitio en esta corrida.
// Es un historial: cada corrida agrega documentos y no borra los anteriores.


function idDe(doc, hasta) {
  const detalle = [doc.evidencia.pagina, doc.evidencia.elemento, doc.evidencia.formId].filter(Boolean).join("|");
  return [doc.siteId, doc.id, detalle, hasta.toISOString()].filter(Boolean).join("_");
}

async function escribirRecomendaciones(db, ctx, organizadas, calidad, fortalezas) {
  const { ahora, periodo } = ctx.meta;//datos necesarios

  //creo el documento
  const documentos = [...organizadas, ...calidad, ...fortalezas].map(doc => ({
    ...doc,
    fechaGeneracion: ahora,
    periodo: periodo.actual
  }));
  //si no hay nada, no hacemo nada
  if (documentos.length === 0) return 0;
  //creo el indice
  //y bulkwrite
  const coleccion = db.collection("recomendaciones");
  await coleccion.createIndex({ siteId: 1, "periodo.hasta": -1, puntaje: -1 });
  await coleccion.bulkWrite(documentos.map(doc => ({
    replaceOne: {
      filter: { _id: idDe(doc, periodo.actual.hasta) },
      replacement: doc,
      upsert: true
    }
  })));
  return documentos.length;//me dice cuando ingreso.
}
module.exports = { escribirRecomendaciones };