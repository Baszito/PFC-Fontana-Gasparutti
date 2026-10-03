db = db.getSiblingDB("PruebaBBDD");

function entre(min, max) { return min + Math.random() * (max - min); }
function elegir(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

const ELEMENTOS = ["boton_principal", "menu_navegacion", "link_footer", "boton_comprar"];

const sesiones = db.sesiones.find({ sessionId: /^sintrf-/ }).toArray();
let eventos = [];

sesiones.forEach(sesion => {
  const rutas = sesion.rutas || [];
  if (rutas.length === 0) return;

  rutas.forEach((ruta, idx) => {
    const siguienteTs = idx < rutas.length - 1 ? rutas[idx + 1].timestamp : sesion.Fin;
    const ventanaMs = Math.max(1000, siguienteTs - ruta.timestamp);

    eventos.push({
      timestamp: ruta.timestamp,
      revisado: new Date(ruta.timestamp.getTime() + 60000),
      metadata: { siteId: sesion.siteId, sessionId: sesion.sessionId, tipo: "pageview", pagina: ruta.pagina }
    });

    if (Math.random() < 0.8) {
      eventos.push({
        timestamp: new Date(ruta.timestamp.getTime() + entre(1000, ventanaMs * 0.5)),
        revisado: new Date(ruta.timestamp.getTime() + 61000),
        metadata: { siteId: sesion.siteId, sessionId: sesion.sessionId, tipo: "scroll", pagina: ruta.pagina, valor: Number(entre(10, 100).toFixed(1)) }
      });
    }

    const cantidadClicks = Math.floor(entre(0, 4));
    for (let c = 0; c < cantidadClicks; c++) {
      eventos.push({
        timestamp: new Date(ruta.timestamp.getTime() + entre(500, ventanaMs)),
        revisado: new Date(ruta.timestamp.getTime() + 62000),
        metadata: { siteId: sesion.siteId, sessionId: sesion.sessionId, tipo: "click", pagina: ruta.pagina, elemento: elegir(ELEMENTOS), esInteractivo: Math.random() < 0.9 }
      });
    }

    if (Math.random() < 0.1) {
      const elementoRage = elegir(ELEMENTOS);
      const inicioRage = ruta.timestamp.getTime() + entre(500, ventanaMs * 0.7);
      const cantidadRage = Math.floor(entre(3, 6));
      for (let r = 0; r < cantidadRage; r++) {
        eventos.push({
          timestamp: new Date(inicioRage + r * entre(200, 800)),
          revisado: new Date(inicioRage + 63000),
          metadata: { siteId: sesion.siteId, sessionId: sesion.sessionId, tipo: "click", pagina: ruta.pagina, elemento: elementoRage, esInteractivo: true }
        });
      }
    }

    if (/producto|checkout|carrito/i.test(ruta.pagina) && Math.random() < 0.2) {
      eventos.push({
        timestamp: new Date(ruta.timestamp.getTime() + entre(500, ventanaMs)),
        revisado: new Date(ruta.timestamp.getTime() + 64000),
        metadata: { siteId: sesion.siteId, sessionId: sesion.sessionId, tipo: "hover", pagina: ruta.pagina, elemento: "boton_comprar", goal: "conversion", duracion: Math.round(entre(1, 6)) }
      });
    }
  });
});

db.eventos.deleteMany({ "metadata.sessionId": /^sintrf-/ });
const resultado = db.eventos.insertMany(eventos);
print("Eventos sintéticos (RF) insertados: " + Object.keys(resultado.insertedIds).length);