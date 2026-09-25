
Esto lo vamos a hacer en una única tabla, va a ser algo similar a "metricas_resumen".
![[Diagrama sin título.drawio (1).png|411]]

Si bien ahí figuran algunas colecciones puntuales de consulta, pueden ser más. Pongo esas a modo de referencia como para ir mirando rápido nomás.

**Analíticas de metricas_resumen y metricas_historial:**

Acá la idea sería comparar los mismos campos de ambas colecciones, con el fin de obtener las evoluciones de cada una de las métricas. Para ser claro, hablamos de métricas numéricas. Con las métricas que son texto, podemos guardar alguna especie de "historial" (viejo -> nuevo) en caso de que veamos que, por ejemplo, el cambio de la página más visitada (particularmente de una a otra) sea algo importante, y no un hecho aislado de "se ve que a la gente le gusta más esta página".

Acá no se si hay mucho más para hacer, porque no se hasta donde alguno de estos datos puede servir para cualquiera de los algoritmos que siguen, pero bueno, ante la duda están ahí.

**Algoritmos:**

**-K-Means:**


**-A-priori:**
	La idea es encontrar cuales son los elementos dentro de un arreglo que se repiten con más frecuencia. Acá el orden se pierde, solo importa la existencia (para encontrar los patrones secuenciales jugará Prefixspan). Qué es entonces lo que podemos sacar de A-priori: patrones de asociación de páginas o eventos asociadas a una mayor probabilidad de conversión. Por ejemplo, podemos decir "La tasa de conversión es mayor cuando la sesión contiene en rutas los elementos "/home" y "/checkout"".

**-Prefixspan:**


**-Random Forest**
	Podemos usar los datos que están en los documentos de sesiones para tratar de predecir las conversiones basadas en dichos datos. La idea es usar como etiqueta el valor de esRebote de cada sesión, y valores como "is_mobile", "referrer", "cantidad de páginas", "rage Clicks" (esto no está pero creo que se puede agregar), "tiempo sesión", "pagina ingreso", etc. para detectar luego que factores actuan sobre la conversión.  Ejemplo: "Las sesiones que duran más de 3 minutos y no tienen rage Clicks se convierten el 68% de las veces".
	Hay otra recomendación sobre esta misma idea que es la "regresión logistica", trabaja mejor con menos datos, y da información del estilo "cada rage Click reduce la probabilidad de conversión en un X%". Enriquece un poco más la data de los RF.


**-Otro?**

**-Survival Analysis**
	Es una técnica que determina "tiempo hasta un evento". Da respuesta a preguntas del estilo, "cuál es la probabilidad de que una sesión siga activa luego de 5 minutos". Da resultados similares a tiempo conversión promedio de "métricas_resumen", pero teoricamente aporta más información.

**-Isolation Forest:**
	Detectar patrones o sesiones "raros", o cosas que levantes sospechas sobre comportamientos. Puede servir a modo de alerta.

**-Análisis de cohortes:**
	Esto está bastante piola. Básicamente es agrupar usuarios por sus fechas de inicio, e ir analizando sus evoluciones a lo largo del tiempo. Habría que ver que tan complejo puede llegar a volverse, pero es una alternativa viable para analizar la retención de usuarios.

**-Embudo de conversión con análisis de "drop-off" estadístico:**
	Tengo que terminar de ver cómo es esto, pero según Claude, da información que puede ser muy relevante a nivel de negocio, al comparar la conversión basada en dos parámetros seleccionados. Por ejemplo, mobile vs Desktop.


**Ahora si, ALMACENAMIENTO**
La idea sería que cada una de esas analíticas se haga por separado, por ejemplo en funciones, donde cada una reciba y devuelva un diccionario. La idea es que lo primero que deben revisar cada una es la fecha en la que se calculó dicha analítica. Si la fecha de cálculo es bastante reciente, es al pedo recalcular todas, por ende podemos seguir usando las ya existentes. En caso de que ya haya pasado un tiempo determinado, que sea considerado suficiente, se calcularán nuevamente, y se agregarán a un diccionario, donde la palabra clave será el nombre de la analítica (que luego será campo en el documento), y el valor será el valor obtenido. Esto se hará para cada analítica, y una vez terminado el recorrido, el documento de analíticas del sitio se actualizará con los datos obtenidos (o no, en caso de que no se hayan recalculado porque el tiempo que paso es insignificante).
Una cosa respecto al tema de ver si re-calcular o no: No es necesario pasar el documento de analíticas completo a cada función para ver si recalcularlo o no. Desde la función principal buscamos la anterior fecha de cálculo. Si esta fecha sobrepasa el tiempo de "no re-calcular", ejecutamos las funciones de cada analítica. En caso contrario, simplemente no hacemos nada, ya que el documento de analíticas se mantendrá igual.
==Observaciones:== Acá hay una cuestión para pensar en términos de diseño. Podemos tirar todas las analíticas en un mismo documento, obteniendo así documentos más grandes, pero sencillos de extraer. La otra alternativa es separar las analíticas en documentos diferentes, lo cual deja todo más ordenado, pero a la hora de extraer o guardar los datos puede ser más lento.
Claude me tiró su opinión, y dice que lo del documento único es mejor. Yo le creo a don Claudio.




