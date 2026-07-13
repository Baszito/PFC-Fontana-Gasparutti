Este es como la base. Casi todos los otros papers lo citan. Peeeero...es del 2000, ya ta medio viejito. Aun asi, como vistazo general, sirve. Voy a saltear un poco tecnologias mencionadas como netscape o similares, por motivos obvios.

### Web Data
Acá menciona 2 cosas importantes : Los tipos de datos que podemos minar, y como minarlos.
#### Tipos : 
- Contenido : Se refiere a la data tangible y visible de la pagina, como texto, imagenes, graficos, etc.
- Estructura : Se refiere a la estructura de la pagina, como el HTML o tag XML que tienen.
- <font color="#00b050">Uso : Se refiere a que usos se hace de la pagina, como ips de acceso, paginas accedidas, hora de acceso, clicks, etc. ESTE ME INTERESA</font>
<font color="#00b050"> - Perfil de usuario : Se refiere a datos asociados al usuario que se pueden trackear, como información demográfica o tipos de cuentas.</font>

#### Fuentes de datos : 
- Lado del servidor : Se pueden trackear del lado del servidor, añadiendo scripts específicos. Esto tiene algunos problemas como que no trackea paginas cacheadas, o que no permitirá trackear datos enviados con el método POST de HTTP. Además, no permite trackear users individuales. Sirve muy bien si quiero trackear contenido y estructura, no tanto uso ni perfil de usuario.
- Lado del cliente : Aca es al revez. Trackea bien el uso, pero mal el contenido de la pagina (un poco lo que quermos). OJO que se requiere colaboracion del usuario. La gran contra es que no captura ciertos comportamientos por fuera de la pagina, como reloads o retrocesos, por lo que hay que ingeniarsela para obtener algun dato sobre esas acciones (asociar ips y ver accesos repetidos, por ejemplo).
- Proxy : Tambien se puede hacer con un proxy. Esto sortea los problemas de cache, brindando otra alternativa.

Por ultimo, se menciona la idea de data abstraction. En ese momento, todo eran clicks, por lo que había que asociar y agrupar clicks a que con acciones. Esto hoy por hoy lo sorteamos con eventos de javascript.

### Analisis y descubrimiento de patrones : 

El paper en si menciona bocha de cosas que se pueden hacer para descubrir patrones e inferir informacion, sin entrar mucho en detalle de cada una. El Framework general que propone es : 

![[Pasted image 20260708190725.png]]

#### Preprocesamiento de uso : 
Para el preprocesamiento de uso tenemos que tener en cuenta 4 situaciones algo problematicas : 
Una IP/Multiples sesiones : Algunos ISP tienen una pool de proxies, lo que puede dificultar el trackeo.
Multiples IP/Una sola sesion : Algunos ISP utilizan herramientas de privacidad, que pueden hacer que se cambie de ip a mitad de la sesion.
Multiples IP/Un solo usuario : Un usuario puede acceder a la web desde diferentes dispositivos.
Multiples agentes web/Un solo usuario : E incluso desde diferentes browsers, en un dispositivo.

Esto hay que ver que tanto se mantiene, ya que hoy se hace trackeo mas del lado del usuario.

<u>Descubrimiento de patrones : </u>
Aca empieza la bueno.

- **Analisis estadistico :** Este es el metodo mas comun. Obteniendo estadisticas descriptivas  como Frecuencia, Media, Mediana, varaianza, etc. Sobre datos como pages view, tiempo de vista, botones, etc. Podemos obtener informacion importante como datos de performance, seguridad, o ayudar a analisis de marketing.
- **Reglas de asociacion :** Esto sirve mucho para asociar paginas/contenido. Por ejemplo, usando el algoritmo de Apriori podriamos descubrir paginas relacionadas que no tengan un hiperviculo y sean accedidas juntas muy frecuentemente. Esto puede servir para, por ejemplo, diseñar experiencias de usuarios, cachear paginas, etc.
- **Clustering :** Las tecnicas de clustering se usan en 2 lugares.
- **Cluster de uso :** Sirve para crear grupos de usuarios a fin de poder detectarlos, estudiarlos y tomar decisiones en base a ellos.
- **Cluster de paginas :**  Esto sirve para armar grupos de paginas relacionadas en caso de contar con muchas paginas. Lo usan buscadores o sistemas muy grandes, a fin de poder organizarse y optimizar procesos del sistema.
- **Clasificacion :** Se usa para para asociar items/grupos con clases predefinidas. Por ejemplo, es util clasificar usuarios segun tipos. Lo importante es definir bien que caracteriza a cada clase. SE usan clasificadores bayesianos, k-medias,k-vecinos, etc. (Gracias Milone !)
- **Patrones secuenciales :** Aca buscamos detectar intersecciones entre patrones, por ejemplo, acciones que se realizan en una secuencia, y que se realizan despues de otra serie, y asi. Por ejemplo, si alguien compra un item X, podriamos a futuro mostrar items complementarios al item X, o un nuevo modelo del mismo.Aca tambien se incluyen todo lo relacionado a analisis mas TEMPORAL. - INVESTIGAR
- **Modelos de dependencia :** Aca buscamos armar modelos que represente dependencias significativas entre distintas variables. Por ejemplo, modelos que representan los estadios de un visitante en una pagina web. Se usan tecnicas estadisticas, como el Modelo Oculto de Markov o Bayesian Belief Network - INVESTIGAR.
La ultima parte es el ANALISIS de los patrones obtenidos.
Lo importante es identificar que reglas/patrones no me aportan valor. Para ello, hay que tener varias cosas en cuenta, como los objetivos del analisis, reglas de negocio, herramientas como business intelligence, y otras mas.

#### TAXONOMIA Y OBJETIVOS : 
Aca define 5 cosas que se pueden hacer con el Web Usage Mining : 

![[Pasted image 20260708193557.png]]

A nosotros nos interesan el System Improvement, y el Business Intelligence.

- **System improvement :** Toda estadistica/metrica obtenida que revele algun dato importante sobre el uso del sistema, puede ser usado para mejorarlo. El paper cita multiples estudios que usan web usage mining para mejorar varios aspectos como Seguridad, Perfomance, Deteccion de anomalias, etc.

- **Business intelligence :** Esto va mas por el lado de analizar medio marketineramente como funciona la pagina. Podemos llegar a detectar que paginas ven, que producto funciona, cual no,etc. Clasifica todo en 4 stages : Atraccion, Retencion, Ventas cruzadas y Departure. Creo que vamos mas por este lado.