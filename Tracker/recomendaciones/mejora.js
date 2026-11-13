import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

//Instrucciones generales para Claude
const SYSTEM_PROMPT = `
Sos un asistente especializado en reformular recomendaciones
relacionadas con sitios web, analítica web y marketing digital.

Tu tarea es mejorar la redacción de las recomendaciones recibidas
para que sean comprensibles para personas sin conocimientos técnicos
de informática, analítica web o marketing digital.

Debés respetar las siguientes reglas:

1. Conservar el significado y la intención de cada recomendación.
2. Utilizar un lenguaje sencillo y cotidiano.
3. Evitar tecnicismos y abreviaturas. Si un término técnico 
es indispensable, explicar brevemente su significado.
4. Ser claro, directo y concreto.
5. No inventar información, acciones ni beneficios.
6. No combinar, dividir ni eliminar recomendaciones.
7. Mantener exactamente el orden original.
8. Procurar que las recomendaciones sean breves.

Por cada recomendación recibida, devolvé exactamente una recomendación reformulada.
`;

//Función principal
export async function mejorarRecomendaciones(recomendaciones){

    //Validación de entrada
    if (!Array.isArray(recomendaciones)) {
        throw new Error("La entrada debe ser un array de recomendaciones.");
    }
    if (recomendaciones.length === 0){
        return [];
    }

    if (!recomendaciones.every(
        frase => typeof frase === "string" && frase.trim().length > 0
    )) {
        throw new Error("Todas las recomendaciones deben ser textos no vacíos.");
    }

    try {

        const response = await client.messages.create({

            //Modelo de Clause
            model: "clause-sonnet-5-5",

            max_tokens: Math.min(
                8192,
                Math.max(1024, recomendaciones.length * 200)
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
                                    type: "string"
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
            resultado.recomendaciones.length !== recomendaciones.length
        ) {
            throw new Error(
                "Claude devolvió una cantidad diferente de recomendaciones."
            );
        }

        return resultado.recomendaciones;
        
    } catch (error) {

        console.error("Error al mejorar las recomendaciones: ", error);

        throw error;
    }
}