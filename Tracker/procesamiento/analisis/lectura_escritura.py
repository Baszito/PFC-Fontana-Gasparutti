from pymongo import MongoClient
import pandas as pd
from datetime import datetime, timedelta, timezone
from analisis import analisis as analisis
from crontab import CronTab

# =========================
# CONFIGURACIÓN
# =========================

# Parametros de la DB
MONGO_URI = "mongodb://mongo:27017"
DB_NAME = "PruebaBBDD"
ahora = datetime.now(timezone.utc)
hace_30_dias = ahora - timedelta(days=30)

# Parametros de los algoritmos 
soporte_secuencial = 0.10
long_secuencial = 3

k_min = 2
k_max = 5


# =========================
# CONEXIÓN
# =========================

client = MongoClient(MONGO_URI)
db = client[DB_NAME]

print("Conectado a MongoDB")

# =========================
# EXTRACCIÓN DE USUARIOS
# =========================

usuarios = list(
    db["usuarios"].find()
)

df_usuarios = pd.json_normalize(usuarios)

print("\n=== USUARIOS ===")
print(f"Cantidad de registros: {len(df_usuarios)}")
print(f"Cantidad de columnas: {len(df_usuarios.columns)}")

# =========================
# EXTRACCIÓN DE SESIONES
# =========================
filtro_sesiones = {
        "Fin": {"$exists": True},
        "revisado": {"$exists": True},
        "analisis": {"$ne": True}#,
        #"inicio": {"$lte": hace_30_dias}
    }

sesiones = list(
    db["sesiones"].find(filtro_sesiones)
)

if not sesiones:
    print("Sin sesiones nuevas para analizar")

df_sesiones = pd.json_normalize(sesiones)

print("\n=== SESIONES ===")
print(f"Cantidad de registros: {len(df_sesiones)}")
print(f"Cantidad de columnas: {len(df_sesiones.columns)}")

# =========================
# EXTRACCIÓN DE EVENTOS
# =========================
eventos = list(
    db["eventos"].find()
)

df_eventos = pd.json_normalize(eventos)

print("\n=== EVENTOS ===")
print(f"Cantidad de registros: {len(df_eventos)}")
print(f"Cantidad de columnas: {len(df_eventos.columns)}")

# =========================
# EXTRACCIÓN DE FORMULARIOS
# =========================
formularios = list(
    db["formularios"].find()
)

df_formularios = pd.json_normalize(formularios)

print("\n=== FORMULARIOS ===")
print(f"Cantidad de registros: {len(df_formularios)}")
print(f"Cantidad de columnas: {len(df_formularios.columns)}")

# =========================
# Pasamos a analisis
# =========================

patrones_secuenciales, clusters, asociaciones, random_forests = analisis(df_usuarios, df_sesiones, df_eventos, df_formularios, soporte_secuencial,long_secuencial,k_min,k_max)


# =========================
# Escritura
# =========================

def guardar_resultados_apriori(db, asociaciones):
    ahora = datetime.now()
    docs = [
        {"siteId": site_id, "fechaCalculo": ahora, **resultado}
        for site_id, resultado in asociaciones.items()
    ]
    if docs:
        db["analiticas_apriori"].insert_many(docs)
    print(f"Apriori: {len(docs)} documento(s) insertado(s)")


def guardar_resultados_random_forest(db, random_forests):
    ahora = datetime.now()
    docs = []

    for site_id, resultado in random_forests.items():
        if resultado is None:
            continue

        modelos = {}
        for nombre_modelo, valor in resultado.items():
            if valor is None:
                continue
            modelo, reporte = valor
            modelos[nombre_modelo] = reporte

        if modelos:  # solo guardamos el sitio si al menos un modelo entrenó bien
            docs.append({"siteId": site_id, "fechaCalculo": ahora, "modelos": modelos})

    if docs:
        db["analiticas_random_forest"].insert_many(docs)
    print(f"Random Forest: {len(docs)} documento(s) insertado(s)")

#Guardo los datos:
guardar_resultados_apriori(db, asociaciones)
guardar_resultados_random_forest(db, random_forests)


# ========================= SECUENCIAL

# for site_id, resultados in patrones_secuenciales.items():
#         db.analisis_patrones_secuenciales.insert_one({
#             "siteId": site_id,
#             "fechaGeneracion": datetime.now(),
#             "soporteMinimo": soporte_secuencial,
#             "patrones": [{"soporte": s, "proporcion": pr, "secuencia": p} for s, pr, p in resultados]
#         })


# for site_id, resultado in clusters.items():
#     # Si el sitio devolvió False o None (ej. no hubo suficientes usuarios o bajo silhouette)
#     if not resultado:
#         print(f"Saltando escritura de clusters para el sitio {site_id} (sin resultados válidos)")
#         continue
#     db.analisis_clusters.insert_one({
#         "siteId": site_id,
#         "fechaGeneracion": datetime.now(timezone.utc),
#         "k": resultado["k"],
#         "silhouette": resultado["silhouette"],
#         "scoresPorK": resultado["scoresPorK"],
#         "asignaciones": resultado["asignaciones"],
#         "perfiles": resultado["perfiles"]
#     })

# =========================
# FINALIZAR
# =========================

client.close()

print("\nConexión cerrada.")