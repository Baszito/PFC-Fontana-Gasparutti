db = db.getSiblingDB("PruebaBBDD");

function entre(min, max) { return min + Math.random() * (max - min); }

const CAMPOS_REGISTRO = ["nombre", "email", "password", "telefono"];
const CAMPOS_CHECKOUT = ["direccion", "ciudad", "codigoPostal", "metodoPago"];

function detectarFormulario(pagina) {
  const p = pagina.toLowerCase();
  if (p.includes("registro")) return { id_formulario: "form_registro", campos: CAMPOS_REGISTRO };
  if (p.includes("checkout")) return { id_formulario: "form_checkout", campos: CAMPOS_CHECKOUT };
  return null;
}

const PROB_COMPLETAR = { focalizado: 0.8, explorador: 0.4 };

const sesiones = db.sesiones.find({ sessionId: /^sintrf-/ }).toArray();
const usuariosPorId = {};
db.usuarios.find({ siteId: "site-sint-rf" }).forEach(u => { usuariosPorId[u.userId] = u; });

let formularios = [];

sesiones.forEach(sesion => {
  const rutas = sesion.rutas || [];
  const arquetipo = (usuariosPorId[sesion.userId] || {}).arquetipo || "explorador";

  rutas.forEach((ruta, idx) => {
    const info = detectarFormulario(ruta.pagina);
    if (!info) return;

    const siguienteTs = idx < rutas.length - 1 ? rutas[idx + 1].timestamp : sesion.Fin;
    const inicioForm = ruta.timestamp;
    const tiempoDisponibleMs = Math.max(5000, siguienteTs - inicioForm);

    // El formulario de checkout, si llegó hasta ahí habiendo comprado, siempre se completa
    // (coherencia con el evento "compra" generado en sesiones_sinteticas_rf.js)
    const compro = (sesion.eventosClave || []).some(e => e.subtipo === "compra");
    const completado = info.id_formulario === "form_checkout" && compro
      ? true
      : Math.random() < PROB_COMPLETAR[arquetipo];

    const cantidadCamposCompletados = completado
      ? info.campos.length
      : Math.max(1, Math.floor(entre(1, info.campos.length)));

    let tAcumulado = inicioForm.getTime();
    const camposInteractuados = [];
    for (let i = 0; i < cantidadCamposCompletados; i++) {
      tAcumulado += entre(2000, tiempoDisponibleMs / info.campos.length);
      camposInteractuados.push({ campo: info.campos[i], timestamp: new Date(tAcumulado) });
    }

    const finForm = completado ? new Date(tAcumulado + entre(1000, 5000)) : null;

    formularios.push({
      siteId: sesion.siteId,
      sessionId: sesion.sessionId,
      userId: sesion.userId,
      id_formulario: info.id_formulario,
      Inicio: inicioForm,
      Fin: finForm,
      completado,
      camposInteractuados,
      ultimoCampoCompletado: completado ? null : info.campos[cantidadCamposCompletados - 1],
      revisado: new Date((finForm ? finForm.getTime() : tAcumulado) + 60000)
    });
  });
});

db.formularios.deleteMany({ sessionId: /^sintrf-/ });
const resultado = db.formularios.insertMany(formularios);
print("Formularios sintéticos (RF) insertados: " + Object.keys(resultado.insertedIds).length);