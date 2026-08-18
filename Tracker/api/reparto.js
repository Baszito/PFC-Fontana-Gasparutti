/* ==========================================================
   CRONde reparto
   El cron toma los raw_batches, y los reparte en las tablas correspodientes.
   ========================================================== */
const cron = require('node-cron'); //para programarlo como cron
const mongo = require('mongodb'); //para conectarlo con mongo

//datos de la db
const uri = "mongodb://mongo:27017"; 
const client = new mongo.MongoClient(uri);

async function procesarBatches() { //funcion principal
    await client.connect(); //conectarse a la DB
    console.log("CRON : Conectado a MongoDB");

    let batches_array = await client.db("PruebaBBDD").collection("raw_batches").find({
        "procesado": false
    }).toArray(); //paso los batches en raw_batches a un array

    console.log(`CRON : ${batches_array.length} batch(es) pendientes de procesar`); //contador de batches a procesar

    for (const batch of batches_array) {//por cada batch
        try{
        console.log(`--- Procesando batch ${batch._id} | sesión: ${batch.sessionId} | eventos: ${batch.eventos ? batch.eventos.length : 'SIN CAMPO EVENTOS'} ---`);

        let rutas = batch.eventos.filter(e => e.tipo_evento=="pageview") //las rutas de la sesion las sacamos de las pageview
        .map(e => ({pagina: e.data.url, timestamp:new Date(e.timestamp)}));

        let eventosClave = batch.eventos.filter(e => e.tipo_evento=="objetivo")
        .map(e => ({tipo: "objetivo", subtipo: e.sub_tipo, timestamp: new Date(e.timestamp) }));
        console.log(`rutas encontradas: ${rutas.length} | eventos objetivo: ${eventosClave.length}`);//contador para control

        for (const evento of batch.eventos) { //por cada evento
            let nuevo = { //el nuevo metaevento a ingresar
                timestamp: new Date(evento.timestamp),
                metadata: {
                    siteId: batch.siteId,
                    sessionId: batch.sessionId,
                    tipo: evento.tipo_evento,
                    pagina: evento.data.url
                }
            };

            switch(evento.tipo_evento){
                case "pageview":
                    nuevo.metadata.tipo = "pageview";
                    break;
                case "click":
                    nuevo.metadata.elemento = evento.data.element;
                    nuevo.metadata.esInteractivo = evento.data.esInteractivo;
                    nuevo.metadata.tipo = "click";
                    break;
                case "objetivo":
                    nuevo.metadata.subtipo = evento.sub_tipo;
                    nuevo.metadata.tipo = "objetivo";
                    break;
                case "hover":
                    nuevo.metadata.elemento = evento.data.element;
                    nuevo.metadata.goal = evento.data.goal;
                    nuevo.metadata.tipo = "hover";
                    nuevo.metadata.duracion = evento.data.duration;
                    break;
                case "scroll":
                    nuevo.metadata.tipo = "scroll";
                    nuevo.metadata.valor = evento.data.scrollDepth;
                    break;
                case "form_field": { //caso de que sea un form. Por cuestiones de practicidad, es una tabla aparte, asi que calculamos uno aparte
                    let filtroForm = {
                        siteId: batch.siteId,
                        sessionId: batch.sessionId,
                        id_formulario: evento.data.formulario
                    };
                    let updateForm = {
                        $push: {
                            camposInteractuados: {
                                campo: evento.data.campo,
                                timestamp: new Date(evento.timestamp)
                            }
                        },
                        $set: {
                            ultimoCampoCompleto: evento.data.campo
                        },
                        $setOnInsert: {
                            siteId: batch.siteId,
                            sessionId: batch.sessionId,
                            id_formulario: evento.data.formulario,
                            id_usuario: batch.userId,
                            Inicio: new Date(evento.timestamp),
                            completado: false
                        }
                    };
                    await client.db("PruebaBBDD").collection("formularios").updateOne(
                        filtroForm, updateForm, { upsert: true }
                    );
                    console.log(`   [OK] form_field procesado (formulario: ${evento.data.formulario})`);
                    continue;
                }

                case "form_submit": {
                    let filtroForm = {
                        siteId: batch.siteId,
                        sessionId: batch.sessionId,
                        id_formulario: evento.data.formulario
                    };
                    let updateForm = {
                        $set: {
                            completado: evento.data.exitoso,
                            Fin: new Date(evento.timestamp)
                        }
                    };
                    await client.db("PruebaBBDD").collection("formularios").updateOne(
                        filtroForm, updateForm, { upsert: true }
                    );
                    console.log(`   [OK] form_submit procesado (formulario: ${evento.data.formulario})`);
                    continue;
                }
            }
            await client.db("PruebaBBDD").collection("eventos").insertOne(nuevo);
            console.log(`   [OK] evento ${evento.tipo_evento} insertado en "eventos"`);
        }

        let updateSesion = { 
            $push: {
                rutas: { $each: rutas },
                eventosClave: { $each: eventosClave }
            },
            $setOnInsert: {
                userId: batch.userId,
                siteID: batch.siteID,
                inicio: new Date(batch.inicio_sesion),
                is_mobile: batch.is_mobile,
                geo: batch.demografica,//me falta servicio de traduccion
                referrer: batch.referrer
            }
        };


        const resultadoSesion = await client.db("PruebaBBDD").collection("sesiones").updateOne(
            {sessionId: batch.sessionId},
            updateSesion,
            {upsert: true}
        );
        console.log(`   [OK] Sesiones actualizada — matched: ${resultadoSesion.matchedCount}, upserted: ${resultadoSesion.upsertedCount != null}`);

        let process_aux = {
            $set: { procesado: true }
        };

        await client.db("PruebaBBDD").collection("raw_batches").updateOne(
            {_id: batch._id},
            process_aux
        );
        console.log(`   [OK] batch ${batch._id} marcado como procesado`);
    }catch (error) {
        console.error(`Error procesando batch ${batch._id}:`, error.message);
    }
    console.log("CRON : ciclo de procesamiento terminado\n");
}}

