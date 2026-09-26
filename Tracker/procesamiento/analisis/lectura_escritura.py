from pymongo import MongoClient
import pandas as pd
from analisis import analisis as analisis

# =========================
# CONFIGURACIÓN
# =========================

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
print(df_usuarios.head())

# =========================
# EXTRACCIÓN DE SESIONES
# =========================

sesiones = list(
    db["sesiones"].find()
)

df_sesiones = pd.json_normalize(sesiones)

print("\n=== SESIONES ===")
print(f"Cantidad de registros: {len(df_sesiones)}")
print(f"Cantidad de columnas: {len(df_sesiones.columns)}")
print(df_sesiones.head())


# =========================
# Pasamos a analisis
# =========================

patrones_secuenciales = analisis(df_sesiones,df_usuarios)

# =========================
# Escritura
# =========================

#db.analisis_clusters.insert_many(patrones_secuenciales)
#db.analisis_secuencial.insert_many(patrones_secuenciales)
#db.analisis_asociacion.insert_many(patrones_secuenciales)
#db.analisis_prediccion.insert_many(patrones_secuenciales)
# =========================
# FINALIZAR
# =========================

client.close()

print("\nConexión cerrada.")