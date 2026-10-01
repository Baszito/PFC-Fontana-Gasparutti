from pymongo import MongoClient
import pandas as pd
from datetime import datetime, timedelta, timezone
from analisis import analisis as analisis

# =========================
# CONFIGURACIÓN
# =========================

# Parametros de la DB
MONGO_URI = "mongodb://localhost:27017"
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
        "analisis": {"$ne": True},
        "inicio": {"$lte": hace_30_dias}
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

patrones_secuenciales,_ = analisis(df_usuarios,df_sesiones,soporte_secuencial,long_secuencial,k_min,k_max)


# =========================
# Escritura
# =========================


# ========================= SECUENCIAL

for site_id, resultados in patrones_secuenciales.items():
        db.analisis_patrones_secuenciales.insert_one({
            "siteId": site_id,
            "fechaGeneracion": datetime.now(),
            "soporteMinimo": soporte_secuencial,
            "patrones": [{"soporte": s, "proporcion": pr, "secuencia": p} for s, pr, p in resultados]
        })


# for site_id, resultado in clusters.items():
#     if resultado == False:
#         continue
#     db.analisis_clusters.insert_one({
#         "siteId": site_id,
#         "fechaGeneracion": datetime.now(),
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