cron.schedule('*/1 * * * *',procesarBatches);


/*machete de la DB : 
=========SITIOS=========
- id secuencial
- URL base
- nombre
- admin : nombre de usuario del administrador
- contraseña : contraseña del usuario administrador
- activo : boolean
- fechaIngreso

=========Usuarios=========
- id_user : id_site + id_persistente_use (unidos con un _)
- id persistente
- Primer Visita : Date
- Ultima Visita : Date
- Total de sesiones : COntador de sesiones
- ReferredOriginal :
- Dispositivo Habitual : Boolean, si entra mas veces por mobile o no

=========Sesiones=========
- Id_propia : id generada propia para la DB
- sessionId 
- Id_usuario
- Inicio : Date
- Fin : Date
- duraciónTotal : Inicio - Fin
- Dispositivo : is_mobile, boolean
- geo : disposicion geografica, en string, pais, provincia, ciudad
- referred : string
- paginaIngreso : url de la primera pageview
- paginaAbandono : url de la ultima pageview
- esRebote : boolean que indica si se realizo algun evento objetivo o no
- rutas : Pageview en orden + timestamps. Indica el recorrido de la sesion. Es un array
- eventoClave : Tipo / subtipo / TimeStamp

=========Formularios=========
- id_propio : id generada propia para la DB
- id_sesion : 
- id_formulario
- Inicio : Date
- Fin : Date
- Completado : booelan
- UltimoCampoCompleto : id
- CamposInteractuados : Campo+Timestamp

=========Formularios=========
- id_propio : id generada propia para la DB
- id_sesion : 
- id_formulario
- Inicio : Date
- Fin : Date
- Completado : boolean
- UltimoCampoCompleto : id
- CamposInteractuados : Campo+Timestamp

=========Eventos========= (clase abstracta)
-Timefield (timestamp)
-metafield (metaData) -> ESTO ES LO QUE VARIA DE TIPO A TIPO
-granularidad en segundos

=====Page View=====
-timeStamp : date
-metaData : 
--siteId
--sessionId
--tipo : Pageview
--url 

=====Scroll=====
-timeStamp : date
-metaData : 
--siteId
--sessionId
--tipo : Scroll
--url
--valor : profundidad del scrollDepth

=====Click=====
-timeStamp : date
-metaData : 
--siteId
--sessionId
--tipo : click
--element : donde se hizo click
--esInteractivo : boolean
--url

=====Hover=====
-timeStamp : date
-metaData : 
--siteId
--sessionId
--tipo : hover
--element : donde se hizo 
--duracion : en ms.
--url

=====Eventos Objetivos=====
-timeStamp : date
-metaData : 
--siteId
--sessionId
--tipo : Objetivo + Subtipo
--url

Subtipo de eventos objetivo : 
-Compra
-Añadir a carrito
-Contacto
-Abandono de carrito - Metrica en realidad, se mide viendo si se añade a carrito y no se compra.
*/

