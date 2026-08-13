/* ====================================================================================================================
                                            SCRIPT DE TRACKEO
====================================================================================================================*/

/* ==========================================================
   cookie de consentimiento
   ========================================================== */
   
const scriptTag = document.currentScript;
let consentimiento = localStorage.getItem("consentimiento")
if (consentimiento == "true"){
    iniciarTracking();
}else if(consentimiento == null){
    generarBanner();
}

function generarBanner(){
    // div del banner
    let banner = document.createElement("div");
    banner.id = "cookie-banner";
    banner.style.cssText = "position: fixed; bottom: 0; left: 0; width: 100%; background: #222; color: #fff; padding: 15px; text-align: center; z-index: 9999;";

    // texto del banner
    let texto = document.createElement("p");
    texto.textContent = "Este sitio utiliza cookies para analizar y mejorar tu experiencia. Puedes aceptar o rechazar su uso."; // TODO: tu mensaje de consentimiento

    // boton de aceptar
    let btnAceptar = document.createElement("button");
    btnAceptar.textContent = "Aceptar";
    btnAceptar.addEventListener("click", function(){
        localStorage.setItem("consentimiento", "true");
        banner.remove();
        iniciarTracking();
    });

    // botón rechazar
    let btnRechazar = document.createElement("button");
    btnRechazar.textContent = "Rechazar";
    btnRechazar.addEventListener("click", function(){
        localStorage.setItem("consentimiento", "false");
        banner.remove();

    });

    // lo agrego al html original
    banner.appendChild(texto);
    banner.appendChild(btnAceptar);
    banner.appendChild(btnRechazar);
    document.body.appendChild(banner);
}


