
/* ==========================================================
   API de ingesta.
   Esta api solo se encarga de comunicar el tracker con la DB.
   ========================================================== */

//usamos express, express permite hacer ROUTING
//puedo redirigir como responde una aplicacion a una peticion HTTP + UI
//siempre es app.METHOD(PATH,HANDLER)
const express = require('express');
const mongo = require('mongodb');
const cors = require('cors'); //middleware, sirve para evitar un errorcito al probar en local
const app = express(); //creo aplicacion en express
const port = 4000;

//app.use = se ejecuta ANTES de cualquier metodo http
app.use(express.json()); //middleware, esto me parsea el json que llega al req.body

app.use(cors({//y este es para poder enviar y recibir en la misma pc sin que el navegador tire error de seguridad
    origin: "http://localhost:3000",
    credentials: true
}));
//datos de la db
const uri = "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);

async function main() {
    await client.connect();
    
    console.log("API : Conectado a MongoDB");
    const db = client.db("PruebaBBDD");
    app.post("/", async (req, res) => {
    try {
            if (req.body.eventos == null) {
                return res.status(400).json({ error: "Faltan eventos" });
            }

            // buscar el sitio por site_id
            const sitio = await db.collection("sitios").findOne({
                _id: new mongo.ObjectId(req.body.siteId)
            });

            if (sitio == null) {
                console.log(`Sitio no encontrado: ${req.body.siteId}`);
                return res.status(404).json({ error: "Sitio no encontrado" });
            }

            // obtener el origin del request
            const origin = req.headers.origin;

            if (origin == null) {
                console.log("Request sin header Origin");
                return res.status(400).json({ error: "Origin no presente" });
            }

            // extraer solo el hostname de ambas URLs (sin protocolo ni path)
            const origenHost = new URL(origin).hostname;
            const baseUrlHost = new URL(sitio.url).hostname;

            // comparar
            if (origenHost !== baseUrlHost) {
                console.log(`Origin no coincide. Esperado: ${baseUrlHost}, recibido: ${origenHost}`);
                return res.status(403).json({ error: "Origin no autorizado" });
            }

            // sigue el flujo normal
            await db.collection("raw_batches").insertOne({
                ...req.body,
                procesado: false
            });
            

            res.status(200).json({ ok: true });

        } catch (error) {
            console.log(`Error en validación de sitio: ${error.message}`);
            res.status(500).json({ error: "Error interno" });
        }
    });

    app.listen(port, () => { //porteo manual de la app creada al puerto asignado
      console.log(`Escuchando a la app en el puerto ${port}`);
    });
}

main();

