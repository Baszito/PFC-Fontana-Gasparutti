*Este es como que arranca re bien, y después se cae.*

El papel en si propone una nueva metodología para el análisis de comportamiento de usuarios : En vez de plantear un análisis de acciones de bajo nivel como clicks o vistas, prefiere plantear acciones un poco mas generales, como "Venta" o "Login", que se refieren a conjuntos de acciones atomicas.
Esto en papel suena genial, ya que las acciones de bajo nivel tienen varios problemas : No siempre reflejan algun comportamiento interesante para el sistema, varias acciones pueden corresponderse con la misma funcion, mucha variabilidad, etc. Agruparlas a un nivel mayor permite centrar el analisis a aquello que nos interesa, limpiar de ruido, analizar y automatizar acciones, etc.
La idea es trackear Logs pero a un nivel mas alto.
##### *Framework general :* 
![[Pasted image 20260708144714.png]]

## Data : 
Se compone de los logs propiamente dicho, junto con data adicional de interés, como por ejemplo información geográfica de los usuarios o resultados de las búsquedas que realiza (si muchos usuarios obtienen resultados similares, quiere decir que buscan lo mismo pero con términos diferentes).
La data en si tiene 3 consideraciones :
- <u>Agrupación de casos :</u> un caso es un conjunto de eventos interrelacionados. Son de interés para el análisis. El problema con estos es como agruparlos. Por sesión, por usuario, por objetivo de negocio, por conceptos, etc.
- <u>Variabilidad :</u> Los logs tienen muchísima variabilidad. Por eso debemos categorizarlos en eventos. Como los categorizamos es todo un tema. Pueden ser muy generales, pueden ser muy específicos, todo depende del objetivo.
- <u>Granularidad :</u> Los logs también tienen mucha variabilidad. Por ejemplo, Crtl + V y segundo click-pegar corresponden a la misma acción, pero se pueden registrar como logs distintos. Además, hay logs que son ruidos, por ejemplo, un click a un link externo o a un buscador sin buscar nada.

## **Tecnología :** 
Acá se usan un montón de técnicas de análisis para procesar los datos y poder alcanzar ciertos objetivos.  Hay 2 tipos de técnicas que se utilizan : 
- <u>Técnicas exploratorias :</u> Estas buscar descubrir fenómenos en los datos. Por ejemplo : Con que elementos se interactúa mas ? Que elementos nunca se usan ? Que rutas siguen los usuarios ? La mayoría de las técnicas son de este tipo. También sirven para detectar anomalías.
- <u>Técnicas Confirmatorias :</u> Estas buscan comprobar la veracidad de la relación entre fenómenos en los datos. Por ejemplo : Los usuarios utilizan el sistema como pensamos ? Donde se desvían de los casos de uso propuestos ? En donde dejan de usar el software ? Este nuevo feature hace el uso del sistema mas eficiente ? Usan hipótesis y estadísticas sobre los datos, análisis causales, etc.

## Objetivos : 
Acá se clasifican los objetivos en 3 tipos. No es lo mismo si queremos sacar conclusiones para decisiones de negocio que analizar el rendimiento de un sistema o buscar anomalías en el mismo.
- <u>Análisis :</u> Se explica bastante solo. Se incluyen tareas que tienen como objetivo determinar problemas, buscar posibles soluciones, identificar oportunidades, aplicar ingeniería de usabilidad, etc.
- <u>Asistencia :</u> la idea es reconocer el comportamiento del usuario, y adaptar/potenciar la experiencia según esto. Por ejemplo, fácil acceso a sus acciones mas comunes, mostrarle acciones relacionadas, etc.
- <u>Automatización :</u> La idea es identificar tareas que comúnmente se hacen con el sistema, a fin de automatizarlas.

## Teoría :
Si, hay mucha teoría de esto. Como buscarnos hacer un análisis detallado, explicativo e incluso predictivo, nos conviene tener una cierta perspectiva teórica.
- <u>Comportamiento de usuarios :</u> Aca entran bocha  de cosas que tienen que ver con como el usuario interactua con el sistema. Por ejemplo, hay una "theory of the workarounds" que describe como y por que los usuarios intencionalmente se desvian del uso prescrito del sistema. Estudiar los workarounds nos permite identificar mejorar y evitar que posibles problemas. Tambien se usan tecnicas de mineria, que nos dan datos cuantitativos, permitiendo un analisis mas profundo y tomar decisiones mas acertadas.
- <u>Comportamiento en real-life :</u> Acá analizamos mas allá del software. Por ejemplo, la teoría de la auto-regulación plantea que si una persona entra un feedback-loop, regulara su actividad sola. Por ejemplo, si comienza a hacer ejercicio de manera desregular, pero recibe algunos resultados, comenzara a regular naturalmente su rutina de ejercicios. Utilizar estas teorías aplicadas a un sistema informática nos permiten diseñar experiencias que naturalmente atraigan al usuario.

#### Guia : 
Este es un componente adicional que nos permite guiar todo el proceso. Se parte de una hipotesis a nivel teorica, y se busca direccionar el analisis en esa direccion. Se hace tanto a nivel explorativo como confirmativo.

#### Desarrollo :
Aca es al revez. Partimos de resultados obtenidos por las tecnologias, y buscamos darle un marco teorico. Esto brinda mas conceptos, y permite armar un circulo muy virtuoso con los datos.


![[Pasted image 20260708173203.png]]
Ahora el paper comienza a describir un ejemplo : 
Empresa multinacional grande con un sistema tipo ERP. El mismo cuenta con multiples navigations paths, por lo que intentar analizar logs por medio de un modelo de procesamiento se volvia inviable.
Se solvento dicho inconveniente usando tecnicas de agrupamiento segun rutas similares. Es como introducir un nivel adicional de abstraccion. Por ejemplo, Cualquier camino que lleve a concretar una venta, se agrupa junto.
Con dichos clusteres analizados, se armo un prototipo de diseño que busca cumplir la función de asistencia : Aqui se busco reducir la complejidad de la navegacion, y brindar fácil acceso a las tareas mas utilizadas.
Esto se tradujo en dos acciones : Predecir que accion es mas probable que le usuario realice próximamente para sugerirla, y la detección de anomalias presentes en el modelo de negocio, como compras por fuera del sistema, para prevenirlas.


