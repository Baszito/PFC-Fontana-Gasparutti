Esta es la funcion que orquesta la parte de la generacion de textos.
Primero, se trae en si todos los contextos.

El proceso en si se divide en 3 etapas : 
1. Evaluacion : A partir de los datos de un contexto, evalua a partir de diferentes tipos de **reglas**. Si no se cumple ninguna, devuelve un null y no sigue con el resto. Si se cumple, devuelve una evidencia (valores con los que se evaluo). 
2. Generacion de texto : Plantilla con huecos en donde va la evidencia.
3. Accion : Frase fija, sobre como actuar.
Las reglas son de 4 tipos : 
- Umbral : Si se supera cierto valor, se dispara la regla. Ejemplo : ATR-04 (Una sola pagina de entrada). Se fija un umbral mayor al 60%.
- Variacion : Compara periodos, y luego pone un umbral. Ejemplo : ATR-02, si hay una caida de mas del 20% en el trafico, avisa.
- Calidad de datos : Esto es algo interno, simplemente avisa que no hay suficiente informacion para generar recomendaciones.
- Fortaleza : Avisa de una parte buena del sitio. Por ejemplo, FID-07 informa que el 40% de los usuarios son recurrentes.
Cabe destacarse que Calidad y Fortaleza no van a la misma coleccion que las recomendaciones, ya que no compiten con estas. Son datos adicionales, para enriquecer el analisis.

--------------------------------------------------------------------

Para realizar esto, las recomendaciones tienen dos archivos adicionales : 
- Parametros : Es donde se guardan los umbrales que se utilizan para las reglas.
- Catalogo : Aqui es donde se guardan tanto las reglas, los textos, y las funciones evaluadoras (evaluarCaida,Suba,Pagina,Concentracion,etc).
