import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.inspection import partial_dependence
import numpy as np
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from features_RF import DDBB_RF as DDBB_RF

def codificar_categoricas(df, columnas_categoricas):
    #Convertimos columnas de texto en columnas binarias
    #Devuelve el DataFrame codificado y la lista de columnas usadas como features
    #para poder aplicar exactamente la misma codificación despues sobre los datos nuevos
    
    df_codificado = pd.get_dummies(df, columns=columnas_categoricas)
    return df_codificado

#---------------------------------------------------
#----- Determinación de importancia de features ----
#---------------------------------------------------
def clasificar_forma_relacion(valores_y):
    """
    Clasifica la forma de una curva de partial dependence sin necesidad
    de guardar los valores crudos. Devuelve una etiqueta corta.
    """
    diferencias = np.diff(valores_y)
    signos = np.sign(diferencias)
    signos = signos[signos != 0]  # ignorar tramos sin cambio (planos)

    if len(signos) == 0:
        return "sin_variacion"

    cambios_de_signo = np.sum(np.diff(signos) != 0)

    if cambios_de_signo == 0:
        return "monotona"  # ya la describe bien la correlación (sube o baja todo el tiempo)
    elif cambios_de_signo == 1:
        if signos[0] < 0 and signos[-1] > 0:
            return "forma_u"            # baja y después sube: valle
        elif signos[0] > 0 and signos[-1] < 0:
            return "forma_u_invertida"  # sube y después baja: pico
        else:
            return "irregular"
    else:
        return "sin_relacion_clara"     # más de un quiebre, demasiado ruidoso para resumir


def calcular_shap_con_direccion(modelo, X_test, grid_resolution=8):
    import shap
    explainer = shap.TreeExplainer(modelo)
    shap_values = explainer.shap_values(X_test)

    if isinstance(shap_values, list):
        valores_clase_positiva = shap_values[1]
    elif isinstance(shap_values, np.ndarray) and shap_values.ndim == 3:
        valores_clase_positiva = shap_values[:, :, 1]
    else:
        valores_clase_positiva = shap_values

    resumen = {}
    for i, feature in enumerate(X_test.columns):
        valores_feature = np.asarray(X_test[feature].values, dtype=np.float64)
        shap_de_feature = np.asarray(valores_clase_positiva[:, i], dtype=np.float64)

        valores_unicos = np.unique(valores_feature)

        if np.std(valores_feature) == 0 or np.any(np.isnan(valores_feature)) or np.any(np.isnan(shap_de_feature)):
            correlacion = 0.0
        else:
            correlacion = float(np.corrcoef(valores_feature, shap_de_feature)[0, 1])

        if len(valores_unicos) <= 2:
            forma = "binaria"
        else:
            pd_resultado = partial_dependence(
                modelo,
                X_test.astype({feature: "float64"}),
                [feature],
                grid_resolution=grid_resolution
            )
            curva_y = pd_resultado["average"][0]
            forma = clasificar_forma_relacion(curva_y)

        resumen[feature] = {
            "importanciaPromedio": round(float(np.abs(shap_de_feature).mean()), 4),
            "direccion": round(correlacion, 4),
            "forma": forma
        }

    return resumen


#---------------------------------------------------
#-------- Función generica de entrenamiento --------
#---------------------------------------------------
def entrenar_random_forest(df, columnas_categoricas, nombre_modelo, n_estimators=100, random_state=42):
    #Entrena un RandomForestClassifier sobre un dataset recibido
    #Asume que el DataFrame tiene una columna "target" y columnas identificatorias
    #(clave_sesion/clave_usuario) que deben excluirse del entrenamiento
    
    df = df.copy()
    
    columnas_id = [c for c in df.columns if c.startswith("clave_")]
    df_modelo = df.drop(columns=columnas_id)
    
    df_modelo = codificar_categoricas(df_modelo, columnas_categoricas)
    
    X = df_modelo.drop(columns=["target"])
    y = df_modelo["target"]
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=random_state, stratify=y
    )
    
    modelo = RandomForestClassifier(n_estimators=n_estimators, random_state=random_state)
    modelo.fit(X_train, y_train)
    
    y_pred = modelo.predict(X_test)
    
    shap_resumen = calcular_shap_con_direccion(modelo, X_test)
    
    reporte = {
        "accuracy": round(accuracy_score(y_test, y_pred), 4),
        "reporte_clasificacion": classification_report(y_test, y_pred, output_dict=True),
        "matriz_confusion": confusion_matrix(y_test, y_pred).tolist(),
        "importancia_features": dict(sorted(
            zip(X.columns, modelo.feature_importances_),
            key=lambda x: x[1],
            reverse=True
        )),
        "shap_resumen": shap_resumen
    }
    
    print(f"[{nombre_modelo}] accuracy: {reporte['accuracy']}")
    return modelo, reporte

