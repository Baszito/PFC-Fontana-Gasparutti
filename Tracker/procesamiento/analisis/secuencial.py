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

def prefix(sesiones, soporte_minimo=0.05, longitud_minima=3, top=10):
    sesiones = sesiones.to_dict("records")
    secuencias_por_sitio = defaultdict(list)
    for sesion in sesiones:
        secuencia = extraer_secuencia(sesion)
        if secuencia:
            secuencias_por_sitio[sesion["siteId"]].append(secuencia)

    resultados_por_sitio = {}
    for site_id, secuencias in secuencias_por_sitio.items():
        total = len(secuencias)
        minimo = max(2, math.ceil(round(soporte_minimo * total, 6)))
        ps = PrefixSpan(secuencias)
        resultados = ps.frequent(minimo, closed=True)
        filtrados = [(s, round(s / total, 4), p) for s, p in resultados if len(p) >= longitud_minima]
        filtrados.sort(key=lambda x: (-x[0], -len(x[2])))
        resultados_por_sitio[site_id] = filtrados[:top]
    return resultados_por_sitio