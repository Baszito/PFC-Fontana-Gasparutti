const cron = require('node-cron');
const mongo = require('mongodb');

const uri = "mongodb://mongo:27017";
const client = new mongo.MongoClient(uri);

//=====================================================================================================
//===================================== Metricas de usuario ===========================================
//=====================================================================================================

async function metricas_usuario(db){
  //Me traigo las dos coleccione
  const usuarios = db.collection("usuarios");
  const sesiones = db.collection("sesiones");

  //Me traigo las de la ultima semana
  let ultimoDia = Date.now() - (24 * 60 * 60 * 1000);
  //me da paja comentar jeje
  const totales = await sesiones.aggregate([
    { $match: { Fin: { $exists: true } ,
                Inicio: {$gte: ultimoDia}
  } }
    ,
    { $addFields: 
      { cantidadPaginas: {$size: "$rutas"},
        tuvoConversion: { $gt: [{ $size: "$eventosClave" }, 0] },
        tuvoCarrito: { $in: ["añadir-a-carrito", "$eventosClave.subtipo"] },
        tuvoCompra: { $in: ["compra", "$eventosClave.subtipo"] }
    }
      
  },
    {
      $group: {
        _id:"$userId" ,//agrupo por userId
      totalSesiones:{ $sum: 1 },
      duracionPromedio:{$avg:"$duracionTotal"},
      tasaRebote:{$avg:"$esRebote"},
      paginasPorSesionPromedio: { $avg: "$cantidadPaginas"},
      tasaConversion: { $avg:"$tuvoConversion"},
      primeraSesion: { $min: "$Inicio" },
      ultimaSesion: { $max: "$Inicio" }
      }
    }
  ]).toArray()

  console.log(JSON.stringify(totales,null,2))
}


async function calcularMetricas() {
  await client.connect();
  console.log("CRON PROCESAMIENTO: Conectado a MongoDB");

  const db = client.db("PruebaBBDD");

  const usuarios_procesados = await metricas_usuario(db);

  console.log("CRON PROCESAMIENTO: Finalizado");
  await client.close();
}

cron.schedule('*/3 * * * *', calcularMetricas);