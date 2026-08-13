
En el pre-procesamiento se buscaran completar 2 objetivos : 
**Limpieza y corrección de los datos :**  La limpieza de los datos consiste en la obtención de un dataset preparado para procesar, eliminando datos dañados, vacíos o incompletos que puedan dificultar el posterior procesamiento y análisis, así como evitar llegar a conclusiones erróneas.
**Calculo de información faltante :** Con el fin de respetar la modularidad planteada en el proyecto, el modulo de recolección y almacenamiento se limito a justamente solo esas dos tareas. Esto permite un trackeo mas eficiente, pero también conlleva realizar un posterior calculo para poder obtener información faltante que no se capto en un primer momento. A su vez, existe información básica que no es posible obtener hasta que no haya finalizado el trackeo completo de una sesión de usuario.
Es por estos motivos que se realizan los siguiente cálculos : 
- Traducción de localizaciones 
- Calculo de duración de la sesión
- Paginas de abandono e inicio
- Creación/actualización de documentos de usuario
	- Total de sesiones
	- Dispositivo habitual
	- Ultima sesión
- 

