from secuencial import prefix as prefix
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
def reglas_asociacion (df_usuarios):
    pass

# =========================
# Arboles de decision
# =========================
def arboles_decision (df_usuarios):
    pass

# =========================
# Analisis
# =========================
def analisis (df_usuarios,df_sesiones,soporte_secuencial):
    patrones_secuenciales = prefix(df_sesiones,soporte_secuencial)
    return patrones_secuenciales

# =========================
# Cierre
# =========================