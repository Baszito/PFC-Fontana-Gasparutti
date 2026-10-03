db = db.getSiblingDB("PruebaBBDD");

const ahora = new Date("2026-09-29T12:00:00.000Z");
const ORIGENES = ["directa", "search", "social"];

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function entre(min, max) {
  return min + Math.random() * (max - min);
}

function elegir(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// Focalizado: pocas páginas y sesiones cortas. Explorador: muchas páginas y sesiones largas.
const ARQUETIPOS = {
  focalizado: {
    paginas: () => Math.round(entre(1, 3)),
    duracion: () => entre(0.3, 2),
    rebote: () => entre(0, 0.3),
    interacciones: () => entre(1, 4),
    conversion: 0.5,
    tiempo: () => entre(15_000, 120_000),
    recurrencia: () => entre(0.2, 1.5)
  },
  explorador: {
    paginas: () => Math.round(entre(6, 10)),
    duracion: () => entre(5, 10),
    rebote: () => entre(0, 0.10),
    interacciones: () => entre(20, 40),
    conversion: 0.25,
    tiempo: () => entre(180_000, 900_000),
    recurrencia: () => entre(0.1, 0.8)
  }
};

function crearUsuario(siteId, tipo, opciones = {}) {
  const a = ARQUETIPOS[tipo];
  const userId = uuid();
  const totalSesiones = opciones.totalSesiones ?? Math.max(1, Math.round(entre(1, 15)));
  const diasActivo = opciones.diasActivo ?? Math.max(0, Math.round(entre(0, 30)));
  const convirtio = opciones.convirtio ?? Math.random() < a.conversion;
  const esMobile = opciones.esMobile ?? Math.random() < 0.4;
  const primeraSesion = new Date(ahora.getTime() - diasActivo * 86400000);

  return {
    _id: `${siteId}_${userId}`,
    fechaInicio: primeraSesion,
    is_mobile: esMobile,
    referrerOriginal: elegir(ORIGENES),
    siteId,
    totalSesiones,
    ultimaConexion: ahora,
    userId,
    metricas: {
      totalSesiones,
      duracionPromedio: opciones.duracion ?? Number(a.duracion().toFixed(4)),
      tasaRebote: opciones.rebote ?? Number(a.rebote().toFixed(4)),
      paginasPorSesionPromedio: opciones.paginas ?? a.paginas(),
      tasaConversion: convirtio ? Number(entre(0.1, 0.6).toFixed(4)) : 0,
      usuarioMobile: esMobile,
      primeraSesion,
      ultimaSesion: ahora,
      diasActivo,
      frecuenciaRecurrencia: opciones.recurrencia ?? Number(a.recurrencia().toFixed(4)),
      tasaAbandonoCarrito: Number(entre(0, 0.4).toFixed(4)),
      origenPredominante: elegir(ORIGENES),
      interaccionesPromedio: opciones.interacciones ?? Number(a.interacciones().toFixed(2)),
      tiempoHastaConversion:
        opciones.tiempo !== undefined
          ? opciones.tiempo
          : convirtio ? Math.round(a.tiempo()) : null
    }
  };
}

function grupo(siteId, cantidad, tipo, opciones = {}) {
  return Array.from({ length: cantidad }, () =>
    crearUsuario(siteId, tipo, opciones)
  );
}

function insertar(siteId, usuarios) {
  db.usuarios.deleteMany({ siteId });
  db.usuarios.insertMany(usuarios);
  print(`${siteId} -> ${usuarios.length} usuarios`);
}

//------------------------------------------------------------CASOS DE PRUEBA PLANTEADOS

/* 1. K automático: 15 focalizados + 15 exploradores. */
insertar("sint-k-auto", [
  ...grupo("sint-k-auto", 15, "focalizado"),
  ...grupo("sint-k-auto", 15, "explorador")
]);

/* 2. K explícito: mismo tipo de conjunto, usando k=3. */
insertar("sint-k-explicito", [
  ...grupo("sint-k-explicito", 15, "focalizado"),
  ...grupo("sint-k-explicito", 15, "explorador")
]);

/* 3. k mayor que la cantidad de usuarios: 3 usuarios. */
insertar("sint-k-mayor", grupo("sint-k-mayor", 3, "focalizado"));

/* 4. Ningún usuario convirtió: tiempoHastaConversion será null. */
insertar("sint-sin-conversion", [
  ...grupo("sint-sin-conversion", 15, "focalizado", { convirtio: false, tiempo: null }),
  ...grupo("sint-sin-conversion", 15, "explorador", { convirtio: false, tiempo: null })
]);

/* 5. Un usuario con una métrica numérica faltante. */
const faltante = [
  ...grupo("sint-metrica-faltante", 15, "focalizado"),
  ...grupo("sint-metrica-faltante", 15, "explorador")
];
faltante[0].metricas.paginasPorSesionPromedio = null;
insertar("sint-metrica-faltante", faltante);

/* 6. Silhouette insuficiente: valores sin separación clara. */
const bajo = [];
for (let i = 0; i < 30; i++) {
  bajo.push(crearUsuario("sint-silhouette-bajo", "focalizado", {
    paginas: 4 + Math.round(entre(0, 2)),
    duracion: entre(2, 4),
    rebote: entre(0.2, 0.4),
    interacciones: entre(4, 7),
    recurrencia: entre(0.5, 1),
    diasActivo: Math.round(entre(10, 20)),
    convirtio: i % 2 === 0,
    tiempo: i % 2 === 0 ? Math.round(entre(60000, 180000)) : null
  }));
}
insertar("sint-silhouette-bajo", bajo);

/* 7. Silhouette suficiente: dos grupos claramente diferenciados. */
insertar("sint-silhouette-alto", [
  ...grupo("sint-silhouette-alto", 15, "focalizado"),
  ...grupo("sint-silhouette-alto", 15, "explorador")
]);

/* 8. Valores muy diferentes para probar log1p. */
const log = [];
for (let i = 0; i < 10; i++) {
  log.push(crearUsuario("sint-log", "focalizado", {
    paginas: Math.pow(10, i),
    duracion: Math.pow(10, i),
    interacciones: Math.pow(10, i),
    convirtio: true,
    tiempo: 60000
  }));
}
insertar("sint-log", log);

/* 9. Ceros en las tres variables transformadas con log1p. */
insertar("sint-log-ceros",
  grupo("sint-log-ceros", 10, "focalizado", {
    paginas: 0,
    duracion: 0,
    interacciones: 0,
    convirtio: false,
    tiempo: null
  })
);

/* 10. Pocos usuarios para limitar k_max: len(X)-1 = 2. */
insertar("sint-pocos", grupo("sint-pocos", 3, "focalizado"));

/* 11. Menos usuarios que k_min: 1 usuario. */
insertar("sint-minimo", grupo("sint-minimo", 1, "focalizado"));


/* 13. Perfiles: comprobar suma de cantidadUsuarios. */
insertar("sint-perfiles", [
  ...grupo("sint-perfiles", 15, "focalizado"),
  ...grupo("sint-perfiles", 15, "explorador")
]);

/* 14. Búsqueda automática entre k=2 y k=5. */
insertar("sint-busqueda-k", [
  ...grupo("sint-busqueda-k", 15, "focalizado"),
  ...grupo("sint-busqueda-k", 15, "explorador")
]);

/* 15. Selección del mejor K mediante scoresPorK. */
insertar("sint-mejor-k", [
  ...grupo("sint-mejor-k", 15, "focalizado"),
  ...grupo("sint-mejor-k", 15, "explorador")
]);

//16. Columna faltante: eliminarla después al construir el DataFrame. //
insertar("sint-columna", [
  ...grupo("sint-columna", 15, "focalizado"),
  ...grupo("sint-columna", 15, "explorador")
]);

// 17. Caso límite: dataset específico para estudiar silhouette alrededor de 0.25.//
const limite = [];
for (let i = 0; i < 10; i++) {
  const x = i < 5 ? i / 20 : 0.5 + i / 20;
  limite.push(crearUsuario("sint-silhouette-025", "focalizado", {
    paginas: x,
    duracion: x,
    rebote: x,
    interacciones: x,
    recurrencia: x,
    tiempo: x * 1000,
    convirtio: true
  }));
}
insertar("sint-silhouette-025", limite);

print("Usuarios sintéticos generados correctamente.");