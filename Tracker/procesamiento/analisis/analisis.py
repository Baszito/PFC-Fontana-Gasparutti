from secuencial import prefix as prefix
from clusters import kmeans as kmeans
from arboles_decision import arboles_decision as RF
from asociacion import reglas_asociacion as AS

# =========================
# Analisis
# =========================
def analisis (df_usuarios, df_sesiones, df_eventos, df_formularios, soporte_secuencial, long_secuencial, k_min, k_max):
    patrones_secuenciales = prefix(df_sesiones,soporte_secuencial,long_secuencial)
    clusters = kmeans(df_usuarios,None,k_min,k_max)
    asociacioes = AS(df_sesiones)
    random_forests = RF(df_sesiones, df_eventos, df_formularios, df_usuarios)
    
    return patrones_secuenciales, clusters, asociacioes, random_forests

# =========================
# Cierre
# =========================