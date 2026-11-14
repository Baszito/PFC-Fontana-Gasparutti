const sdk = require("@anthropic-ai/sdk");
const Anthropic = sdk.default || sdk.Anthropic || sdk;

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

//Instrucciones generales para Claude
const SYSTEM_PROMPT = `
Sos un asistente especializado en reformular recomendaciones
relacionadas con sitios web, analítica web y marketing digital.

Tu tarea es reescribir las recomendaciones recibidas para que las entienda
cualquier persona sin conocimientos técnicos de informática, analítica web
o marketing digital. Quienes las leerán son responsables de pymes o empresas
pequeñas que se están iniciando en el mundo digital y quieren un diagnóstico
de su negocio. Hablales de vos y con un tono cercano y claro.

Cada recomendación es un array de dos textos, en este orden:
primero el texto (diagnóstico del problema, obtenido a partir de datos)
y después la acción (qué hacer al respecto).
Por cada recomendación recibida, devolvé un array con los dos textos
reescritos, en el mismo orden: primero el texto y después la acción.

Reglas:
1. Conservar el significado y la intención de cada recomendación.
2. Usar lenguaje sencillo y cotidiano. Evitar tecnicismos y abreviaturas;
   si un término técnico es indispensable, explicarlo en pocas palabras.
3. En el texto: explicá qué significa el dato medido y por qué le importa
   al negocio. Mantené exactamente las cifras, porcentajes y nombres de
   páginas, elementos o formularios que vengan en el original.
4. En la acción: explicá cómo llevarla a cabo con pasos o ejemplos concretos
   y fáciles de aplicar. Los ejemplos sirven para ilustrar la misma acción
   indicada, no para sumar acciones nuevas.
5. No inventar datos, cifras, resultados ni beneficios que no estén en el
   original. No prometer resultados.
6. No combinar, dividir ni eliminar recomendaciones, y mantener
   exactamente el orden original.
7. Cada texto y cada acción deben tener entre 2 y 3 oraciones. Sin viñetas,
   sin listas y sin formato especial: solo texto corrido.
8. La salida debe tener exactamente la misma cantidad de recomendaciones
que la entrada. Cada recomendación es un único array con dos textos:
nunca separes el texto y la acción en arrays distintos.

Ejemplo de estilo (no lo copies, sirve solo de guía).
Recibís una lista de recomendaciones y devolvés una lista con la misma cantidad.

Entrada (1 recomendación):
[["La mayoría de las visitas (70%) entra por una sola página: /home.",
  "Cuidar esa página como puerta de entrada: mensaje claro y accesos visibles a productos y contacto."]]

Salida (1 recomendación):
[["Siete de cada diez personas que visitan tu sitio llegan por la misma página: la de inicio (/home). Eso quiere decir que casi todo tu público se forma la primera impresión de tu negocio ahí.",
  "Cuidá especialmente esa página: asegurate de que explique en pocas palabras qué ofrecés y de que desde ahí se pueda llegar fácil a tus productos o a la página de contacto. Por ejemplo, con botones grandes y bien visibles."]]`;

// Una recomendación válida es un par [texto, acción] de textos no vacíos
const esPar = (recomendacion) =>
    Array.isArray(recomendacion) &&
    recomendacion.length === 2 &&
    recomendacion.every(campo => typeof campo === "string" && campo.trim() !== "");

//Función principal
// recomendaciones: [[texto, accion], ...]  ->  devuelve [[texto mejorado, accion mejorada], ...] en el mismo orden
async function mejorarRecomendaciones(recomendaciones){

    //Validación de entrada
    if (!Array.isArray(recomendaciones)) {
        throw new Error("La entrada debe ser un array de recomendaciones.");
    }
    if (recomendaciones.length === 0){
        return [];
    }

    if (!recomendaciones.every(esPar)) {
        throw new Error("Cada recomendación debe ser un par [texto, acción] de cadenas de texto no vacías.");
    }

    try {

        const response = await client.messages.create({

            //Modelo de Claude
            model: "claude-sonnet-5-5",

            // Cada recomendación devuelve dos textos
            max_tokens: Math.min(
                8192,
                Math.max(1024, recomendaciones.length * 800)
            ),

            system: SYSTEM_PROMPT,

            //Esquema de salida esperado
            output_config: {
                format: {
                    type: "json_schema",
                    schema: {
                        type: "object",
                        properties: {
                            recomendaciones: {
                                type: "array",
                                items: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    }
                                }
                            }
                        },
                        required: ["recomendaciones"],
                        additionalProperties: false
                    }
                }
            },

            messages: [
                {
                    role: "user",
                    content: `
                        Reformulá las siguientes recomendaciones:

                        ${JSON.stringify(recomendaciones)}
                    `
                }
            ]
        });

        // Si la respuesta se cortó por el límite de tokens, el JSON queda incompleto
        if (response.stop_reason === "max_tokens") {
            throw new Error("La respuesta de Claude se cortó por el límite de tokens.");
        }

        //Extraemos la respuesta de Claude
        const contenido = response.content.find(
            bloque => bloque.type === "text"
        );

        if (!contenido) {
            throw new Error("Claude no devolvió contenido de texto.");
        }

        const resultado = JSON.parse(contenido.text);

        //Validación de cantidad
        if (
            !Array.isArray(resultado.recomendaciones) ||
            resultado.recomendaciones.length !== recomendaciones.length
        ) {
            throw new Error(
                "Claude devolvió una cantidad diferente de recomendaciones."
            );
        }

        //Validación de forma: cada una tiene que seguir siendo un par [texto, acción]
        if (!resultado.recomendaciones.every(esPar)) {
            throw new Error(
                'Claude devolvió ${resultado.recomendaciones.length} recomendaciones y se enviaron ${recomendaciones.length}.'
            );
        }

        return resultado.recomendaciones;

    } catch (error) {

        console.error("Error al mejorar las recomendaciones: ", error);

        throw error;
    }
}

module.exports = { mejorarRecomendaciones };