#---------------------------------------------------
#----------- Funciones de cada modelo --------------
#---------------------------------------------------

def entrenar_modelo_conversion(df_conversion):
    return entrenar_random_forest(
        df_conversion,
        columnas_categoricas=["referrer"],
        nombre_modelo="conversion_sesion"
    )
    
def entrenar_modelo_abandono_carrito(df_abandono_carrito):
    return entrenar_random_forest(
        df_abandono_carrito, 
        columnas_categoricas=["referrer"],
        nombre_modelo="abandono_carrito"
    )

def entrenar_modelo_abandono_formulario(df_abandono_formulario):
    return entrenar_random_forest(
        df_abandono_formulario,
        columnas_categoricas=["referrer"],
        nombre_modelo="abandono_formulario"
    )
    
def entrenar_modelo_recurrencia_usuarios(df_recurrencia):
    return entrenar_random_forest(
        df_recurrencia,
        columnas_categoricas=["referrerOriginal"],
        nombre_modelo="recurrencia_usuario"
    )

def arboles_decision(df_sesiones, df_eventos, df_formularios, df_usuarios):
    datasets = DDBB_RF(df_sesiones, df_eventos, df_formularios, df_usuarios)

    modelos_a_entrenar = {
        "conversion_sesion": (entrenar_modelo_conversion, datasets["conversion"]),
        "abandono_carrito": (entrenar_modelo_abandono_carrito, datasets["abandono_carrito"]),
        "abandono_formulario": (entrenar_modelo_abandono_formulario, datasets["abandono_formulario"]),
        "recurrencia_usuario": (entrenar_modelo_recurrencia_usuarios, datasets["recurrencia_usuario"]),
    }

    resultados = {}
    for nombre_modelo, (funcion_entrenamiento, dataset) in modelos_a_entrenar.items():
        try:
            modelo, reporte = funcion_entrenamiento(dataset)
            resultados[nombre_modelo] = (modelo, reporte)
        except Exception as e:
            print(f"  [{nombre_modelo}] no se pudo entrenar: {e}")
            resultados[nombre_modelo] = None

    return resultados
    
def RF(df_sesiones, df_eventos, df_formularios, df_usuarios):
    col_site_eventos = "metadata.siteId" if "metadata.siteId" in df_eventos.columns else "siteId"

    sitios = sorted(
        set(df_sesiones["siteId"].dropna()) | set(df_usuarios["siteId"].dropna())
    )

    resultados_por_sitio = {}

    for site_id in sitios:
        df_sesiones_site = df_sesiones[df_sesiones["siteId"] == site_id].reset_index(drop=True)
        df_usuarios_site = df_usuarios[df_usuarios["siteId"] == site_id].reset_index(drop=True)
        df_eventos_site = df_eventos[df_eventos[col_site_eventos] == site_id].reset_index(drop=True)
        df_formularios_site = df_formularios[df_formularios["siteId"] == site_id].reset_index(drop=True)

        try:
            resultados_por_sitio[site_id] = arboles_decision(
                df_sesiones_site, df_eventos_site, df_formularios_site, df_usuarios_site
            )
        except Exception as e:
            print(f"[RF] {site_id}: fallo general en preparación de datos ({e})")
            resultados_por_sitio[site_id] = None

    return resultados_por_sitio