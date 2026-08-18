/* ==========================================================
   CRON de preprocesamiento
   ========================================================== */
const cron = require('node-cron'); //para programarlo como cron
const mongo = require('mongodb'); //para conectarlo con mongo

//datos de la db
const uri = "mongodb://mongo:27017"; 
const client = new mongo.MongoClient(uri);

/* ==========================================================
   LIMPIEZA DE DATOS :
   ========================================================== */

//Limpiar raw_batches mas viejos que la variable dias
let dias= 3;
let old_time = (Date.now() - dias * 24 * 60 * 60 * 1000) //lo pasamos a ms
async function limpiarRawBatches(){
    let raw_borrados = await client.db("PruebaBBDD").collection("raw_batches").deleteMany({
        "procesado": true,
        "tiempo_envio":{$lt:old_time}     
    });
    console.log(`Limpieza: ${raw_borrados.deletedCount} raw_batches eliminados (procesados, +${dias} días)`);
}

//Limpiar sesiones con campos faltantes/corruptos
async function limpiarSesiones(){
        let sesiones_borradas = await client.db("PruebaBBDD").collection("sesiones").deleteMany({
        $or: [
            { sessionId: { $exists: false } },
            { sessionId: { $not: { $type: "string" } } },
            { userId: { $exists: false } },
            { userId: { $not: { $type: "string" } } },
            { Inicio: { $exists: false } },
            { Inicio: { $not: { $type: "number" } } },
            { is_mobile: { $exists: false } },
            { is_mobile: { $not: { $type: "bool" } } },
            { referrer: { $exists: false } },
            { siteId: { $exists: false } },
            { siteId: { $not: { $type: "string" } } }
        ]
    });
    console.log(`Limpieza: ${sesiones_borradas.deletedCount} sesiones eliminadas por estar dañadas`);
}

//Limpiar eventos con campos faltantes/corruptos
async function limpiarEventos(){
}


/* ==========================================================
   Preprocesamiento de datos : 
   ========================================================== */

//determinar el fin de la sesion + la duracion, se va a tomar el timestamp del ultimo evento

async function finSesion(){

    let sesiones_pendientes = await client.db("PruebaBBDD").collection("sesiones").find(
        { Fin: { $exists: false } }
    ).toArray(); //obtengo las sesiones sin fin
    //de las sesiones me voy a guardar el inicio, para mas adelante calcular la duracion
    let sesionesMap = new Map(sesiones_pendientes.map(s => [s.sessionId, s]));
    let sessionIds = sesiones_pendientes.map(s => s.sessionId);
    // con aggregate obtengo una listita que tiene id de la session + el ultimoTimeStamp
    let ultimos_eventos = await client.db("PruebaBBDD").collection("eventos").aggregate(
        [{//primero, busco los eventos con el mismo sessionId
            $match:{
                "metadata.sessionId": {$in: sessionIds}
                }
            },
        {//y despues, con group voy obteniendo el ultimo
            $group:{
                _id:"$metadata.sessionId", //esto dio problemas, es el _id de agrupamiento, no el de mongo
                ultimoTimeStamp:{$max:"$timestamp"} //el valor dentro del campo del documento, por eso el $
            }
            }]

    ).toArray();

    //y ahora, reocorro ese grupo con un for y actualizo fin + duracion
    //aca voy a usar una arquitectura que lei en reddit, se usa mucho en mongo, agrupar operaciones
    let operaciones = [];
    for (const grupo of ultimos_eventos){
       try{ let sessionId = grupo._id;
        let fin = grupo.ultimoTimeStamp;
        let sesion = sesionesMap.get(sessionId);
        let duracion = fin-sesion.Inicio;
        
        operaciones.push({
            updateOne:{
                filter:{ sessionId:sessionId},
                update:{$set:{Fin: fin,duracionTotal:duracion}}
            }
        })
        }
        catch(error){
            console.log(`Error preparando update de sesión: ${error.message}`)
        }
    } //y aca las ejecuto, es decir, solo me conecto una vez a la db
    if (operaciones.length > 0) {
    let resultadoBulk = await client.db("PruebaBBDD").collection("sesiones").bulkWrite(operaciones);
    console.log(`PrePro : Sesiones actualizadas: ${resultadoBulk.modifiedCount}`);
}
}


//logica de traduccion de demografica, ojo, el nominatin tiene limitacion de 1 request por segundo

async function traducirGeo(lat,lon){
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            {
                headers: {
                    "User-Agent": "Keetup-TrackingSystem/1.0 (jfontana@keetup.com)"
                }
            }
        );
        const data = await response.json();
        let pais = data.address?.country || null;
        let provincia = data.address?.state || null;
        let ciudad = data.address?.city || null;
        return {pais,provincia,ciudad}
}

async function traducirGeolocalizaciones() {
    let pendientes = await client.db("PruebaBBDD").collection("sesiones").find({
         geo: { $type: "array" } 
    }).toArray();
    console.log(`PREPRO  : Iniciando traducciones !`)
    for (const sesion of pendientes) {
        try {
            let geoTraducido = await traducirGeo(sesion.geo[0], sesion.geo[1]);
            await client.db("PruebaBBDD").collection("sesiones").updateOne(
                {_id: sesion._id},
                {$set: {geo: geoTraducido}}
            );
            console.log(`PREPRO : Se tradujeron ${pendientes.length} direcciones !`)
        } catch (error) {
            console.error(`Error traduciendo geo de sesión ${sesion._id}:`, error.message);
        }
        await esperar(1000);//por el limite de nominatin
    }
    
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


cron.schedule('0 3 * * *', limpiarRawBatches);
cron.schedule('5 3 * * *', limpiarSesiones);
cron.schedule('10 3 * * *', finSesion);
cron.schedule('15 3 * * *', traducirGeolocalizaciones);