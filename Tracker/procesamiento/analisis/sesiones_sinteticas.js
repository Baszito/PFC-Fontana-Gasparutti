db = db.getSiblingDB("PruebaBBDD");

const base = "http://localhost:3000";
const paginas = {
  H: base + "/",
  R: base + "/registro.html",
  L: base + "/listado.html",
  C: base + "/carrito.html",
  K: base + "/checkout.html",
  LOGIN: base + "/login.html",
  H2: base + "/home-logueado.html",
  PA: base + "/producto.html?producto=monitor-24",
  PB: base + "/producto.html?producto=teclado-x"
};

const siteA = "6ab5e2c8fbc69f0dd7784056";
const siteB = "site-sint-B";
const t0 = new Date("2026-09-20T03:00:00.000Z");

function crearSesion(n, siteId, pasos, opciones = {}) {
  const numero = String(n).padStart(3, "0");
  const inicio = new Date(t0.getTime() + n * 10 * 60 * 1000);

  const cronologicas = pasos.map((p, j) => ({
    pagina: paginas[p] || p,
    timestamp: new Date(inicio.getTime() + j * 30 * 1000)
  }));

  const hayRutas = cronologicas.length > 0;
  const ultimo = hayRutas
    ? cronologicas[cronologicas.length - 1].timestamp
    : inicio;

  const fin = new Date(ultimo.getTime() + 2 * 60 * 1000);
  const compro = pasos.includes("K");

  return {
    sessionId: "sint-" + numero,
    siteId: siteId,
    userId: "user-sint-" + numero,
    inicio: inicio,
    Fin: fin,
    revisado: new Date(fin.getTime() + 60 * 1000),
    is_mobile: false,
    referrer: "directa",
    geo: {
      pais: "Argentina",
      provincia: "Santa Fe",
      ciudad: "Santa Fe"
    },
    rutas: opciones.invertir
      ? [...cronologicas].reverse()
      : cronologicas,
    eventosClave: compro
      ? [{
          tipo: "objetivo",
          subtipo: "compra",
          timestamp: ultimo
        }]
      : [],
    paginaInicio: hayRutas ? cronologicas[0].pagina : null,
    paginaAbandono: hayRutas
      ? cronologicas[cronologicas.length - 1].pagina
      : null,
    duracionSesion: (fin - inicio) / (1000 * 60),
    esRebote: !compro
  };
}

function grupo(cantidad, siteId, pasos, opciones = {}) {
  return Array.from(
    { length: cantidad },
    () => ({
      siteId,
      pasos,
      opciones
    })
  );
}

