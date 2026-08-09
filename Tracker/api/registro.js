
/* ==========================================================
   API de registro, basica, para el producto minimo viable
   ========================================================== */

const express = require('express');
const mongo = require('mongodb');
const cors = require('cors'); //middleware, sirve para evitar un errorcito al probar en local
const app = express(); //creo aplicacion en express
const port = 4000;

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
    
    app.post('/', async (req, res) => {
      if(req.body.eventos != null){//no mando batches vacios
        let batch = {...req.body,procesado:false} //agregamos un campito procesado:false para luego separar
        let ack = await client.db("PruebaBBDD").collection("raw_batches").insertOne(batch);
        res.send(ack);
      }
    }); 

    app.listen(port, () => { //porteo manual de la app creada al puerto asignado
      console.log(`Escuchando a la app en el puerto ${port}`);
    });
}

main();