function iniciarTracking(){
/* ==========================================================
   ID DE SESION (de la sesion)
   ========================================================== */
let id_sesion = sessionStorage.getItem("id_sesion")
if (id_sesion == null){
     id_sesion = crypto.randomUUID();
     sessionStorage.setItem("id_sesion",id_sesion);
    };

/* ==========================================================
   ID persistente (del usuario)
   ========================================================== */
let id_persistente = localStorage.getItem("id_persistente")
if (id_persistente == null){
     id_persistente = crypto.randomUUID();
     localStorage.setItem("id_persistente",id_persistente);
}
const site_id = scriptTag.dataset.siteId;

/* ==========================================================
   DATA STRUCTURE
   ========================================================== */
let eventos_batch = []

/* ==========================================================
   TIEMPO DE SESION (calculo del tiempo total de la sesion)
   ========================================================== */
let session_start = sessionStorage.getItem("session_start");
if (session_start == null){
    session_start = Date.now();
    sessionStorage.setItem("session_start", session_start);
} else {
    session_start = Number(session_start);
}

/* ==========================================================
   PAGEVIEW + URL 
   ========================================================== */
const url = window.location.href;
const pageview ={
    tipo_evento:"pageview",
    timestamp: Date.now(),
    data: {url: url}
};
eventos_batch.push(pageview)

/* ===================================================================================
   CLICKS 
   ========================================================== */
let page = document;
const tagsInteractivos = ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL"];

page.addEventListener("click", function(event) {
    let esInteractivo = tagsInteractivos.includes(event.target.tagName);
    let click;

    if (event.target.dataset.goal != null) {
        click = {
            tipo_evento: "objetivo",
            sub_tipo: event.target.dataset.goal,
            timestamp: Date.now(),
            data: {
                element: event.target.id,
                url: url,
                esInteractivo: esInteractivo
            }
        };
    } else {
        click = {
            tipo_evento: "click",
            timestamp: Date.now(),
            data: {
                element: event.target.id,
                url: url,
                esInteractivo: esInteractivo
            }
        };
    }
    eventos_batch.push(click);
});

/* ==========================================================
   SCROLL DEPTH
   ========================================================== */
let scroll_percent = 0;
let max_scroll_depth = 0;
let scroll_tracking = true;

function calcularPageSize() {
    let page_total = (document.body.scrollHeight > document.documentElement.scrollHeight)
        ? document.body.scrollHeight
        : document.documentElement.scrollHeight;
    let page_visible = window.innerHeight;
    return page_total - page_visible;
}

window.addEventListener("scroll", function() {
    if (scroll_tracking) {
        scroll_tracking = false;
        let actual_scroll = window.scrollY;
        let page_size = calcularPageSize(); // recalculado en cada evento, no una sola vez

        if (max_scroll_depth < actual_scroll) {
            max_scroll_depth = actual_scroll;
            let porcentaje_crudo = page_size > 0 ? (max_scroll_depth / page_size) * 100 : 0;
            scroll_percent = Math.min(100, Math.max(0, porcentaje_crudo)); // clamp entre 0 y 100
        }
        setTimeout(() => { scroll_tracking = true }, 100);
    }
});

/* ==========================================================
   HOVER
   ========================================================== */
const objetivos = document.querySelectorAll("[data-goal]");
for (const objetivo of objetivos){
    let hover_enter;
    objetivo.addEventListener("mouseenter", function() {
        hover_enter = Date.now();
    });
    objetivo.addEventListener("mouseleave", function() {
        let hover_total = Date.now() - hover_enter;
        if (hover_total > 500){
        let hover = {
            tipo_evento: "hover",
            timestamp: Date.now(),
            data: {
                duration: hover_total,
                element: objetivo.id,
                goal: objetivo.dataset.goal,
                url: url
            }
        };
        eventos_batch.push(hover);
    }
    });
}

/* ==========================================================
   FORMULARIO (submit + completar fields)
   ========================================================== */
page.addEventListener("submit", function(event) {
    event.preventDefault();
    let exitoso = event.target.checkValidity();
    let submit = {
        tipo_evento: "form_submit",
        timestamp: Date.now(),
        data: {
            formulario: event.target.id,
            exitoso: exitoso,
            url: url
        }
    };
    eventos_batch.push(submit);
});

page.addEventListener("focusin", function(event) {
    if (event.target.form != null) {
        let campo_relleno={
            tipo_evento:"form_field",
            timestamp:Date.now(),
            data:{
                formulario: event.target.form.id,
                campo: event.target.id || event.target.name
            }
        };
        eventos_batch.push(campo_relleno);
    }
});


/* ==========================================================
   DISPOSITIVO
   ========================================================== */
function isMobile() {
    const userAgentCheck = /Mobi|Android/i.test(navigator.userAgent);
    const widthCheck = window.innerWidth <= 768;
    return userAgentCheck || widthCheck;
}
let is_mobile=isMobile();

/* ==========================================================
   REFERRED
   ========================================================== */
let referred = document.referrer;
if (referred == ""){
    referred = "directa";
    }

/* ==========================================================
   DEMOGRAFICA
   (EN EL SERVIDOR tenemos que poner un cron que traduzca
   latitud/longitud a direcciones)
   ========================================================== */
 let demografica = [];
 navigator.geolocation.getCurrentPosition(function(pos){
     demografica = [pos.coords.latitude,pos.coords.longitude];
},function(){
    demografica = [];
});

/* ==========================================================
   ENVIO AL OCULTARSE/NAVEGAR (no implica fin de sesion)
   ========================================================== */

let api_ingesta = "http://localhost:4000";

page.addEventListener("visibilitychange", function(){
    if (page.visibilityState === "hidden") {
        let scroll = {
            tipo_evento:"scroll",
            timestamp:Date.now(),
            url: url,
            data: {scrollDepth: scroll_percent}
        };
        eventos_batch.push(scroll)
        let sesion = {
            siteId:site_id,
            sessionId:id_sesion,
            tiempo_envio:Date.now(),
            userId:id_persistente,
            inicio_sesion:session_start,
            fin_sesion:null,
            is_mobile:is_mobile,
            referrer:referred,
            demografica:demografica,
            eventos:eventos_batch};

        navigator.sendBeacon(
            api_ingesta,
            new Blob([JSON.stringify(sesion)], { type: "application/json" })
        );
        
        eventos_batch = [];
    }
});

/* ==========================================================
   Envio de sesion por TIMEOUT
   ========================================================== */
setInterval(
    async function(){
        if (eventos_batch.length === 0) return;
        let sesion = {
            siteId:site_id,
            sessionId:id_sesion,
            tiempo_envio:Date.now(),
            userId:id_persistente,
            inicio_sesion:session_start,
            fin_sesion:null,
            is_mobile:is_mobile,
            referrer:referred,
            demografica:demografica,
            eventos:eventos_batch};

        try{
            const response = await window.fetch(api_ingesta,{
            method:"POST",
            headers:{"Content-Type": "application/json"},
            body:JSON.stringify(sesion)
        });
        if (!response.ok){
            throw new Error(`Error ! Response status : ${response.status}`);
        };
        const result = await response.json();
        eventos_batch=[];
        }   
        catch(error){
        console.error(error.message);
        }}
    ,30000);

}


