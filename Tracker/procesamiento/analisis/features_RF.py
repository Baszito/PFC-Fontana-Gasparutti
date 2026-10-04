import pandas as pd

#------------------------------------
#-------- Utilidades comunes --------
#------------------------------------
SUBTIPOS_CONVERSION = ["compra", "completar_formulario", "contacto"]

def tiene_subtipo(eventos_clave, subtipos_buscados):
    if not isinstance(eventos_clave, list):
        return False
    return any(e.get("subtipo") in subtipos_buscados for e in eventos_clave)

def contiene_subtipo_especifico(eventos_clave, subtipo):
    if not isinstance(eventos_clave, list):
        return False
    return any(e.get("subtipo") == subtipo for e in eventos_clave)

#------------------------------------
# Detección de Rage Clicks por sesión
#------------------------------------
def calcular_rage_clicks_por_sesion(df_eventos, ventana_segundos=1.5, min_clicks=2):
    #La idea no es indicar cuantos bloques de Rage Clicks hubo
    #Acá la idea es devolver un diccionario con ID de sesión y un valor booleano que indique si hubo rage clicks o no
    #Justamente porque a los árboles de decisión solo le sirven valores booleanos
    df_clicks = df_eventos[df_eventos["metadata.tipo"] == "click"].copy()
    
    if df_clicks.empty:
        return {}
    
    df_clicks["siteId"] = df_clicks["metadata.siteId"]
    df_clicks["sessionId"] = df_clicks["metadata.sessionId"]
    df_clicks["elemento"] = df_clicks["metadata.elemento"]
    df_clicks["timestamp"] = pd.to_datetime(df_clicks["timestamp"])
    
    resultado = {}
    
    for (site_id, session_id, elemento), grupo in df_clicks.groupby(["siteId", "sessionId", "elemento"]):
        clave_sesion = f"{site_id}_{session_id}"
        
        if resultado.get(clave_sesion):
            continue #Esto es en caso de que ya se haya registrado que se realizaron rage clicks
        
        timestamps = sorted(grupo["timestamp"].tolist())
        cluster_actual = 1
        hubo_rage_clicks = False
        
        for i in range(1, len(timestamps)):
            diferencia = (timestamps[i] - timestamps[i - 1]).total_seconds()
            if diferencia <= ventana_segundos:
                cluster_actual += 1
                if cluster_actual >= min_clicks:
                    hubo_rage_clicks = True
                    break
            else:
                cluster_actual = 1
                
        resultado[clave_sesion] = resultado.get(clave_sesion, False) or hubo_rage_clicks
        
    return resultado

#------------------------------------------
#------ Features base a nivel sesión ------
#------------------------------------------
def preparar_feature_sesion(df_sesiones, df_eventos):
    #Retorna un DataFrame con una fila por sesión
    #Las features base son compartidas entre los distintos modelos que las utilizarán
    rage_clicks_dict = calcular_rage_clicks_por_sesion(df_eventos)
    
    df = df_sesiones.copy()
    df["clave_sesion"] = df["siteId"] + "_" + df["sessionId"]
    
    df["cantidad_paginas"] = df["rutas"].apply(lambda r: len(r) if isinstance(r, list) else 0)
    df["rage_click"] = df["clave_sesion"].map(rage_clicks_dict).fillna(False).astype(bool)
    df["convirtio"] = df["eventosClave"].apply(lambda ev: tiene_subtipo(ev, SUBTIPOS_CONVERSION))
    df["referrer"] = df["referrer"].fillna("desconocido")
    
    return df[[
        "clave_sesion", "siteId", "userId", "sessionId", "inicio",
        "is_mobile", "referrer", "cantidad_paginas", "rage_click",
        "duracionSesion", "convirtio", "eventosClave"
    ]]

#------------------------------------------
#- DataSet para la conversión de sesiones -
#------------------------------------------
def preparar_dataset_conversion(df_features_sesion):
    df = df_features_sesion.dropna(subset=["duracionSesion"]).copy()
    
    return df[[
        "clave_sesion", "is_mobile", "referrer", "cantidad_paginas",
        "rage_click", "duracionSesion", "convirtio"
    ]].rename(columns={"convirtio": "target"})
    
