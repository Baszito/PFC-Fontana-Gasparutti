from pymongo import MongoClient
import pandas as pd
from datetime import datetime
from analisis import analisis as analisis

# =========================
# CONFIGURACIÓN
# =========================
soporte_secuencial = 0.05
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "PruebaBBDD"

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
        "analisis": {"$ne": True}
    }

sesiones = list(
    db["sesiones"].find(filtro_sesiones)
)

if not sesiones:
    print("Sin sesiones nuevas para analizar")
    client.close()

df_sesiones = pd.json_normalize(sesiones)

print("\n=== SESIONES ===")
print(f"Cantidad de registros: {len(df_sesiones)}")
print(f"Cantidad de columnas: {len(df_sesiones.columns)}")


# =========================
# Pasamos a analisis
# =========================

patrones_secuenciales,clusters = analisis(df_usuarios,df_sesiones,soporte_secuencial)


# =========================
# Escritura
# =========================

# for site_id, resultados in patrones_secuenciales.items():
#         db.analisis_patrones_secuenciales.insert_one({
#             "siteId": site_id,
#             "fechaGeneracion": datetime.now(),
#             "soporteMinimo": soporte_secuencial,
#             "patrones": [{"soporte": s, "proporcion": pr, "secuencia": p} for s, pr, p in resultados]
#         })

#db.analisis_secuencial.insert_many(clusters)
#db.analisis_asociacion.insert_many(asociaciones)
#db.analisis_prediccion.insert_many(predicciones)

for site_id, resultado in clusters.items():
    if resultado == False:
        continue
    db.analisis_clusters.insert_one({
        "siteId": site_id,
        "fechaGeneracion": datetime.now(),
        "k": resultado["k"],
        "silhouette": resultado["silhouette"],
        "scoresPorK": resultado["scoresPorK"],
        "asignaciones": resultado["asignaciones"],
        "perfiles": resultado["perfiles"]
    })

# =========================
# FINALIZAR
# =========================

client.close()

print("\nConexión cerrada.")