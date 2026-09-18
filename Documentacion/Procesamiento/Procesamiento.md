Se hace una distinción entre las métricas que ya otorgan cierta información relevante, y otras que se utilizarán para un análisis más profundo (como la segmentación)

metricas_historial: si bien está vacio en un principio, la idea de esta colección es almacenar el contenido de "metricas_resumen" antes de que esta sea actualizada. En el código de "procesamiento.js", la primera función en ejecutarse se corresponde con el copiado del contenido de "metricas_resumen" hacia "metricas_historial". Luego se actualizan los documentos de "metricas_resumen". La idea de esta colección es utilizarla para una futura comparación con el contenido de "metricas_resumen" para ver como evolucionaron algunos aspectos del sistema en el tiempo.

metricas_resumen:

	métricas por sitio:
			Usuarios nuevos y recurrentes: Es la cantidad de usuarios con 1 sesión (nuevos) o con más de una sesión (recurrentes) en un sitio.
			 Tasa de rebote de sesion: Es el porcentaje de sesiones que son consideradas "de rebote" (no realizaron ningún evento objetivo) en un sitio.
			 Paginas promedio por sesión: Es el promedio de páginas que los usuarios visitan en una sesión de un sitio.
			 Duración promedio de sesiones: Es el tiempo promedio de duración de las sesiones de un sitio.
			 Tasa de conversión: es el porcentaje de sesiones que realizan un evento objetivo en el sitio.
			 Tiempo promedio de conversión: Es el tiempo promedio que las sesiones de un sitio demoran en realizar un evento objetivo.
			 Dispositivo habitual: Es un valor booleano que indica si la mayoría de sesiones se realizaron en dispositivos moviles (True) o no (False)
			 Total de usuarios: Es la cantidad de usuarios que visitan un sitio.
			 Total de sesiones: Es la cantidad de sesiones realizadas en un sitio.
			 Pagina de inicio y abandono: Son las páginas donde la mayoria de sesiones inician y finalizan respectivamente.
			 Disposición geográfica: Es la ubicación desde donde se realizan la mayoría de sesiones en un sitio. Por como está configurado ahora, solo indica el país.
			
	métricas por página:
			 Pageviews: Es la cantidad de visitas que tuvo una página de un sitio.
			 ScrollDepth promedio: Es el número promedio que indica que tanto se desplazaron los usuarios hacia abajo en una página.
			 Clicks muertos: Es la cantidad de clicks realizados en una página sobre objetos no interactivos.
			 RageClicks: Es la cantidad de bloques de clicks realizados en menos de 1.5 segundos en una página de un sitio. La idea es que cada bloque tiene más de un click, y la suma de la diferencia temporal entre clicks consecutivos del bloque es menor a 1.5 segundos.
			 Tiempo promedio de sesiones: Es la duración promedio que las sesiones permanecen en una página de un sitio.
			 
	métricas por elemento:
			 Hover promedio: Es la cantidad de segundos promedio que las sesiones mantuvieron el puntero del mouse sobre un elemento de un sitio.

	métricas por formulario:
			  Tasa de abandono: es el porcentaje de sesiones que abandona sin completar un formulario de un sitio.
			  Campo de mayor abandono: es el campo donde la mayoría de sesiones que abandonan el formulario lo dejan incompleto.
			  Tiempo de completado promedio: es el tiempo promedio que demoran las sesiones en completar un formulario de un sitio.

métricas_usuario:

Aca lo mejor seria tener un campo tipo metricas{} dentro de usuario
- total_sesiones : Contador de sesiones
- duracionPromedio : Duracion promedio de la sesion.
- paginasPorSesionPromedio : promedio de cantidad de paginas por sesion.
- tasaRebote : Fraccion de sesiones que son rebote
- tasaConversion : Sesiones con al menos un evento objetivo/total de sesiones
- dispositivoPredominante : is_mobile de sus sesiones
- origenPredominante : Referrer predominante
- antiguedad : ultimasesion-primerasesion
- frecuenciaRecurrencia : totalSesioens / diasDesdePrimeraSesion
- InterrracionPromedio : Promedio de clicks+hovers+scrolls
- tiempoHastaConversion 
	
