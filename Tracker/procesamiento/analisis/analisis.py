from secuencial import prefix as prefix
from asociacion import reglas_asociacion as RA
# =========================
# Patrones secuenciales (prefixSpan)
# =========================
# =========================
# Clustering de usuarios (K-Means)
# =========================
def clustering_usuarios (df_usuarios):
    pass

# =========================
# Reglas de asociacion (A-Priori)
# =========================

# =========================
# Arboles de decision
# =========================
def arboles_decision (df_usuarios):
    pass

# =========================
# Analisis
# =========================
def analisis (df_usuarios,df_sesiones):
    patrones_secuenciales = prefix(df_usuarios)
    #reglas_asociacion = RA(df_sesiones)
    return patrones_secuenciales

# =========================
# Cierre
# =========================