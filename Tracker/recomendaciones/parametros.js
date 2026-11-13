/*------------------------ ---------------------------
-------------------------- Parametros ----------------
-------------------------- -------------------------*/
// Todo número que haya que ajustar con datos reales vive acá y solo acá: las reglas (catalogo.js)
// y el motor (generarRecomendaciones.js) no tienen números escritos.
// Los valores iniciales salen de la columna "Umbral inicial" de Recomendaciones_1_.xlsx y son
// ESTIMATIVOS: se recalibran con datos reales.
//
// Convenciones:
//   - proporciones y tasas entre 0 y 1 (0.60 = 60 %)
//   - una variación negativa es una caída (-0.20 = cae 20 %); una positiva, una suba
//   - las variaciones son relativas al período anterior
//   - la unidad de cada valor, cuando no es una proporción, está en su comentario

module.exports = {
  // --- Ponderación: puntaje = impacto x severidad x alcance x confianza
  N_CONFIABLE: 100,         // C1: confianza = min(1, datos / N_CONFIABLE)
  SEVERIDAD_MINIMA: 0.10,   // piso: una regla que se dispara nunca pesa menos de
  CORTE_ALTA: 5.5,
  CORTE_MEDIA: 3.5,
  
  // --- Listado principal que ve el dueño del sitio (etapa de organización)
  TOPE_RECOMENDACIONES: 10,
  TOPE_POR_ETAPA: 2,
  TOPE_POR_PAGINA: 2,

  // --- Datos mínimos: por debajo de esto la regla no se evalúa
  MIN_SESIONES: 30,
  MIN_USUARIOS: 20,
  MIN_VISITAS_PAGINA: 20,
  MIN_CONVERSIONES: 5,
  MIN_CARRITOS: 10,
  MIN_FORMULARIOS: 10,

  // --- Atracción
  VAR_USUARIOS_NUEVOS: -0.20,           // ATR-01
  VAR_SESIONES: -0.20,                  // ATR-02
  UMBRAL_CONCENTRACION_ENTRADA: 0.60,   // ATR-04: una sola página de ingreso
  UMBRAL_CONCENTRACION_PAIS: 0.80,      // ATR-05: un solo país
  UMBRAL_MOVIL: 0.60,                   // ATR-06
  UMBRAL_DESKTOP: 0.60,                 // ATR-07 (el xlsx dice UMBRAL_MOVIL: asumo error de tipeo)
  UMBRAL_CONCENTRACION_ORIGEN: 0.70,    // ATR-08: un solo origen de usuarios

  // --- Interés
  UMBRAL_REBOTE: 0.60,        // INT-01: tasaRebote por encima
  VAR_REBOTE: 0.15,           // INT-02: tasaRebote SUBE más que esto
  UMBRAL_DURACION: 1,         // INT-03: minutos (duracionSesionPromedio está en minutos)
  UMBRAL_PAGINAS: 2,          // INT-04: páginas por sesión
  UMBRAL_SCROLL: 0.50,        // INT-05: scroll promedio de una página (verificar la escala con la que guarda el tracker)
  UMBRAL_TIEMPO_PAGINA: 10,   // INT-06: segundos en la página

  // --- Contenido
  UMBRAL_HOVER: 3,                // CON-01: segundos de hover en un elemento (verificar la unidad de metadata.duracion)
  UMBRAL_CLICKS_MUERTOS: 0.05,    // CON-02: proporción de las visitas de la página
  UMBRAL_RAGE_CLICKS: 0.02,       // CON-03: proporción de las visitas de la página
  UMBRAL_INTERACCIONES: 3,        // CON-04: acciones por sesión
  UMBRAL_TIEMPO_CONVERSION: 300,  // CON-05: segundos hasta convertir

  // --- Acción
  UMBRAL_CONVERSION: 0.02,              // ACC-01 y ACC-03: tasa de conversión por debajo
  VAR_CONVERSION: -0.20,                // ACC-02
  UMBRAL_TRAFICO_ALTO: 500,             // ACC-03 y ACC-04: sesiones
  UMBRAL_CONVERSION_ALTA: 0.05,         // ACC-04
  UMBRAL_ABANDONO_CARRITO: 0.70,        // ACC-05
  UMBRAL_ABANDONO_FORM: 0.50,           // ACC-06 y ACC-07
  UMBRAL_CONCENTRACION_SALIDA: 0.30,    // ACC-08: una sola página de abandono

  // --- Fidelización
  UMBRAL_RECURRENTES: 0.20,        // FID-01: recurrentes / total de usuarios por debajo
  VAR_RECURRENTES: -0.15,          // FID-02
  UMBRAL_FRECUENCIA: 0.2,          // FID-03: sesiones por día de los recurrentes
  UMBRAL_DIAS_ACTIVO: 2,           // FID-04: días
  DIF_CONVERSION: 1.5,             // FID-05: veces que convierten más los recurrentes que los nuevos
  UMBRAL_NO_REGRESAN: 0.70,        // FID-06: compradores con una sola sesión
  UMBRAL_RECURRENTES_ALTA: 0.40,    // FID-07

  // --- Patrones secuenciales
  SOPORTE_SECUENCIAL: 0.10,   // PS-01 a PS-05: debe coincidir con soporte_secuencial de lectura_escritura.py
  UMBRAL_PASOS: 5,            // PS-03: páginas hasta llegar a una conversión
  UMBRAL_PATRONES: 3,         // PS-04: patrones frecuentes que comparten una página intermedia

  // --- Clusters
  REL_ALTO: 1.25,                            // KM-01 y KM-03: veces el promedio general
  MIN_USUARIOS_CLUSTER: 10,                  // KM-01 a KM-04: tamaño mínimo de un cluster
  UMBRAL_TAMANO_CLUSTER: 0.15,               // KM-02: proporción mínima de los usuarios
  UMBRAL_SILHOUETTE: 0.25,                   // KM-05
  DIVISOR_TIEMPO_CONVERSION_USUARIO: 1000,   // KM-04: metricas.tiempoHastaConversion está en ms (verificar)

    // --- Reglas de asociación (Apriori)
  UMBRAL_CONFIANZA: 0.60,   // AP-01 a AP-03: confianza mínima de la regla
  UMBRAL_LIFT: 1.5,         // AP-01 a AP-04: lift mínimo de la regla
  FRAGMENTOS_PAGINAS_EMBUDO: ["carrito", "checkout", "pago", "envio", "confirmacion", "registro", "login"],
                            // AP-03: una página que contenga alguno de estos textos no es "informativa"

  // --- Random Forest
  UMBRAL_CALIDAD_MODELO: 0.60,    // F1 mínimo de la clase positiva
  UMBRAL_IMPORTANCIA_SHAP: 0.05,  // importanciaPromedio mínima de una variable (escala de probabilidad)
  UMBRAL_DIRECCION: 0.3,          // |dirección| mínima
  TOP_VARIABLES: 2,               // variables por modelo que generan recomendación (valor propuesto)
  UMBRAL_RECURRENTES_ALTA: 0.40    // FID-07

  
};