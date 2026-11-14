
import "dotenv/config";
import { MongoClient } from "mongodb";
import { mejorarRecomendaciones } from "./mejorarRecomendaciones.js";

const uri = "mongodb://mongo:27017";
const client = new MongoClient(uri);

async function procesarRecomendaciones() {

    try {
        await client.connect();

        const db = client.db("PruebaBBDD");
        const coleccion = db.collection("recomendaciones");

        // Obtener los sitios con recomendaciones pendientes
        const sitios = await coleccion.distinct("siteId", {
            mejorada: { $exists: false },
            accion: { $type: "string", $ne: "" }
        });

        console.log(`Sitios pendientes: ${sitios.length}`);

        for (const siteId of sitios) {

            console.log(`Procesando sitio: ${siteId}`);

            // Obtener todas las recomendaciones pendientes del sitio
            const documentos = await coleccion.find({
                siteId: siteId,
                mejorada: { $exists: false },
                accion: { $type: "string", $ne: "" }
            })
            .project({ _id: 1, accion: 1 })
            .toArray();

            if (documentos.length === 0) continue;

            try {

                // Crear vector de recomendaciones
                const acciones = documentos.map(doc => doc.accion);

                // Una única llamada a Claude por sitio
                const mejoradas = await mejorarRecomendaciones(acciones);

                // Preparar actualizaciones
                const operaciones = documentos.map((doc, index) => ({
                    updateOne: {
                        filter: {
                            _id: doc._id,
                            mejorada: { $exists: false }
                        },
                        update: {
                            $set: {
                                mejorada: mejoradas[index]
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

                console.error(
                    `Error procesando sitio ${siteId}:`,
                    error.message
                );

            }
        }

        console.log("Proceso finalizado.");

    } catch (error) {

        console.error("Error general:", error);

    } finally {

        await client.close();

    }
}

procesarRecomendaciones();
