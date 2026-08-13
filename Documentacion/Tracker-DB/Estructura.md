El siguiente modulo se encarga de la recolección y almacenamiento de los datos. 
Para realizar dichas tareas, se diseño la siguiente estructura modular : 
![[Pasted image 20260810224016.png]]

A nivel general, el modulo cuenta con las siguientes partes : 

**Script de trackeo** : El script encargado por la detección de eventos asi como la recolección de datos propios de la sesión y del usuario. Este se incorpora a los sitios y se comunica con la API para el envio de los datos.
**API** : Interfaz encargada de tomar los datos de los eventos realizados asi como de la sesión y los envia a la colección raw_batches de la base de datos.
Base de datos :
**CRON**  : Cron_job de acomodamiento de datos. Se encarga de tomar los raw_batches y acomodar los datos en su tabla correspondiente segun tipo. Ademas realiza algunas acciones simples de preprocesamiento como traducción de formatos de hora o informacion demografica.