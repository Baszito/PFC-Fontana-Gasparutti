db = db.getSiblingDB("PruebaBBDD");

const siteId = "site-sint-rf";
const base = "http://localhost:3000";

const paginas = {
  H: base + "/",
  L: base + "/listado.html",
  PA: base + "/producto.html?producto=monitor-24",
  PB: base + "/producto.html?producto=teclado-x",
  PC: base + "/producto.html?producto=mouse-gamer",
  CARRITO: base + "/carrito.html",
  R: base + "/registro.html",
  K: base + "/checkout.html"
};

function entre(min, max) { return min + Math.random() * (max - min); }
function elegir(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

// Caminos posibles por arquetipo, con su probabilidad relativa (peso)
const CAMINOS = {
  focalizado: [
    { peso: 45, pasos: ["H", "PA", "CARRITO", "K"], carrito: true, compra: true },
    { peso: 20, pasos: ["H", "PA", "CARRITO"], carrito: true, compra: false },
    { peso: 15, pasos: ["H", "R"], carrito: false, compra: false },
    { peso: 10, pasos: ["H"], carrito: false, compra: false },
    { peso: 10, pasos: ["H", "L", "PB"], carrito: false, compra: false },
  ],
  explorador: [
    { peso: 10, pasos: ["H", "L", "PA", "CARRITO", "K"], carrito: true, compra: true },
    { peso: 35, pasos: ["H", "L", "PA", "PB", "CARRITO"], carrito: true, compra: false },
    { peso: 20, pasos: ["H", "L", "PA", "PB", "PC"], carrito: false, compra: false },
    { peso: 15, pasos: ["H", "R"], carrito: false, compra: false },
    { peso: 10, pasos: ["H", "L"], carrito: false, compra: false },
    { peso: 10, pasos: ["H", "L", "PA", "L", "PB"], carrito: false, compra: false },
  ],
};

function elegirCamino(tipo) {
  const opciones = CAMINOS[tipo];
  const totalPeso = opciones.reduce((s, o) => s + o.peso, 0);
  let r = Math.random() * totalPeso;
  for (const o of opciones) {
    if (r < o.peso) return o;
    r -= o.peso;
  }
  return opciones[opciones.length - 1];
}

const usuarios = db.usuarios.find({ siteId }).toArray();

let contador = 0;
let sesiones = [];
const t0 = new Date("2026-09-01T03:00:00.000Z");

usuarios.forEach(usuario => {
  const probabilidadMobileSesion = usuario.is_mobile ? 0.8 : 0.2;

  for (let s = 0; s < usuario.totalSesiones; s++) {
    contador++;
    const numero = String(contador).padStart(4, "0");
    const camino = elegirCamino(usuario.arquetipo);
    const duracionPorPaginaSeg = usuario.arquetipo === "focalizado" ? entre(15, 45) : entre(30, 90);

    const inicio = new Date(t0.getTime() + contador * 15 * 60 * 1000 + Math.floor(entre(0, 5)) * 24 * 60 * 60 * 1000);

    const rutas = camino.pasos.map((p, j) => ({
      pagina: paginas[p],
      timestamp: new Date(inicio.getTime() + j * duracionPorPaginaSeg * 1000)
    }));

    const ultimoTs = rutas[rutas.length - 1].timestamp;
    const fin = new Date(ultimoTs.getTime() + entre(10, 60) * 1000);

    const eventosClave = [];
    if (camino.carrito) {
      // momento de "añadir al carrito": el timestamp de la ruta CARRITO
      const rutaCarrito = rutas[camino.pasos.indexOf("CARRITO")];
      eventosClave.push({ tipo: "objetivo", subtipo: "añadir_carrito", timestamp: rutaCarrito.timestamp });
    }
    if (camino.compra) {
      eventosClave.push({ tipo: "objetivo", subtipo: "compra", timestamp: fin });
    }
    // diversidad extra para Apriori: a veces hay contacto/suscripción, sin relación al carrito
    if (Math.random() < 0.08) {
      eventosClave.push({ tipo: "objetivo", subtipo: "contacto", timestamp: ultimoTs });
    }

    sesiones.push({
      sessionId: "sintrf-" + numero,
      siteId,
      userId: usuario.userId,
      inicio,
      Fin: fin,
      revisado: new Date(fin.getTime() + 60 * 1000),
      is_mobile: Math.random() < probabilidadMobileSesion,
      referrer: usuario.referrerOriginal,
      geo: { pais: "Argentina", provincia: "Santa Fe", ciudad: "Santa Fe" },
      rutas,
      eventosClave,
      paginaInicio: rutas[0].pagina,
      paginaAbandono: rutas[rutas.length - 1].pagina,
      duracionSesion: (fin - inicio) / (1000 * 60),
      esRebote: eventosClave.length === 0 && rutas.length === 1
    });
  }
});

db.sesiones.deleteMany({ siteId });
const resultado = db.sesiones.insertMany(sesiones);
print("Sesiones sintéticas (RF) insertadas: " + Object.keys(resultado.insertedIds).length);