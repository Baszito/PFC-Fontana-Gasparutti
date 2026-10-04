db = db.getSiblingDB("PruebaBBDD");

const base = "http://localhost:3000";
const PAG = {
  H: base + "/", L: base + "/listado.html", PA: base + "/producto.html?producto=monitor-24",
  PB: base + "/producto.html?producto=teclado-x", PROMO: base + "/promo.html", OFERTA: base + "/oferta.html",
  CARRITO: base + "/carrito.html", K: base + "/checkout.html"
};

let contador = 0;
function crearSesion(siteId, pasos, eventosClave = [], tOffsetMin = 0) {
  contador++;
  const inicio = new Date(Date.UTC(2026, 9, 1, 3, 0, 0) + contador * 5 * 60 * 1000 + tOffsetMin * 60000);
  const rutas = pasos.map((p, j) => ({ pagina: PAG[p], timestamp: new Date(inicio.getTime() + j * 30000) }));
  const ultimo = rutas.length ? rutas[rutas.length - 1].timestamp : inicio;
  const fin = new Date(ultimo.getTime() + 60000);

  return {
    sessionId: "apr-" + String(contador).padStart(4, "0"),
    siteId, userId: "u-apr-" + contador,
    inicio, Fin: fin, revisado: new Date(fin.getTime() + 60000),
    is_mobile: false, referrer: "directa",
    geo: { pais: "Argentina", provincia: "Santa Fe", ciudad: "Santa Fe" },
    rutas, eventosClave,
    paginaInicio: rutas[0]?.pagina || null,
    paginaAbandono: rutas[rutas.length - 1]?.pagina || null,
    duracionSesion: (fin - inicio) / (1000 * 60),
    esRebote: eventosClave.length === 0
  };
}

let sesiones = [];

// --- AP-1: itemset por debajo del soporte mínimo ---
// {/promo, /oferta} debería tener soporte 1/51 ≈ 0.02, por debajo de min_support=0.05
// sesiones.push(crearSesion("site-ap-soporte", ["PROMO", "OFERTA"]));
// for (let i = 0; i < 50; i++) sesiones.push(crearSesion("site-ap-soporte", ["H"]));

// --- AP-2: itemset frecuente simple ---
// {/home, /productos} debería tener soporte 10/20 = 0.5
// for (let i = 0; i < 10; i++) sesiones.push(crearSesion("site-ap-frecuente", ["H", "PA"]));
// for (let i = 0; i < 10; i++) sesiones.push(crearSesion("site-ap-frecuente", ["H", "L"]));

// --- AP-3: confianza y lift controlados ---
// 10 sesiones con añadir_carrito, 8 de ellas también compra -> confianza(añadir_carrito->compra)=0.8
// 10 sesiones sin ninguno de los dos eventos
// for (let i = 0; i < 8; i++) {
//   sesiones.push(crearSesion("site-ap-confianza", ["H", "PA", "CARRITO", "K"], [
//     { tipo: "objetivo", subtipo: "añadir_carrito", timestamp: new Date() },
//     { tipo: "objetivo", subtipo: "compra", timestamp: new Date() }
//   ]));
// }
// for (let i = 0; i < 2; i++) {
//   sesiones.push(crearSesion("site-ap-confianza", ["H", "PA", "CARRITO"], [
//     { tipo: "objetivo", subtipo: "añadir_carrito", timestamp: new Date() }
//   ]));
// }
// for (let i = 0; i < 10; i++) sesiones.push(crearSesion("site-ap-confianza", ["H", "L"]));

// --- AP-4: aislamiento entre sitios (mismo patrón, proporciones distintas) ---
// for (let i = 0; i < 8; i++) sesiones.push(crearSesion("site-ap-aisla-A", ["H", "PA", "K"]));
// for (let i = 0; i < 2; i++) sesiones.push(crearSesion("site-ap-aisla-A", ["H"]));
// for (let i = 0; i < 2; i++) sesiones.push(crearSesion("site-ap-aisla-B", ["H", "PA", "K"]));
// for (let i = 0; i < 8; i++) sesiones.push(crearSesion("site-ap-aisla-B", ["H"]));

// --- AP-5: sesión sin rutas ni eventosClave ---
// sesiones.push(crearSesion("site-ap-vacio", [], []));
// for (let i = 0; i < 10; i++) sesiones.push(crearSesion("site-ap-vacio", ["H", "L"]));

// --- AP-6: páginas repetidas en la misma sesión (recarga) ---
// La ruta visita /home tres veces: el itemset debe contar /home una sola vez
// sesiones.push(crearSesion("site-ap-recargas", ["H", "H", "H", "PA"]));
// for (let i = 0; i < 9; i++) sesiones.push(crearSesion("site-ap-recargas", ["H", "PA"]));

// --- AP-7: sin asociación real (lift cercano a 1) ---
// compra ocurre cuando i%2==0 (50%), contacto cuando i%3==0 (~33%), son independientes entre sí
// for (let i = 0; i < 24; i++) {
//   const eventosClave = [];
//   if (i % 2 === 0) eventosClave.push({ tipo: "objetivo", subtipo: "compra", timestamp: new Date() });
//   if (i % 3 === 0) eventosClave.push({ tipo: "objetivo", subtipo: "contacto", timestamp: new Date() });
//   sesiones.push(crearSesion("site-ap-norelacion", ["H", "L"], eventosClave));
// }

// --- AP-9: confianza perfecta (1.0) ---
// TODAS las sesiones con compra también tienen añadir_carrito (pero hay añadir_carrito sin compra)
// for (let i = 0; i < 6; i++) {
//   sesiones.push(crearSesion("site-ap-perfecta", ["H", "PA", "CARRITO", "K"], [
//     { tipo: "objetivo", subtipo: "añadir_carrito", timestamp: new Date() },
//     { tipo: "objetivo", subtipo: "compra", timestamp: new Date() }
//   ]));
// }
// for (let i = 0; i < 4; i++) {
//   sesiones.push(crearSesion("site-ap-perfecta", ["H", "PA", "CARRITO"], [
//     { tipo: "objetivo", subtipo: "añadir_carrito", timestamp: new Date() }
//   ]));
// }

// AP-8 y AP-10 no requieren datos nuevos:
// AP-8 -> ejecutar Apriori sobre un siteId que no se haya insertado nunca (ej. "site-ap-inexistente")
// AP-10 -> correr guardar_resultados_apriori() sobre el resultado de cualquiera de estos sitios

db.sesiones.deleteMany({ sessionId: /^apr-/ });
const resultado = db.sesiones.insertMany(sesiones);
print("Sesiones sintéticas (Apriori) insertadas: " + Object.keys(resultado.insertedIds).length);