La idea de LeerContextos es traer toda la informacion necesaria para generar las recomendaciones en una unica vez, sin tener que realizar multiples consultas.
Para ello, devuelve un "contexto", que es un mapa con todos los datos necesarios.
Especificamente, cada contexto se trae : 

| Sección | Qué trae | De dónde sale | Reglas que la usan |
|---|---|---|---|
| `meta` | Fecha de la corrida (`ahora`), los períodos `actual` y `anterior` (cada uno con `desde` y `hasta`), fechas de los análisis y la lista de `errores` de lectura | Fechas `fechaCalculo` de `metricas_resumen` | Ninguna directamente; se guarda con cada recomendación (`periodo`, `fechaGeneracion`) |
| `sitio` | Para el período `actual` y el `anterior`: `totalSesiones`, `usuariosNuevos`, `usuariosRecurrentes`, `totalUsuarios`, `tasaRebote`, `tasaConversion`, `paginasPorSesionPromedio`, `duracionSesionPromedio` (minutos), `tiempoConversionPromedio` (segundos) | `metricas_resumen`: los últimos 3 documentos del sitio | ATR-01 a 03, INT-01 a 04, CON-05, ACC-01 a 04, FID-01, 02 y 07 |
| `paginas` | `totalPageviews` y una lista `items`, una por página, con `pagina`, `pageviews`, `clicksMuertos`, `rageClicks`, `scrollDepthPromedio`, `tiempoPromedioPagina` y sus `elementos` (`elemento`, `goal`, `hoverPromedio`). Las URL se normalizan y las repetidas se juntan | `metricas_resumen.metricas_paginas` del período actual | INT-05, INT-06, CON-01 a 03 |
| `formularios` | Lista `items`, uno por formulario: `formId`, `total` (formularios iniciados), `tasaAbandono`, `campoAbandonoMasComun` | `metricas_resumen.metricas_formularios` + conteo en la colección `formularios` | ACC-06, ACC-07 |
| `distribuciones` | Cómo se reparten las sesiones del período: `paginaInicio`, `paginaAbandono` y `pais` (cada una con `total` y `top` = valor más frecuente y su cantidad), y `dispositivo` (`total`, `movil`, `desktop`) | Colección `sesiones` | ATR-04 a 07, ACC-08 |
| `carrito` | `conCarrito` (sesiones que agregaron un producto) y `abandonoCarrito` (de esas, las que no compraron) | Colección `sesiones` (`eventosClave`) | ACC-05 |
| `paginasConversion` | Lista de `{ pagina, cantidad }`: dónde ocurrieron conversiones (compra, suscripción o contacto) | Colección `eventos` (tipo objetivo) | Reglas de análisis (todavía no) |
| `usuarios` | `activos`, `origenes` (`total` y `top`), `interaccionesPromedio`, `diasActivoPromedio`, `recurrentes` (`usuarios`, `frecuenciaPromedio`, `tasaConversionPromedio`), `nuevos` (`usuarios`, `tasaConversionPromedio`) y `compradores` (`total`, `unaSesion`) | Colección `usuarios` + `sesiones` | ATR-08, CON-04, FID-03 a 06 |
| `analisis` | Último resultado de cada técnica: `clusters`, `patrones`, `apriori`, `randomForest` | Colecciones `analisis_*` | Reglas de análisis (todavía no; la sección está comentada) |
