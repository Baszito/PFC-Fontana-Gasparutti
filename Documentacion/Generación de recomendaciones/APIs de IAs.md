**Anthropic** (Claude 3.5 Sonnet):
	- Fortalezas: El estilo de redacción más natural, humano y menos "robótico". Excelente matiz linguistico.
	- Ideal para: Proyectos donde la calidad de redacción y el tono profesional/empático sean críticos
	- Costo relativo: Medio
	- Precios:
		- Modelo de Entrada (Claude Haiku 5.5): Su costo base arranca en $0.10 USD por MTok.
		- Modelo Avanzado (Claude Sonnet / Opus 4.1): Los modelos de gama alta llegan hasta los $15 USD por MTok.
	- Estrategias de ahorro: En caso de utilizar una lista fija de instrucciones (system prompts) en cada petición, Anthropic permite "cachear" ese texto. La primera carga del caché duplica temporalmente el costo base de entrada, pero las peticiones siguientes (hits) solo pagan entre el 5% y el 10% del costo de entrada regular, reduciendo drásticamente la factura global.
	- Nota de volumen: ofrecen la Batch API con un 50% de descuento para procesamiento asíncrono.

**OpenAI** (GPT-4o):
	- Fortalezas: Gran velocidad, robustez y consistencia extrema siguiendo formatos como JSON (Structured Outputs).
	- Ideal para: Aplicaciones comerciales de alto volumen que requieren velocidad y formateo estricto.
	- Costo relativo: Medio.
	- Precios:
		- Modelo de Entrada (GPT-6 Luna): Es extremadamente económico. Cuesta $0.10 USD por MTok de entrada y $0.50 USD por Mtok de salida. Ideal para procesar grandes volúmenes de texto de manera básica.
		- Modelo Balanceado (GPT-6.1 Sol / Tierra): El modelo Sol se ubica en $2.00 USD (entrada) / $10.00 USD (salida) por MTok. Es el punto óptimo para corrección de estilo avanzada sin disparar el presupuesto.
		- Modelo Flagship (GPT-6 Astra): Su modelo más potente cuesta $10.00 USD (entrada) / $50.00 USD (salida) por MTok.
		- Estrategia de ahorro: Cuenta con la Batch API, la cual permite enviar tareas que no requieran respuesta en tiempo real (pueden tardar hasta 24 horas) y ofrece un descuento del 50% en los costos de los tokens.

**OpenAI** (GPT-4o-mini):
	- Fortalezas: Extremadamente economico y rápido. Rendimiento muy decente para tareas de texto simples.
	- Ideal para: Proyectos con presupuesto limitado, fases de prueba o flujos de texto masivos.
	- Costo relativo: Muy bajo
	- Precios: similares a GPT-4o

**Google DeepMind** (Gemini 1.5 Pro / Flash):
	- Fortalezas: ventana de contexto gigante (no tan necesaria en nuestro caso) e integración nativa con ecosistemas Google.
	- Ideal para: Si ya usas Google Cloud (Vertex AI) o necesitas procesar textos gigantescos previos.
	- Costo relativo: Bajo / Medio.
	- Precios:
		- Modelos de entrada/medios (Gemini Flash): Tradicionalmente ofrece las tarifas por millón de tokens más bajas del mercado corporativo y cuenta con un nivel gratuito sustancial (con límites de peticiones por minuto) ideal para la fase de desarrollo y pruebas.
		- Estructura de salida (Gemini Pro / Advanced): Sus tarifas de salida promedian los $3.75 USD por MTok.
		- Estrategia de ahorro (Context Caching): Permite almacenar partes masivas del contexto en caché para no volver a pagar por ellas en solicitudes consecutivas, cobrando una pequeña tasa de almacenamiento por hora por cada millón de tokens resguardados.

Para la instalación y demás tendré en cuenta Claude Haiku 5.5 y GPT-6.1 Sol / Tierra

**Paso 1: Configuración de Cuentas y Credenciales**
Antes de escribir código, necesitas registrarte en las plataformas de desarrollo de cada proveedor y obtener tus llaves de acceso (**API Keys**)

