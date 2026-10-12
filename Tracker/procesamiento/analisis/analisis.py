from secuencial import prefix as prefix
from clusters import kmeans as kmeans
from arboles_decision import RF as RF
from asociacion import reglas_asociacion as AS

# =========================
# Analisis
# =========================
def analisis (df_usuarios,df_sesiones, df_eventos, df_formularios, soporte_secuencial,long_secuencial,k_min,k_max):
    patrones_secuenciales = prefix(df_sesiones,soporte_secuencial,long_secuencial)
    # 2. Clusters por sitio
    clusters = {}
    if not df_sesiones.empty:
        if "siteId" in df_usuarios.columns:
            for site_id, df_site in df_usuarios.groupby("siteId"):
                # Verificamos si hay suficientes usuarios en este sitio para hacer KMeans
                if len(df_site) < k_min:
                    print(f"Sitio {site_id} omitido: solo tiene {len(df_site)} usuarios (se requieren mínimo {k_min})")
                    clusters[site_id] = False
                    continue
                    
                try:
                    # Ejecutamos KMeans únicamente para los usuarios de este sitio
                    res_kmeans = kmeans(df_site, k=None, k_min=k_min, k_max=k_max)
                    clusters[site_id] = res_kmeans
                except Exception as e:
                    print(f"Error procesando KMeans para el sitio {site_id}: {e}")
                    clusters[site_id] = False
        else:
            print("La columna 'siteId' no existe en df_usuarios")

    if "siteId" not in df_sesiones.columns:
        asociaciones = {}
    else:
        asociaciones = AS(df_sesiones)
    random_forests = RF(df_sesiones, df_eventos, df_formularios, df_usuarios)
    
    return patrones_secuenciales, clusters, asociaciones, random_forests


# =========================
# Cierre
# =========================