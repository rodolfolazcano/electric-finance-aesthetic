// Diccionario de textos para el Modo Guiado ("Explicame esto").
// Cada entrada corresponde a una sección del AnalisisFundamentalTab.
// Textos fijos, determinísticos, sin contenido generado por IA.

export type SeccionExplicacion =
  | "pe-trailing"
  | "pe-forward"
  | "peg"
  | "pb"
  | "ev-ebitda"
  | "roe"
  | "margen-neto"
  | "crecimiento-ingresos"
  | "crecimiento-ganancias"
  | "deuda-patrimonio"
  | "fcf-yield"
  | "dividend-yield"
  | "upside"
  | "recomendacion"
  | "beta"
  | "senal-inversion"
  | "score-fundamental"
  | "margen-seguridad"
  | "rango-precios"
  | "salud-financiera"
  | "vcs"
  | "desempenio-historico";

const EXPLICACIONES: Record<SeccionExplicacion, string> = {
  "pe-trailing":
    "Indica cuantos años de ganancias actuales de la empresa estarias pagando al comprar la accion hoy. Un P/E de 20 significa que, al ritmo actual de ganancias, tardarias 20 años en recuperar el precio pagado solo con esas ganancias. No hay un numero bueno universal: hay que compararlo con empresas del mismo sector y con la historia de la propia empresa.",

  "pe-forward":
    "Es el mismo calculo que el P/E Trailing, pero usando las ganancias estimadas para los proximos doce meses en vez de las del año pasado. Sirve para ver si el mercado espera que las ganancias mejoren (P/E Forward menor que el Trailing) o empeoren.",

  peg: "El PEG divide el P/E por la tasa de crecimiento de las ganancias. Un PEG menor a 1 puede indicar que la accion esta barata respecto a su crecimiento esperado. Pero ojo: el crecimiento usado es una estimacion, no un dato confirmado.",

  pb: "Compara el precio de la accion con el valor contable de la empresa (sus activos menos sus deudas). Un P/B bajo (menor a 1) puede indicar que la accion cotiza por debajo de su valor de liquidacion, pero tambien puede senalar que el mercado desconfia de la calidad de esos activos.",

  "ev-ebitda":
    "Mide cuantas veces el beneficio operativo (EBITDA) cubre el valor total de la empresa (capitalizacion + deuda neta). Un multiplo bajo sugiere que la empresa podria estar infravalorada respecto a su capacidad de generar caja.",

  roe: "Mide cuanta ganancia genera la empresa por cada peso que pusieron sus accionistas. Un ROE alto y sostenido en el tiempo suele ser senal de un negocio eficiente, pero tambien puede estar inflado por mucha deuda. Por eso conviene mirarlo junto al D/E.",

  "margen-neto":
    "Es el porcentaje de cada venta que queda como ganancia despues de restar todos los gastos. Un margen neto alto indica que la empresa tiene poder de fijacion de precio o control de costos. Muy sensible al sector: una empresa de software puede tener margen del 30% y un supermercado del 3%.",

  "crecimiento-ingresos":
    "Muestra como aumentaron (o disminuyeron) las ventas respecto al mismo periodo del año anterior. El crecimiento de ingresos es la base de la cual sale todo lo demas: sin ventas no hay ganancias. Si crece solo por inflacion o adquisiciones, el crecimiento organico puede ser menor de lo que parece.",

  "crecimiento-ganancias":
    "Es el aumento de la ganancia neta respecto al año anterior. Este numero importa mas que el crecimiento de ingresos porque refleja si la empresa esta convirtiendo mejor sus ventas en ganancias. Si las ganancias crecen menos que los ingresos, los costos estan creciendo mas rapido.",

  "deuda-patrimonio":
    "Compara cuanta deuda tiene la empresa contra cuanto capital propio. Un D/E alto no es automaticamente malo — muchas empresas crecen sanamente con deuda — pero implica mas riesgo si el negocio se enfria, porque las deudas hay que pagarlas igual. Depende mucho del sector.",

  "fcf-yield":
    "El Free Cash Flow Yield mide el efectivo que realmente genera la empresa (despues de inversiones) dividido por su valor de mercado. Es como un dividendo virtual: si la empresa generara siempre ese efectivo, ese seria tu rendimiento como accionista. Un FCF Yield positivo y creciente es buena senal.",

  "dividend-yield":
    "Es el dividendo anual por accion dividido por el precio de la accion. Es el rendimiento que recibis en efectivo solo por tener la accion, sin venderla. No todas las empresas pagan dividendo — algunas prefieren reinvertir las ganancias en el negocio.",

  upside:
    "El upside muestra la diferencia entre el precio actual y el precio objetivo promedio que fijan los analistas que cubren la accion. Si es positivo, el consenso cree que la accion vale mas de lo que cotiza. Si es negativo, el precio ya supero lo que los analistas consideran su valor razonable. Es una referencia externa, no un calculo propio.",

  recomendacion:
    "Es el promedio de las recomendaciones de los analistas que siguen la accion, donde 1 es Compra fuerte y 5 es Venta fuerte. No reemplaza tu propio analisis — los analistas pueden tener sesgos o trabajar con supuestos distintos a los tuyos.",

  beta: "Mide cuanto se mueve la accion respecto al mercado en general. Una beta de 1 significa que la accion se mueve igual que el mercado. Beta de 2 significa que si el mercado sube 1%, la accion tiende a subir 2% (y viceversa). Beta alta = mas riesgo, pero tambien mas potencial de ganancia.",

  "senal-inversion":
    "La senal (Acumular / Mantener / Evaluar reduccion / Cautela) se calcula combinando el score fundamental (que tan buenos son los numeros de la empresa) con la posicion del precio en su rango historico de 10 años y el upside al precio objetivo. Es una guia orientativa, no una orden de compra o venta.",

  "score-fundamental":
    "El score de 0 a 100 resume en un solo numero la calidad de los fundamentos de la empresa. Se calcula a partir de 7 metricas (ROE, crecimiento ingresos, FCF yield, P/E, deuda, margen, crecimiento ganancias). No existe un score perfecto — conviene usarlo como filtro, no como veredicto.",

  "margen-seguridad":
    "Es la diferencia entre lo que vale una empresa (segun algun calculo) y lo que cuesta hoy en el mercado. Cuanto mayor el margen, mas colchon tenes si te equivocaste en el calculo o si el mercado se pone pesimista. Es un concepto central del value investing de Benjamin Graham.",

  "rango-precios":
    "Muestra donde esta parado el precio actual respecto a los precios maximos y minimos de los ultimos 10 años. Si el precio esta cerca del minimo historico, puede ser oportunidad (o senal de problemas). Si esta cerca del maximo, puede ser que ya se haya descontado el crecimiento futuro.",

  "salud-financiera":
    "Posicion mide que tan solida es la estructura financiera de la empresa hoy (deudas, liquidez). Generacion mide que tan bien convierte ese negocio en ganancias reales. Una empresa puede tener buena Posicion pero mala Generacion (mucho capital, poca rentabilidad) o al reves (rentable pero muy endeudada).",

  vcs: "Es una aproximacion a lo que Warren Buffett llama moat (foso defensivo): una razon estructural por la que la empresa puede seguir ganando dinero sin que la competencia se lo quite facil. Aca se mide con tres condiciones numericas (ROE, margen, deuda) — es una aproximacion cuantitativa, no un analisis cualitativo completo.",

  "desempenio-historico":
    "Muestra como se movio el precio de la accion en el pasado, comparado con el mercado en general. Sirve para entender la volatilidad y el contexto, no para predecir el futuro. El desempeño pasado no garantiza resultados futuros.",
};

export function getExplicacion(seccion: SeccionExplicacion): string {
  return EXPLICACIONES[seccion] ?? "";
}
