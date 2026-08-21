<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Base de conocimiento: Sistema Financiero Argentino

Fuente: `sistema financiero trasnparencias.txt` (Instrumentos y Mercados Financieros,
FEF/IEAF adaptado para IAEF, transparencias 2022). Usar como dominio conceptual del proyecto.

## Componentes del sistema financiero
- Elementos básicos: **intermediarios financieros**, **activos financieros**, **mercados financieros**.
- Función: transferir recursos de depositantes a deudores; asignación eficiente + estabilidad económico-financiera.
- Ventajas de la intermediación: diversificación de riesgo y economías de escala (indivisibilidades, gestión, transacción).

## Intermediarios (Argentina)
- Entidades de crédito: Banco Central, Bancos (públicos/privados), Compañías Financieras (no captan depósitos a la vista), Cajas de Crédito (crédito a PyMEs/unipersonales).
- Otras instituciones: Mutuales (captación próxima al depósito); Fintech y proveedores no financieros.
- ESI (Empresas de Servicios de Inversión): reguladas por la **CNV** (mercado de capitales).

## Marco regulatorio
- **Ley de Entidades Financieras 21.526** y modificatorias. Autoridad de aplicación: **BCRA**.
- Operaciones prohibidas a entidades: explotar negocios por cuenta propia (salvo autorización), gravar bienes sin autorización, aceptar sus propias acciones en garantía, operar con vinculados en condiciones favorables.
- **Ley 19.359 (Régimen Penal Cambiario)**: fiscalización BCRA, MULC obligatorio.
- Comunicaciones BCRA: A (normativas), B (aclaratorias), C (informativas), D (confidenciales), P (prensa).

## BCRA
- Nace en 1935. Entidad autárquica. Misión: estabilidad monetaria, financiera, empleo y desarrollo con equidad social.
- Directorio: presidente, vicepresidente y 8 directores (PEN con acuerdo del Senado, mandato 6 años).
- **SEFyC** (Superintendencia de Entidades Financieras y Cambiarias): supervisión, califica entidades, aplica sanciones.
- Vulnerabilidades del sistema: descalce de plazos (activo largo / pasivo corto), contagio (corridas), alto leverage.

## Supervisión bancaria (3 enfoques)
1. **Disciplina de mercado**: Bonos (deuda subordinada 2% capital) y Calificación de riesgo (ambos suspendidos).
2. **Supervisión privada**: Auditoría externa + Régimen Informativo.
3. **Supervisión estatal**: calificación **CAMELBIG** — Capital, Activos, Mercado, Earning (rentabilidad), Liquidez, Business, Controles Internos, Gerencia. Notas: 1 satisfactorio → 5 severamente deficiente.

## Riesgos y regulación prudencial (3 pilares)
- Pilares: 1) Regulación prudencial (obligatoria), 2) Supervisión y control, 3) Disciplina de mercado.
- Riesgos: crediticio/contraparte, mercado, operacional, iliquidez, tasa de interés, regulatorio, estratégico, reputacional.
- **Efectivo mínimo**: reservas sobre depósitos y otras obligaciones (integrado en cuenta corriente BCRA).
- **Capitales mínimos**: RPC (Responsabilidad Patrimonial Computable) = PN básico + PN complementario (≤100% del básico) − deducibles. Exigencia = mayor entre (capital básico) y (suma de riesgos).
  - Riesgo crédito: `CRC = (k × 0,08 × APRc) + INC + IP` (k según CAMEL: 1→1,00; 2→1,03; 3→1,08; 4→1,13; 5→1,19).
  - Riesgo mercado: `RM = RT + RA + RTC + ROP` (tasas, acciones, tipo de cambio, opciones).
  - Riesgo operacional: `CRO = a × IB` promedio, a = 15%, ingresos brutos últimos 36 meses.
- **Clasificación de deudores**: cartera comercial (capacidad de pago/flujo), consumo y asimilable (cumplimiento en pago).
- **NIIF 9** (vigencia 2020): pérdida crediticia esperada, criterio dual (12 meses vs vida del activo): `PE = PD × EAD × LGD`.
- **Grandes exposiciones**: sin garantías 15% RPC; con garantías 25%; entidades financieras 25%. **Graduación**: margen básico 100% RPC del cliente, complementario 200% (sin superar 2,5% RPC de la entidad).

## SEDESA / Fondo de Garantía de Depósitos
- Creado por Decreto 540/95. Obligatorio, oneroso, preventivo, limitado. Fiduciario: fideicomiso de entidades financieras + BCRA (una acción).
- Aporte normal: 0,015% promedio mensual de depósitos (pesos y ME); excluidas cuentas oficiales del BNA.
- Cobertura: capital + intereses hasta **$1,5 MM** por persona (acumulación entre cuentas); cuentas conjuntas se distribuyen proporcionalmente.
- No cubiertos: depósitos de EEFF entre sí, personas vinculadas, tasas superiores a referencia, endosos, incentivos diferenciales.

## Política monetaria
- Objetivos: crecimiento/pleno empleo, control de precios, moderar ciclos. Variable instrumental correlacionada con objetivo final.
- Instrumentos BCRA: administración de liquidez, sendero de tasa de interés, encajes, redescuentos (hasta 100% del PN por iliquidez transitoria).
- BCE: objetivo único estabilidad de precios (~2%), diseño centralizado/ejecución descentralizada, sistema TARGET. FED: mandato múltiple basado en indicadores.

## Tasas de referencia
- **BADLAR**: depósitos > $1MM Argentina; referencia para bonos a tasa variable.
- **EURIBOR** (oferta interbancaria euro, metodología híbrida EMMI), **EONIA** (reemplazado por **€STR** + 8,5 pbs desde 2/10/2019; dejó de publicarse 3/1/2022), **LIBOR** (media recortada 25% extremos), MIDSWAP (IRS), Eurepo (descontinuado 2014).

## Estructura temporal de tipos de interés (ETTI)
- Curvas: spot (contado), forward (implícitos), función de descuento.
- Formas: normal/creciente, plana (anómala), invertida (expectativas de baja de tipos), oscilante/con jorobas (incertidumbre).

## Mercados monetarios
- Financiación a corto plazo (Argentina ≤ 1 año). Mercado interbancario de depósitos: operaciones entre entidades y con el BCRA.
- Depósitos no transferibles (irreversibles hasta vencimiento, mercado primario) vs transferibles (cedibles antes del vencimiento). Activos cupón cero, capitalización simple.
- Contado ≤ 5 días hábiles entre contratación y fecha valor; plazo si > 5 días.
- Funciones de los bancos: sistema de pagos (riesgo liquidez) y transformación de activos corto→largo (riesgo liquidez y solvencia).