const escenarios = [

  // --- Patrones debajo del soporte ---
  // Cada patrón aparece solamente una vez.
  ...grupo(1, "site-sint-soporte", ["H", "R", "PA"]),
  ...grupo(1, "site-sint-soporte", ["H", "L", "PB"]),
  ...grupo(1, "site-sint-soporte", ["H", "C", "K"]),

  // --- Patrón frecuente debajo de la longitud ---
  // Patrón [H,R] frecuente, pero con longitud menor a 3.
  ...grupo(5, "site-sint-longitud", ["H", "R"]),
  ...grupo(1, "site-sint-longitud", ["L", "PB", "C"]),

  // --- Patrón frecuente ---
  // [H,R,PA] aparece en múltiples sesiones.
  ...grupo(5, "site-sint-frecuente", ["H", "R", "PA"]),
  ...grupo(1, "site-sint-frecuente", ["H", "L", "PB"]),

  // --- Múltiples patrones frecuentes ---
  // [H,R,PA] y [H,C,K] aparecen varias veces.
  ...grupo(5, "site-sint-multiples", ["H", "R", "PA"]),
  ...grupo(5, "site-sint-multiples", ["H", "C", "K"]),
  ...grupo(1, "site-sint-multiples", ["H", "L", "PB"]),

  // --- Patrones cerrados ---
  // Se generan secuencias con extensiones frecuentes para verificar
  // que solamente se conserven los patrones cerrados.
  ...grupo(5, "site-sint-closed", ["H", "R", "PA"]),
  ...grupo(5, "site-sint-closed", ["H", "R", "PA", "C"]),
  ...grupo(5, "site-sint-closed", ["H", "R", "PA", "C", "K"]),

  // --- Recargas de página ---
  // La segunda H representa una recarga.
  ...grupo(5, "site-sint-recarga", ["H", "H", "R", "PA"]),

  // --- Aislamiento entre sitios ---
  // El mismo patrón aparece en dos sitios diferentes.
  ...grupo(5, siteA, ["H", "R", "PA"]),
  ...grupo(5, siteB, ["H", "R", "PA"]),

  // --- Normalización de URL ---
  // Las tres sesiones representan home -> registro -> producto
  // utilizando distintas formas de escribir las URLs.
  ...grupo(1, "site-sint-norm", [
    base + "/",
    base + "/Registro.html/",
    base + "/producto.html?producto=monitor-24"
  ]),
  ...grupo(1, "site-sint-norm", [
    "HTTP://LOCALHOST:3000",
    base + "/registro.html",
    base + "/producto.html?producto=monitor-24"
  ]),
  ...grupo(1, "site-sint-norm", [
    "https://otro-dominio.com/",
    "https://otro-dominio.com/registro.html",
    "https://otro-dominio.com/producto.html?producto=monitor-24"
  ]),

  // --- Orden de parámetros de query ---
  // Las dos URLs representan el mismo recurso con distinto orden
  // de parámetros.
  ...grupo(1, "site-sint-query", [
    "H",
    base + "/producto.html?producto=monitor&color=rojo",
    "C"
  ]),
  ...grupo(1, "site-sint-query", [
    "H",
    base + "/producto.html?color=rojo&producto=monitor",
    "C"
  ]),

  // --- Orden cronológico de rutas ---
  // Las rutas se almacenan en orden inverso, pero los timestamps
  // mantienen el orden cronológico real.
  ...grupo(2, "site-sint-orden", [
    "H",
    "LOGIN",
    "H2"
  ], { invertir: true }),

  // --- Umbral proporcional (10%) ---
  // 50 sesiones:
  // [H,LOGIN,H2] -> soporte 3 >= 5%
  // [H,C,K]      -> soporte 2 < 5%
  // [H]          -> 45 sesiones
  ...grupo(5, "site-sint-umbral50", ["H", "LOGIN", "H2","C","K"]),
  ...grupo(45, "site-sint-umbral50", ["H"]),

  // --- Piso mínimo en sitios chicos ---
  // 40 sesiones:
  // minimo = max(2, ceil(0.05 * 40)) = 2
  //
  // [H,LOGIN,H2] -> soporte 3 -> aparece
  // [H,C,K]      -> soporte 2 -> aparece por el piso mínimo
  // [H]          -> 35 sesiones
  ...grupo(3, "site-sint-umbral40", ["H", "LOGIN", "H2"]),
  ...grupo(2, "site-sint-umbral40", ["H", "C", "K"]),
  ...grupo(35, "site-sint-umbral40", ["H"]),

  // --- Límite de patrones (top) ---
  // Sitio con varios patrones frecuentes para comprobar prefix(..., top=2).
  ...grupo(5, "site-sint-top", ["H", "R", "PA"]),
  ...grupo(5, "site-sint-top", ["H", "C", "K"]),
  ...grupo(5, "site-sint-top", ["H", "L", "PB"]),
  ...grupo(5, "site-sint-top", ["H", "LOGIN", "H2"]),
  ...grupo(5, "site-sint-top", ["H", "LOGIN", "C","K"]),
  ...grupo(6, "site-sint-top", ["H", "LOGIN", "H2","K","PB"])
];

db.sesiones.deleteMany({
  sessionId: /^sint-/
});

const resultado = db.sesiones.insertMany(
  escenarios.map((e, i) =>
    crearSesion(
      i + 1,
      e.siteId,
      e.pasos,
      e.opciones
    )
  )
);

print(
  "Sesiones sintéticas insertadas: " +
  Object.keys(resultado.insertedIds).length
);