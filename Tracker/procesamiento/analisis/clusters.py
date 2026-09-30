import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
debug = False
features_numericas = [
    "metricas.duracionPromedio",
    "metricas.paginasPorSesionPromedio",
    "metricas.tasaRebote",
    "metricas.frecuenciaRecurrencia",
    "metricas.interaccionesPromedio",
    "metricas.tiempoHastaConversion",
    "metricas.tasaConversion",
    "metricas.diasActivo",
]

def preparar_features(df_usuarios):
    faltantes = [c for c in features_numericas if c not in df_usuarios.columns] #esto es un freno de seguridad
    if faltantes:
        raise ValueError(f"Faltan columnas en df_usuarios: {faltantes}") #aviso por las dudas que faltan datos
    df = df_usuarios[["_id"] + features_numericas].copy() #aca me quedo solo con las columnas que me importan
    df = df.dropna(
        subset=[
            c for c in features_numericas
            if c != "metricas.tiempoHastaConversion"
        ]
    ) #descarto las que le falte alguna feature, menos TiempoHastaConversion
    # Los usuarios que no convirtieron reciben una penalización fija.
    # De esta forma el valor no depende del resto de los usuarios.
    df["metricas.tiempoHastaConversion"] = (
        df["metricas.tiempoHastaConversion"].fillna(-1)
    )
    # Aplicamos logaritmo a las features con cola larga.
    df["metricas.duracionPromedio"] = np.log1p(df["metricas.duracionPromedio"])
    df["metricas.interaccionesPromedio"] = np.log1p(df["metricas.interaccionesPromedio"])
    df["metricas.paginasPorSesionPromedio"] = np.log1p(df["metricas.paginasPorSesionPromedio"])
    X = df[features_numericas].reset_index(drop=True)
    ids = df["_id"].reset_index(drop=True)
    return X, ids #devuelvo las features con sus correspondientes ids

def encontrar_k_optimo(X_escalado, k_min=2, k_max=5):
    mejor_k = k_min
    mejor_score = -1
    resultados = {}
    for k in range(k_min, k_max + 1):
        modelo = KMeans(n_clusters=k, random_state=42, n_init=10).fit(X_escalado)
        score = silhouette_score(X_escalado, modelo.labels_)
        resultados[k] = round(score, 4)
        if score > mejor_score:
            mejor_score = score
            mejor_k = k
    return mejor_k, resultados

def kmeans(df_usuarios, k=None, k_min=2, k_max=5):
    X, ids = preparar_features(df_usuarios) #preparamos las features
    if len(X) < k_min:
        raise ValueError(f"No hay suficientes usuarios con métricas ({len(X)}) para formar al menos {k_min} clusters")
    scaler = StandardScaler() #funcion de escalado de sklearn, sirve para que una sola feature no sea determinante
    X_escalado = scaler.fit_transform(X) #aca se escalan
    k_max = min(k_max, len(X) - 1)
    if k is None:
        k, scores_por_k = encontrar_k_optimo(X_escalado, k_min, k_max)
    else:
        scores_por_k = None
    if len(X) < k: #si las features son menores que los clusters
        raise ValueError(f"No hay suficientes usuarios con métricas ({len(X)}) para formar {k} clusters")
    modelo = KMeans(n_clusters=k, random_state=42, n_init=10) #el k medias estandar de SKlearn
    etiquetas = modelo.fit_predict(X_escalado) #y aca etiqueto
    silhouette = silhouette_score(X_escalado, etiquetas)
    if silhouette <= 0.25:
        return False
    asignaciones = [
        {"_id": id_, "cluster": int(cluster)}
        for id_, cluster in zip(ids, etiquetas)
    ] #esto si merece una explicacion mas detallada
    #fit_predict me devuelve un array de numeros correspondiente a los clusteres
    # entonces con zip emparejo id con su cluster segun etiquetas
    X_con_cluster = X.copy() #hago una copia, es para el siguiente paso
    X_con_cluster["cluster"] = etiquetas
    perfiles = {} #y aca de nuevo, explicacion
    for cluster_id, grupo in X_con_cluster.groupby("cluster"):
        perfiles[int(cluster_id)] = {
            "cantidadUsuarios": int(len(grupo)),
            "promedios": grupo[features_numericas].mean().round(3).to_dict()
        }
    #esta es la parte que me ordena todo para despues interpretar.
    #Los perfiles te dicen :
    # los que tienen mayor paginas por sesion, tienen mas tasa de conversion, y son el 70% y asi
    #Imprimir perfiles
    if(debug):
        visualizar_clusters(X_escalado, etiquetas, nombres_columnas=X.columns)
    return {
        "asignaciones": asignaciones,
        "perfiles": perfiles,
        "k": k,
        "silhouette": round(silhouette, 4),
        "scoresPorK": scores_por_k
    }

#------------------------------------------------------FUNCION PARA VISUALIZACION
def visualizar_clusters(X_escalado, etiquetas, nombres_columnas=None):
    etiquetas_arr = np.array(etiquetas)
    clusters_unicos = sorted(set(etiquetas_arr))
    # =========================================================================
    # 1. IMPRESIÓN DE TABLA DE PERFILES EN CONSOLA
    # =========================================================================
    if nombres_columnas is not None:
        # Reconstruimos un DataFrame temporal con los valores escalados para calcular promedios
        df_temp = pd.DataFrame(X_escalado, columns=nombres_columnas)
        df_temp["cluster"] = etiquetas_arr
        # Diccionario para armar la tabla comparativa
        datos_tabla = {}
        for c in clusters_unicos:
            grupo = df_temp[df_temp["cluster"] == c]
            cant = len(grupo)
            promedios = grupo.drop(columns=["cluster"]).mean().round(3)
            # Limpiamos prefijos para mejor lectura en consola
            promedios.index = [
                m.replace("metricas.", "").replace("dispositivo_", "").replace("origen_", "")
                for m in promedios.index
            ]
            datos_tabla[f"Cluster {c}"] = {"Cant. Usuarios": cant, **promedios.to_dict()}
        df_perfiles = pd.DataFrame.from_dict(datos_tabla)
        print("\n" + "=" * 70)
        print(" COMPARATIVA DE PERFILES DE CLUSTERS ".center(70, "="))
        print(df_perfiles.to_string())
        print("=" * 70 + "\n")

    # =========================================================================
    # 2. GRAFICACIÓN CON PCA Y CARACTERÍSTICAS
    # =========================================================================
    pca = PCA(n_components=2)
    X_pca = pca.fit_transform(X_escalado)
    componentes = pca.components_
    
    var1 = pca.explained_variance_ratio_[0] * 100
    var2 = pca.explained_variance_ratio_[1] * 100

    plt.figure(figsize=(10, 7))

    # Graficar puntos de cada cluster
    for cluster in clusters_unicos:
        puntos = X_pca[etiquetas_arr == cluster]
        plt.scatter(
            puntos[:, 0], puntos[:, 1], label=f"Cluster {cluster}", alpha=0.6
        )


    plt.xlabel(f"PC1 ({var1:.1f}% varianza explicada)")
    plt.ylabel(f"PC2 ({var2:.1f}% varianza explicada)")
    plt.title("Visualización de Clusters y Contribución de Variables (PCA)")
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.show()