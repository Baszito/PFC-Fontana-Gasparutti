from secuencial import prefix as prefix
from clusters import kmeans as kmeans
from arboles_decision import arboles_decision as AD
from asociacion import reglas_asociacion as RA

# =========================
# Analisis
# =========================
def analisis (df_usuarios,df_sesiones, df_eventos, df_formularios, soporte_secuencial):
    patrones_secuenciales = prefix(df_sesiones,soporte_secuencial)
    clusters = kmeans(df_usuarios,2)
    #random_forest = AD(df_sesiones, df_eventos, df_formularios, df_usuarios)
    #reglas_asociacion = RA(df_sesiones)
    
    return patrones_secuenciales,clusters #, reglas_asociacion, random_forest

# =========================
# Cierre
# =========================