from secuencial import prefix as prefix
from clusters import kmeans as kmeans

# =========================
# Analisis
# =========================
def analisis (df_usuarios,df_sesiones,soporte_secuencial,long_secuencial,k_min,k_max):
    patrones_secuenciales = prefix(df_sesiones,soporte_secuencial,long_secuencial)
    clusters = kmeans(df_usuarios,None,k_min,k_max)
    return patrones_secuenciales, clusters

# =========================
# Cierre
# =========================