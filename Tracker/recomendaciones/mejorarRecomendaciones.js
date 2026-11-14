const { mejorarRecomendaciones } = require("./mejora");

// SOLO PARA PRUEBAS: procesa únicamente los sitios de la seed de atracción.
// En producción poner null para procesar todos los sitios.
const FILTRO_SITIOS = /^TEST_M1_/;

// Recomendaciones pendientes: todavía sin mejorar y con texto y acción
function filtroPendientes(siteId) {
    const filtro = {
        mejorada: { $exists: false },
        texto: { $type: "string", $ne: "" },
        accion: { $type: "string", $ne: "" }
    };
    const sitio = siteId ?? FILTRO_SITIOS;
    if (sitio) filtro.siteId = sitio;
    return filtro;
}

// Recibe la base de datos del orquestador: no abre ni cierra conexiones.
// Para cada sitio con recomendaciones pendientes hace una llamada a Claude y guarda
// mejorada = { texto, accion } en cada documento.
async function procesarRecomendaciones(db) {

    const coleccion = db.collection("recomendaciones");

    // Obtener los sitios con recomendaciones pendientes
    const sitios = await coleccion.distinct("siteId", filtroPendientes());

    console.log(`Sitios pendientes: ${sitios.length}`);

    for (const siteId of sitios) {

        console.log(`Procesando sitio: ${siteId}`);

        // Obtener todas las recomendaciones pendientes del sitio
        const documentos = await coleccion.find(filtroPendientes(siteId))
            .project({ _id: 1, texto: 1, accion: 1 })
            .toArray();

        if (documentos.length === 0) continue;

        try {

            // Vector de recomendaciones: cada una es un par [texto, acción]
            const recomendaciones = documentos.map(doc => [doc.texto, doc.accion]);

            // Una única llamada a Claude por sitio
            const mejoradas = await mejorarRecomendaciones(recomendaciones);

            // Preparar actualizaciones: mejorada = { texto, accion }
            const operaciones = documentos.map((doc, index) => ({
                updateOne: {
                    filter: {
                        _id: doc._id,
                        mejorada: { $exists: false }
                    },
                    update: {
                        $set: {
                            mejorada: {
                                texto: mejoradas[index][0],
                                accion: mejoradas[index][1]
                            }
                        }
                    }
                }
            }));

            // Actualizar todos los documentos
            const resultado = await coleccion.bulkWrite(
                operaciones,
                { ordered: false }
            );

            console.log(
                `Sitio ${siteId}: ${resultado.modifiedCount} recomendaciones mejoradas.`
            );

        } catch (error) {

            // Un sitio que falla no frena a los demás
            console.error(
                `Error procesando sitio ${siteId}:`,
                error.message
            );

        }
    }

    console.log("Mejora con IA finalizada.");
}

module.exports = { procesarRecomendaciones };
