La idea es básicamente encontrar las relaciones entre eventos. El ejemplo típico es el de un supermercado, donde se compran muchos productos, y la idea es ver cuál es el patrón más popular de compra, descartar lo "impopular o raro" y poder calcular probabilidades.
Un ejemplo es que, reconociendo que "lechuga" es un elemento popular, se puede predecir qué otros productos se agregarán al carrito. O cuál es la probabilidad de comprar "zanahoria", habiendo agregado antes "lechuga" al carrito, en comparación de la probabilidad de agregar "zanahoria" desde un inicio (esto suena muy piola para el tema de patrones).

Basado en esto también surge el ClickStream Analysis, pero teoricamente es un poco más complejo de llevar. Ahora, si logramos entender bien esto, lo de los clicks sale medio fácil también, habría que averiguar que data podemos sacar de eso.

(Lo que viene a partir de ahora está relacionado a la analogía del super)

El proceso del Algoritmo es este:
1)  Revisa todos los artículos individuales y descarta los que no superen el "soporte mínimo" (es como un índice de popularidad, algo así como definir qué tanto tiene que aparecer algo para ser popular. Tendríamos que estimarlo en base a una tasa promedio de usuarios);
2)  Junta los artículos sobrevivientes en parejas y vuelve a medir su "soporte", eliminando las parejas poco frecuentes;
3)  Repite el proceso formando grupos de 3, luego de 4, etc., hasta que ya no se puedan formar más combinaciones frecuentes;
4)  Genera las reglas de asociación finales con los grupos ganadores que cumplan con la confianza mínima.

Métricas del algoritmo:
1) Soporte: Mide qué tan popular es un conjunto de artículos. Es el porcentaje de transacciones totales que contienen esos productos. El usuario define un  "soporte mínimo" para descartar lo que casi nadie compra.
2) Confianza: Mide la certeza de la regla. Si alguien compra el artículo A, ¿Cuál es la probabilidad de que también compre el artículo B?
3) Elevación: Mide la fuerza de la regla. Te dice cuánto más probable es que compren el artículo B dado que compraron el A, en comparación con si compraran el B al azar. Un valor mayor a 1 significa una asociación real y positiva.

Ahora, un poquito de código hecho por mi cumpa el Gemini Pro pa estudiantes para saber cómo aplicar esto:

```pip install mlxtend pandas

import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder

#Simulamos tus datos de MongoDB (Múltiples sesiones con tu formato mixto)
sesiones_db = [
    ["/home", "/productos", "/productos/pelota", "añadir_a_carrito", "/producto/pelota/envio", "/producto/pelota/envio/medio_pago", "compra", "/producto/pelota/envio/medio_pago/checkout"],
    ["/home", "/productos", "/productos/remera", "añadir_a_carrito", "/home"],
    ["/home", "/productos", "/productos/pelota", "añadir_a_carrito", "/producto/pelota/envio", "compra"],
    ["/productos", "/productos/pelota", "añadir_a_carrito", "contacto"],
    ["/home", "/productos", "/productos/pelota", "añadir_a_carrito", "/producto/pelota/envio", "/producto/pelota/envio/medio_pago", "compra"]
]

#Transformar los arreglos en una matriz binaria (One-Hot Encoding)
#A-priori necesita saber si un elemento existió (1) o no (0) en la sesión

te = TransactionEncoder()
te_ary = te.fit(sesiones_db).transform(sesiones_db)
df = pd.DataFrame(te_ary, columns=te.columns_)

print("--- Matriz de la sesión (Primeras filas) ---")
print(df.head(2)) 
print("\n" + "="*50 + "\n")

#Aplicar el algoritmo A-priori para encontrar "conjuntos de elementos frecuentes"
#min_support=0.6 significa que el patrón debe aparecer en al menos el 60% de las sesiones

frequent_itemsets = apriori(df, min_support=0.6, use_colnames=True)

print("--- Conjuntos de Elementos Frecuentes ---")
print(frequent_itemsets)
print("\n" + "="*50 + "\n")

#Generar las reglas de asociación
#min_threshold=0.80 filtra reglas que tengan al menos 80% de confianza

reglas = association_rules(frequent_itemsets, metric="confidence", min_threshold=0.80)

#Limpiamos el DataFrame para mostrar solo lo más importante

reglas_limpias = reglas[['antecedents', 'consequents', 'support', 'confidence', 'lift']]

print("--- Reglas de Asociación Encontradas ---")
print(reglas_limpias.to_string())
```

![[Pasted image 20260921202540.png]]