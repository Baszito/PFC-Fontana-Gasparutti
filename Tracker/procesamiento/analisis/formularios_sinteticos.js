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

const sesiones = db.sesiones.find({ sessionId: /^sint-/ }).toArray();
let formularios = [];

sesiones.forEach(sesion => {
  const rutas = sesion.rutas || [];

  rutas.forEach((ruta, idx) => {
    const info = detectarFormulario(ruta.pagina);
    if (!info) return;

    const siguienteTs = idx < rutas.length - 1 ? rutas[idx + 1].timestamp : sesion.Fin;
    const inicioForm = ruta.timestamp;
    const tiempoDisponibleMs = Math.max(5000, siguienteTs - inicioForm);

    const completado = Math.random() < 0.65; // 65% lo completa
    const cantidadCamposCompletados = completado
      ? info.campos.length
      : Math.max(1, Math.floor(entre(1, info.campos.length))); // abandona en un punto intermedio

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
      completado: completado,
      camposInteractuados: camposInteractuados,
      ultimoCampoCompletado: completado ? null : info.campos[cantidadCamposCompletados - 1],
      revisado: new Date((finForm ? finForm.getTime() : tAcumulado) + 60000)
    });
  });
});

db.formularios.deleteMany({ sessionId: /^sint-/ });
const resultado = db.formularios.insertMany(formularios);
print("Formularios sintéticos insertados: " + Object.keys(resultado.insertedIds).length);