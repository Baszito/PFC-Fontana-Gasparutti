**Express con plantillas del servidor (EJS o Handlebars):**
	-> Ventajas:
		- Usa el mismo stack que la API y los crons (Node, driver de MongoDB, Docker).
		- Es un solo proyecto, sin compilación ni API aparte.
		- El Login con sesiones es simple.
	-> Desventajas:
		- Poca interactividad con JavaScript extra.
		- La vista avanzada necesitaría gráficos y secciones despleglables hechos a mano, por ejemplo con Chart.js.
		- Con el tiempo se mezclan lógica y HTML.

**React (Vite) y API REST en Express:**
	-> Ventajas:
		- Los componentes se reutilizan (la misma tarjeta de recomendación sirve en la básica y, con más detalle, en la avanzada). 
		- Los gráficos y la interactividad son sencillos.
		- La API queda reutilizable.
	-> Desventajas:
		- Son dos proyectos y dos contenedores, con configuración de CORS y autenticación.
		- Tiene una curva de aprendizaje si no se conoce del tema.
		- Es más trabajo para una cantidad reducida de pantallas.

**Next.js (React full-stack):**
	-> Ventajas:
		- Interfaz y backend en un único proyecto, con acceso a MongoDB desde el servidor y librerías de login.
	-> Desventajas:
		- Es un framework pesado, con conceptos propios y cambios frecuentes entre versiones.
		- Es demaciado trabajo para pocas pantallas.

**Python: Streamlit o Dash:**
	-> Ventajas:
		- Es lo más rápido para mostrar datos, usa PyMongo directo y trae los gráficos incluidos.
	-> Desventajas:
		- El login y el aislamiento por sitio son limitados y requieren librerías externas.
		- Hay poca libertad de diseño, y en Streamlit el script se re-ejecuta en cada interacción.
		- Sirve como prototipo interno, pero no como un producto para clientes.

**¿Por qué React??**
	-> La API en Express reutiliza lo que ya hicimos: el driver de MongoDB, el patrón de CORS y la forma de ejecutarse en contenedores.
	-> La vista avanzada es la que más pesa, y es la más interactiva: mostrar cómo se calculó cada recomendación, sus factores y demás datos. Eso encaja bien con componentes reutilizables.
	-> Con pocas pantallas, el front se mantiene chico.
	-> Separar datos y presentación en capas también suma valor al informe