**Para OpenAI (GPT-6.1 Sol / Tierra)**
	1) **Registrarte**: Ve a la plataforma de desarrolladores de OpenAI (openai.com).
	2) **Carga Crédito**: Ve a la sección **Settings > Billing** (Configuración > Facturación) y añade fondos a tu cuenta (tarjeta de crédito/débito). OpenAI opera con un sistema de prepago para cuentas nuevas.
	3) **Crea la API Key**: Ve a **API Keys** y haz clic en **Create new secret key**. Dale un nombre (ej. "Proyecto-Recomendaciones") y **copia la clave inmediatamente**, ya que no podrás volver a verla por motivos de seguridad.

**Para Anthropic (Claude Haiku 5.5)**
	1) **Registrate**: Ingresa a la consola de desarrollo de Anthropic (anthropic.com).
	2) **Carga crédito**: Ve a **Billing** y añade fondos iniciales a tu cuenta para activar el plan de pago por uso.
	3) **Crea la API Key**: Ve a la sección **API Keys**, genera una nueva llave y cópiala en un lugar seguro.

**Paso 2: Configuración del Entorno Local**
Para evitar dejar tus API Keys expuestas públicamente en tu código (lo cual es un riesgo crítico de seguridad y financiero), debes guardarlas como variables de entorno.

1) Crea un archivo llamado .env en la raíz de tu proyecto.
2) Agrega tus llaves con la siguiente estructura:

```
OPENAI_API_KEY=tu_clave_secreta_de_openai_aqui
ANTHROPIC_API_KEY=tu_clave_secreta_de_anthropic_aqui
```

**Paso 3: Instalación de Dependencias**
Ambos proveedores ofrecen librerías oficiales (SDKs) para los lenguajes más populares como Python y Node.js. 

**Opción A: Trabajo en Python**:
Abre tu terminal en la carpeta de tu proyecto e instala las librerías oficiales junto con python-dotenv (para leer el archivo .env)

```
pip install openai anthropic python-dotenv
```

**Opción B: Si trabajas con Node.js (JavaScript/TypeScript)**:
Abre tu terminal en la carpera de tu proyecto e isntala los paquetes de npm:
```
npm install openai @anthropic-ai/sdk dotenv
```

**Código de Ejemplo para Procesar las recomendaciones**: (python)
```
import os
from dotenv import load_dotenv
from openai import OpenAI
from anthropic import Anthropic

# Cargar las variables de entorno del archivo .env
load_dotenv()

texto_recomendacion_bruto = "hacer ejercicio por la mañana es bueno para la salud y te da energia todo el dia"

# --- EJEMPLO CON OPENAI (GPT-6.1 Sol / Terra) ---
def mejorar_con_openai(texto):
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    response = client.chat.completions.create(
        model="gpt-6.1-sol", # O el modelo específico que utilices (Sol / Terra)
        messages=[
            {"role": "system", "content": "Eres un editor experto. Tu tarea es tomar recomendaciones en texto bruto y devolverlas redactadas de manera profesional, persuasiva y completamente desarrollada."},
            {"role": "user", "content": texto}
        ]
    )
    return response.choices[0].message.content

# --- EJEMPLO CON ANTHROPIC (Claude Haiku 5.5) ---
def mejorar_con_anthropic(texto):
    client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    
    response = client.messages.create(
        model="claude-3-5-haiku-20241022", # Ajustar a la versión exacta de Haiku 5.5
        max_tokens=1000,
        system="Eres un editor experto. Tu tarea es tomar recomendaciones en texto bruto y devolverlas redactadas de manera profesional, persuasiva y completamente desarrollada.",
        messages=[
            {"role": "user", "content": texto}
        ]
    )
    return response.content[0].text

# Ejecución de prueba
print("Resultado OpenAI:", mejorar_con_openai(texto_recomendacion_bruto))
print("Resultado Anthropic:", mejorar_con_anthropic(texto_recomendacion_bruto))

```
