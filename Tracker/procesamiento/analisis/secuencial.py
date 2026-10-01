import math
from prefixspan import PrefixSpan
from urllib.parse import urlparse, parse_qs
from collections import defaultdict

#funcioncita auxiliar para normalizar las url
def normalizar_pagina(url): 
    parsed = urlparse(url) #esto le saca el dominio
    path = parsed.path.rstrip("/").lower() #pasamos todo a minuscula, por las dudas
    query = parse_qs(parsed.query)
    if query:
        query_ordenada = "&".join(f"{k}={v[0]}" for k, v in sorted(query.items()))
        return f"{path}?{query_ordenada}" #y esto es para ordenar despues en la docu me explayo mas
    return path or "/"

def extraer_secuencia(sesion):
    rutas = sesion.get("rutas", []) #extraemos las rutas dentro de sesiones
    rutas_ordenadas = sorted(rutas, key=lambda r: r["timestamp"]) #las ordenamos por timestamp
    secuencia = [normalizar_pagina(r["pagina"]) for r in rutas_ordenadas]
    return [p for i, p in enumerate(secuencia) if i == 0 or p != secuencia[i - 1]]   #y las normalizamos

def prefix(sesiones, soporte_minimo=0.05, longitud_minima=3, top=4):
    sesiones = sesiones.to_dict("records") 
    secuencias_por_sitio = defaultdict(list) #lista vacia en donde voy a ingresar los patrones
    for sesion in sesiones:
        secuencia = extraer_secuencia(sesion) #extraemos las secuencias de rutas
        if secuencia:
            secuencias_por_sitio[sesion["siteId"]].append(secuencia) #y la chantamos en la lista

    resultados_por_sitio = {} #vector de resultados
    for site_id, secuencias in secuencias_por_sitio.items(): #por cada item
        total = len(secuencias) #longitud
        minimo = max(2, math.ceil(round(soporte_minimo * total, 6))) #aca proporciono el soporte minimo, o sea, que aparezca en minimo un X porcentaje de las sesiones, con 6 decimales
        ps = PrefixSpan(secuencias) #hacemos prefixspan sobre la secuencia
        resultados = ps.frequent(minimo, closed=True) #al resultado de las mos mas frecuentes que pasen el minimo, el closed es para que se quede con la mayor en donde aparece X secuencia
        filtrados = [(s, round(s / total, 4), p) for s, p in resultados if len(p) >= longitud_minima] # y esto es para filtrar por los parametros anteriores de longitud minima y soporte minimo
        filtrados.sort(key=lambda x: (-x[0], -len(x[2]))) #los ordenamos mayor a menor
        resultados_por_sitio[site_id] = filtrados[:top] #y los chanto al tope de la lista
    return resultados_por_sitio