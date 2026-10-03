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
        "analisis": {"$ne": True}#,
        #"inicio": {"$lte": hace_30_dias}
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

print("\n=== RESULTADOS ===")
print("\n=== random forests ===")

for nombre_modelo, (reporte) in random_forests.items():
    print(f"\n=== {nombre_modelo} ===")
    print(f"Accuracy: {reporte['accuracy']}")
    print("\nMatriz de confusión:")
    print(reporte['matriz_confusion'])
    print("\nImportancia de features:")
    for feature, importancia in reporte['importancia_features'].items():
        print(f"  {feature}: {round(importancia, 4)}")
    print("\nReporte de clasificación (precision/recall/f1 por clase):")
    for clase, metricas in reporte['reporte_clasificacion'].items():
        if isinstance(metricas, dict):
            print(f"  {clase}: {metricas}")

print("\n=== asociaciones ===")
resultado_apriori = asociaciones 

for clave in ["apriori_rutas", "apriori_eventosClave"]:
    print(f"\n=== {clave} ===")

    print("\nItemsets frecuentes:")
    df_itemsets = pd.DataFrame(resultado_apriori[clave]["itemsets_frecuentes"])
    print(df_itemsets.sort_values("soporte", ascending=False))

    print("\nReglas de asociación:")
    df_reglas = pd.DataFrame(resultado_apriori[clave]["reglas"])
    print(df_reglas.sort_values("confianza", ascending=False))
# ========================= SECUENCIAL

# for site_id, resultados in patrones_secuenciales.items():
#         db.analisis_patrones_secuenciales.insert_one({
#             "siteId": site_id,
#             "fechaGeneracion": datetime.now(),
#             "soporteMinimo": soporte_secuencial,
#             "patrones": [{"soporte": s, "proporcion": pr, "secuencia": p} for s, pr, p in resultados]
#         })


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