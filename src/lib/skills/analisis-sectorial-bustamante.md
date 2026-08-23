# Skill: Análisis Sectorial Estructural — Bustamante (La televisión económica)

## Propósito
Capa de razonamiento industrial, no numérica. Metodología de economía industrial aplicada al sector audiovisual, trasladable a cualquier industria regulada (telecom, media, fintech, banca, crypto).

## Cuándo usar
Antes de valuar cualquier empresa. Siempre que el ticker pertenezca a industria oligopólica, regulada o en disrupción tecnológica. Complementa a Elbaum Cap 10 (covenants) para casos como BAESA/Cablevisión, TECO2, CABLE, IRSA.

## Checklist estructural obligatorio

1. **MODELO DE INGRESOS**: publicidad (cíclico, sensible a consumo) / suscripción (recurrente, sticky) / tarifas reguladas (político) / mixto / transaccional
   → calidad y volatilidad del revenue, durabilidad del FCF

2. **ESTRUCTURA DE MERCADO**: ¿oligopolio coordinado?, ¿monopolio natural?, ¿fragmentado?
   → concentración (CR3), barreras de entrada (capex, licencias, espectro), poder de fijación de precios

3. **MAPA REGULATORIO**: quién regula, qué puede cambiar, historial de intervenciones
   → BCRA/CNV/ENACOM para AR; SEC/FCC/CFTC para US; riesgo regulatorio como variable de primera clase
   → Ej. Medicare→Walmart farma −9%, CLARITY Act→BTC +11.5%

4. **CAPA TECNOLÓGICA**: ¿disrupción activa? (análogo→cable→digital→streaming→IA)
   → capex defensivo vs ofensivo, ciclo de vida del sector

5. **REGLA DE VALORACIÓN**: el mismo EBITDA vale distinto según estructura — EBITDA en monopolio regulado ≠ EBITDA en mercado fragmentado

## Instrucciones para el agente

```
[SKILL — Análisis Sectorial Estructural — Bustamante]

Antes de valuar una empresa, caracterizar su INDUSTRIA:
1. MODELO DE INGRESOS: publicidad (cíclico, sensible a consumo) /
   suscripción (recurrente, sticky) / tarifas reguladas (político) / mixto
2. ESTRUCTURA: ¿oligopolio coordinado?, ¿monopolio natural?, ¿fragmentado?
   → concentración, barreras de entrada, poder de precios
3. MAPA REGULATORIO: quién regula, qué puede cambiar, historial de
   intervenciones (BCRA/CNV/encajes para AR; SEC/FCC/CFTC para US)
4. CAPA TECNOLÓGICA: ¿disrupción activa? ¿capex defensivo u ofensivo?
5. REGLA: el mismo resultado contable vale distinto según estructura —
   un EBITDA en monopolio regulado ≠ EBITDA en mercado fragmentado

PROHIBIDO: recomendar sin identificar primero el modelo de ingresos y
el regulador dominante del sector.

Conexión: inyectar este prompt cuando disparen ejecutarAnalisisIndustria y
ejecutarRankingValuacion en orquestador.ts. Sinergia con Elbaum Cap 10
(covenants + recupero) para telecom/cable AR.
Alimenta informe semanal: "Auditoría de titulares (anunciado vs firmado vs regulado)"
y "Conclusión por dinámicas estructurales (regulación como motor de precio)".
```

## Qué NO hacer
- NO crear funciones de cálculo ni tocar motores
- NO usar para señales cuantitativas puras
- Es capa de razonamiento, no capa numérica

## Indexación
Ya categorizado en KB RAG como "Financiacion y mercados - Bustamante" vía `scripts/build-kb-index.mjs`. Los agentes citan como contexto conceptual.

## Ejemplo de aplicación
TECO2 (Telecom Argentina): modelo suscripción + regulado (ENACOM), oligopolio coordinado (Telecom/Telefónica/Claro), riesgo regulatorio DNU 690/licencias 5G, capa fibra→5G, EBITDA con poder de precios regulado → valuación con descuento regulatorio vs. comparable US.
