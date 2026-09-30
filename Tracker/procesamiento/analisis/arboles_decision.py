import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from features_RF import DDBB_RF as DDBB_RF

def codificar_categoricas(df, columnas_categoricas):
    #Convertimos columnas de texto en columnas binarias
    #Devuelve el DataFrame codificado y la lista de columnas usadas como features
    #para poder aplicar exactamente la misma codificación despues sobre los datos nuevos
    
    df_codificado = pd.get_dummies(df, columns=columnas_categoricas)
    return df_codificado

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
    
    reporte = {
        "accuracy": round(accuracy_score(y_test, y_pred), 4),
        "reporte_clasificacion": classification_report(y_test, y_pred, output_dict=True),
        "matriz_confusion": confusion_matrix(y_test, y_pred).tolist(),
        "importancia_features": dict(sorted(
            zip(X.columns, modelo.feature_importances_),
            key=lambda x: x[1],
            reverse=True
        ))
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
    
    modelo_conversion, reporte_conversion = entrenar_modelo_conversion(datasets["conversion"])
    modelo_abandono_carrito, reporte_abandono_carrito = entrenar_modelo_abandono_carrito(datasets["abandono_carrito"])
    modelo_abandono_formulario, reporte_abandono_formulario = entrenar_modelo_abandono_formulario(datasets["abandono_formulario"])
    modelo_recurrencia, reporte_recurrencia = entrenar_modelo_recurrencia_usuarios(datasets["recurrencia_usuario"])
    
    return {
        "conversion": reporte_conversion,
        "abandono_carrito": reporte_abandono_carrito,
        "abandono_formulario": reporte_abandono_formulario,
        "recurrencia_usuario": reporte_recurrencia
    }