#-------------------------------------------
#--- DataSet para el abandono de carrito ---
#-------------------------------------------
def preparar_dataset_abandono_carrito(df_features_sesion):
    df = df_features_sesion.dropna(subset=["duracionSesion"]).copy()
    
    #Haber, capaz explicar esto es medio al pedo, pero solo nos quedamos con las
    #sesiones que tengan en evento de "agregar_al_carrito"
    #no tiene logica abandonarlo si nunca pusiste nada ahí
    df["agrego_carrito"] = df["eventosClave"].apply(
        lambda ev: contiene_subtipo_especifico(ev, "añadir_carrito")
        #Mamita, como patiné acá con los datos.
        #"agregar_carrito" es como va a figurar en el futuro, pero ahora, por los datos sintéticos, uso "añadir_carrito"
    )
    df = df[df["agrego_carrito"]].copy()
    
    df["abandono_carrito"] = ~df["eventosClave"].apply(
        lambda ev: contiene_subtipo_especifico(ev, "compra")
    )
    
    return df[[
        "clave_sesion", "is_mobile", "referrer", "cantidad_paginas",
        "rage_click", "duracionSesion", "abandono_carrito"
    ]].rename(columns={"abandono_carrito": "target"})

#-------------------------------------------
#- DataSet para el abandono de formulario --
#-------------------------------------------
def preparar_dataset_abandono_formulario(df_formularios, df_features_sesion):
    df_form = df_formularios.copy()
    df_form["clave_sesion"] = df_form["siteId"] + "_" + df_form["sessionId"]
    
    df = df_form.merge(
        df_features_sesion[["clave_sesion", "is_mobile", "referrer", "cantidad_paginas", "rage_click", "duracionSesion"]],
        on="clave_sesion",
        how="inner" # descarta formularios cuya sesión no se encuentre
    )
    
    df = df.dropna(subset=["duracionSesion"])
    df["abandono_formulario"] = ~df["completado"]
    
    return df[[
        "clave_sesion", "is_mobile", "referrer", "cantidad_paginas",
        "rage_click", "duracionSesion",
        "abandono_formulario"
    ]].rename(columns={"abandono_formulario": "target"})
    
#-------------------------------------------------
#- DataSet para modelo de recurrencia de usuario - 
#-------------------------------------------------
def preparar_dataset_recurrencia_usuario(df_usuarios, df_features_sesion):
    primera_sesion = (
        df_features_sesion
        .dropna(subset=["duracionSesion"])
        .sort_values("inicio")
        .groupby(["siteId", "userId"])
        .first()
        .reset_index()
    )
    
    df_usuarios_copia = df_usuarios.copy()
    df_usuarios_copia["clave_usuario"] = df_usuarios_copia["siteId"] + "_" + df_usuarios_copia["userId"]
    primera_sesion["clave_usuario"] = primera_sesion["siteId"] + "_" + primera_sesion["userId"]
    
    df = primera_sesion.merge(
        df_usuarios_copia[["clave_usuario", "totalSesiones"]],
        on="clave_usuario",
        how="inner"
    )
    
    df["es_recurrente"] = df["totalSesiones"] > 1
    
    return df[[
        "clave_usuario", "is_mobile", "referrer", "duracionSesion",
        "cantidad_paginas", "es_recurrente"
    ]].rename(columns={"referrer": "referrerOriginal", "es_recurrente": "target"})

def DDBB_RF(df_sesiones, df_eventos, df_formularios, df_usuarios):
    df_features_sesion = preparar_feature_sesion(df_sesiones, df_eventos)
    
    return {
        "conversion": preparar_dataset_conversion(df_features_sesion),
        "abandono_carrito": preparar_dataset_abandono_carrito(df_features_sesion),
        "abandono_formulario": preparar_dataset_abandono_formulario(df_formularios, df_features_sesion),
        "recurrencia_usuario": preparar_dataset_recurrencia_usuario(df_usuarios, df_features_sesion)
    }