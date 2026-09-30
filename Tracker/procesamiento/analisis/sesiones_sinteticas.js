db = db.getSiblingDB("PruebaBBDD");

const base = "http://localhost:3000";
const paginas = {
  H: base + "/",
  R: base + "/registro.html",
  L: base + "/listado.html",
  PA: base + "/producto.html?producto=monitor-24",
  PB: base + "/producto.html?producto=teclado-x",
  C: base + "/carrito.html",
  K: base + "/checkout.html"
};

const siteA = "6ab5e2c8fbc69f0dd7784056";
const siteB = "site-sint-B";
const t0 = new Date("2026-09-26T03:00:00.000Z");

function crearSesion(n, siteId, pasos) {
  const numero = String(n).padStart(2, "0");
  const inicio = new Date(t0.getTime() + n * 10 * 60 * 1000);
  const rutas = pasos.map((p, j) => ({
    pagina: paginas[p],
    timestamp: new Date(inicio.getTime() + j * 30 * 1000)
  }));
  const ultimo = rutas[rutas.length - 1].timestamp;
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
    geo: { pais: "Argentina", provincia: "Santa Fe", ciudad: "Santa Fe" },
    rutas: rutas,
    eventosClave: compro ? [{ tipo: "objetivo", subtipo: "compra", timestamp: ultimo }] : [],
    paginaInicio: rutas[0].pagina,
    paginaAbandono: rutas[rutas.length - 1].pagina,
    duracionSesion: (fin - inicio) / (1000 * 60),
    esRebote: !compro
  };
}

const escenarios = [
  ...Array(3).fill([siteA, ["H", "R", "PA", "L", "PB", "C", "K"]]),
  ...Array(2).fill([siteA, ["H", "R", "PA"]]),
  ...Array(2).fill([siteA, ["H", "L", "PB", "C", "K"]]),
  ...Array(3).fill([siteA, ["H", "H", "R"]]),
  ...Array(2).fill([siteB, ["H", "R"]])
];

db.sesiones.deleteMany({ sessionId: /^sint-/ });
const resultado = db.sesiones.insertMany(
  escenarios.map(([site, pasos], i) => crearSesion(i + 1, site, pasos))
);
print("Sesiones sintéticas insertadas: " + Object.keys(resultado.insertedIds).length);