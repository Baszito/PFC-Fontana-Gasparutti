import pandas as pd
from mlxtend.preprocessing import TransactionEncoder
from mlxtend.frequent_patterns import apriori, association_rules

def extraer_transacciones_rutas(df_sesiones):
    #La idea es convertir el arreglo rutas en un conjunto de páginas UNICAS visitadas
    #No importa ni el orden ni la cantidad de veces que se repitió en la misma sesión
    transacciones = []
    for rutas in df_sesiones["rutas"]:
        if not isinstance(rutas, list) or len(rutas) == 0:
            continue
        paginas_unicas = set(r["pagina"] for r in rutas if "pagina" in r)
        if paginas_unicas:
            transacciones.append(list(paginas_unicas))
    return transacciones

def extraer_transacciones_eventos(df_sesiones):
    #Algo similar a lo anterior, pero ahora con los elementos de eventosClave
    transacciones = []
    for eventos in df_sesiones["eventosClave"]:
        if not isinstance(eventos, list) or len(eventos) == 0:
            continue
        subtipos_unicos = set(e["subtipo"] for e in eventos if e.get("subtipo"))
        if subtipos_unicos:
            transacciones.append(list(subtipos_unicos))
    return transacciones

def calcular_A_priori(transacciones, min_support=0.05, min_confidence=0.5):
    if len(transacciones) == 0:
        return {"itemsets_frecuentes": [], "reglas": []}
    
    #El encoder lo que hace es transformar las listas de listas en una tabla con el formato:
    #Cada fila se corresponde a cada una de las transacciones
    #Cada columna se corresponde a cada elemento individual dentro de las transacciones
    #Las columnas serán las distintas rutas y los distintos subtipos
    #Dentro de la tabla, los contenidos serán booleanos, que indican si el elemento correspondiente de la columna está presente en la transacción de la fila
    #Es este tipo de información con la que trabaja A-priori
    te = TransactionEncoder()
    te_ary = te.fit(transacciones).transform(transacciones)
    df_encoded = pd.DataFrame(te_ary, columns=te.columns_)
    
    itemsets = apriori(df_encoded, min_support=min_support, use_columns=True)
    #Resultado: Una tabla con dos columnas.
    #Las filas corresponden a cada "patron identificado"
    #Las columnas son: itemsets -> frozenset({'elemento1', 'elemento2', ...}) correspondientes a los elementos pertenecientes al patron detectado
    #La otra columna es support, que son número entre 0 y 1 que indican la probabilidad de aparición de dicho patron
    #El support se calcula como la cantidad de Trues que aparecen para cada combinación de columnas posibles, sobre el total de elementos de esa combinación
    
    if itemsets.empty:
        return {"itemsets_frecuentes": [], "reglas": []}
    
    reglas = association_rules(itemsets, metric="confidence", min_threshold=min_confidence)
    #Resultado: Una tabla con 5 columnas.
    #Cada fila representa nuevamente un patron identificado
    #Las columans son:
    # Antecedents -> El elemento analizado como antecedente
    # Consequents -> El elemento analizado como consecuencia del antecedente
    # Support -> Es la probabilidad de que este patrón aparezca
    # Confidence -> Es el porcentaje de transacciones que, al tener el antecedente, también tienen al consecuente
    # lift -> Cuánto más probable es ver el consecuente cuando está el antecedente, comparado con verlo "porque si" en general.
    #Un valor de lift > 1 indica una asociación positiva real (no una casualidad)
    itemsets_out = [
        {"items": list(row["itemsets"]), "soporte": round(row["support"], 4)}
        for _, row in itemsets.iterrows()
    ]
    
    reglas_out = [
        {
            "antecedente": list(row["antecedents"]),
            "consecuente": list(row["consequents"]),
            "soporte": round(row["support"], 4),
            "confianza": round(row["confidence"], 4),
            "lift": round(row["lift"], 4)
        }
        for _, row in reglas.iterrows()
    ]
    
    return {"itemsets_frecuentes": itemsets_out, "reglas": reglas_out}


def reglas_asociacion(df_sesiones):
    transacciones_rutas = extraer_transacciones_rutas(df_sesiones)
    transacciones_eventos = extraer_transacciones_eventos(df_sesiones)
    
    resultado_rutas = calcular_A_priori(transacciones_rutas)
    resultado_eventos = calcular_A_priori(transacciones_eventos)
    
    return {
        "apriori_rutas": resultado_rutas,
        "apriori_eventosClave": resultado_eventos
    }