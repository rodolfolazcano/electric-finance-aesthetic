import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Sparkles,
  ClipboardList,
  ShieldCheck,
  Compass,
  TrendingUp,
  Info,
  Check,
} from "lucide-react";
import { requestOpenChat } from "@/lib/chat-open";
import { guardarPerfilInversor } from "@/lib/perfil-inversor";

type Opcion = { id: string; label: string; puntos: number };
type Pregunta = {
  pregunta: string;
  ayuda?: string;
  opciones: Opcion[];
};

const PREGUNTAS: Pregunta[] = [
  {
    pregunta: "¿Cuál es tu rango de edad?",
    opciones: [
      { id: "e1", label: "Mayor de 65 años", puntos: 0 },
      { id: "e2", label: "Entre 46 y 65 años", puntos: 1 },
      { id: "e3", label: "Entre 26 y 45 años", puntos: 2 },
      { id: "e4", label: "Menor de 26 años", puntos: 3 },
    ],
  },
  {
    pregunta: "¿Qué plazo pensás para tus inversiones?",
    ayuda: "Plazo esperado antes de necesitar el dinero.",
    opciones: [
      { id: "p1", label: "Menos de 1 año", puntos: 0 },
      { id: "p2", label: "Entre 1 y 3 años", puntos: 1 },
      { id: "p3", label: "Entre 3 y 5 años", puntos: 2 },
      { id: "p4", label: "Más de 5 años", puntos: 3 },
    ],
  },
  {
    pregunta: "¿Cuál es tu objetivo principal?",
    opciones: [
      { id: "o1", label: "Preservar el capital y tener liquidez", puntos: 0 },
      { id: "o2", label: "Generar ingresos regulares", puntos: 1 },
      { id: "o3", label: "Hacer crecer mi dinero a mediano plazo", puntos: 2 },
      { id: "o4", label: "Maximizar la rentabilidad a largo plazo", puntos: 3 },
    ],
  },
  {
    pregunta: "¿Cuál es tu nivel de conocimiento de los instrumentos?",
    opciones: [
      { id: "n1", label: "Nulo: nunca operé", puntos: 0 },
      { id: "n2", label: "Básico: entendés conceptos generales", puntos: 1 },
      { id: "n3", label: "Intermedio: ya operaste alguna vez", puntos: 2 },
      { id: "n4", label: "Avanzado: operás habitualmente", puntos: 3 },
    ],
  },
  {
    pregunta: "¿En qué instrumentos invertiste antes?",
    opciones: [
      { id: "i1", label: "Nunca invertí", puntos: 0 },
      { id: "i2", label: "Plazo fijo o money market", puntos: 1 },
      { id: "i3", label: "Bonos y/o fondos comunes de inversión", puntos: 2 },
      { id: "i4", label: "Acciones y/o CEDEARs", puntos: 3 },
    ],
  },
  {
    pregunta: "¿Qué porcentaje de tu patrimonio dedicarías a invertir?",
    opciones: [
      { id: "x1", label: "Menos del 10%", puntos: 0 },
      { id: "x2", label: "Entre 10% y 30%", puntos: 1 },
      { id: "x3", label: "Entre 30% y 50%", puntos: 2 },
      { id: "x4", label: "Más del 50%", puntos: 3 },
    ],
  },
  {
    pregunta: "Tu capacidad de ahorro mensual es…",
    opciones: [
      { id: "a1", label: "No tengo ahorro estable", puntos: 0 },
      { id: "a2", label: "Ahorro de forma esporádica", puntos: 1 },
      { id: "a3", label: "Ahorro todos los meses una parte", puntos: 2 },
      { id: "a4", label: "Ahorro significativo y constante", puntos: 3 },
    ],
  },
  {
    pregunta: "Si tu cartera bajara 20% en un mes, ¿qué harías?",
    opciones: [
      { id: "r1", label: "Vendería todo lo antes posible", puntos: 0 },
      { id: "r2", label: "Vendería una parte", puntos: 1 },
      { id: "r3", label: "Mantendría la posición", puntos: 2 },
      { id: "r4", label: "Aprovecharía para comprar más", puntos: 3 },
    ],
  },
];

type Producto = { nombre: string; descripcion: string };
type Perfil = {
  id: "conservador" | "moderado" | "agresivo";
  nombre: string;
  detalle: string;
  composicion: { nombre: string; porcentaje: number }[];
  productos: Producto[];
};

const PERFILES: Perfil[] = [
  {
    id: "conservador",
    nombre: "Conservador",
    detalle:
      "Priorizás cuidar el capital por sobre la rentabilidad. Te convienen instrumentos de renta fija de corto plazo y baja volatilidad, con liquidez para cuando los necesites.",
    composicion: [
      { nombre: "Money market", porcentaje: 40 },
      { nombre: "Letras del Tesoro", porcentaje: 35 },
      { nombre: "Cauciones bursátiles", porcentaje: 25 },
    ],
    productos: [
      {
        nombre: "Money market",
        descripcion:
          "Fondos de liquidez inmediata que invierten en plazos fijos y pases. Muy baja volatilidad, pensados para el corto plazo.",
      },
      {
        nombre: "Letras del Tesoro",
        descripcion:
          "Deuda de corto plazo del Estado que se compra a descuento. Renta fija, riesgo bajo.",
      },
      {
        nombre: "Cauciones bursátiles",
        descripcion:
          "Prestás tu dinero al mercado con un título de garantía y cobrás un interés por un plazo corto y conocido.",
      },
      {
        nombre: "Bonos soberanos",
        descripcion:
          "Deuda del Estado Nacional (en pesos o dólares) que paga intereses. Para quien busca ingresos con menor riesgo.",
      },
    ],
  },
  {
    id: "moderado",
    nombre: "Moderado",
    detalle:
      "Buscás equilibrio entre crecimiento y seguridad. Podés combinar renta fija con una parte en acciones y CEDEARs para acompañar el crecimiento, asumiendo algo más de volatilidad.",
    composicion: [
      { nombre: "Bonos soberanos", porcentaje: 35 },
      { nombre: "Money market", porcentaje: 20 },
      { nombre: "Acciones locales", porcentaje: 25 },
      { nombre: "CEDEARs", porcentaje: 20 },
    ],
    productos: [
      {
        nombre: "Bonos soberanos",
        descripcion:
          "Deuda del Estado Nacional (en pesos o dólares) que paga intereses y amortización de forma periódica.",
      },
      {
        nombre: "Money market",
        descripcion:
          "Fondos de liquidez inmediata para la parte que querés tener disponible en todo momento.",
      },
      {
        nombre: "Acciones locales (BCBA)",
        descripcion:
          "Participación en empresas que cotizan en la Bolsa de Buenos Aires (BYMA). Más volatilidad, más potencial de rendimiento.",
      },
      {
        nombre: "CEDEARs",
        descripcion:
          "Certificados que representan acciones de empresas extranjeras, operados en pesos dentro de la Bolsa local.",
      },
    ],
  },
  {
    id: "agresivo",
    nombre: "Agresivo",
    detalle:
      "Tenés tolerancia a la volatilidad y un horizonte largo. Podés inclinar tu cartera hacia acciones locales e internacionales, CEDEARs y opciones para maximizar el rendimiento de largo plazo.",
    composicion: [
      { nombre: "Acciones locales", porcentaje: 35 },
      { nombre: "CEDEARs", porcentaje: 30 },
      { nombre: "ADRs / Acciones EE.UU.", porcentaje: 20 },
      { nombre: "Bonos soberanos", porcentaje: 15 },
    ],
    productos: [
      {
        nombre: "Acciones locales (BCBA)",
        descripcion:
          "Papeles de empresas que cotizan en BYMA. Mayor potencial de rendimiento a cambio de mayor volatilidad.",
      },
      {
        nombre: "CEDEARs",
        descripcion:
          "Certificados que replican acciones de gigantes globales (Apple, Google, etc.) en la Bolsa local y en pesos.",
      },
      {
        nombre: "ADRs / Acciones internacionales",
        descripcion:
          "Acciones que cotizan en dólares en mercados externos, para diversificar por fuera de la economía local.",
      },
      {
        nombre: "Opciones",
        descripcion:
          "Contratos que dan el derecho a comprar o vender un activo a un precio y fecha. Riesgo y conocimiento requerido altos.",
      },
    ],
  },
];

function calcularPerfil(puntos: number): Perfil {
  if (puntos <= 8) return PERFILES[0]!;
  if (puntos <= 16) return PERFILES[1]!;
  return PERFILES[2]!;
}

const ICONOS: Record<Perfil["id"], typeof ShieldCheck> = {
  conservador: ShieldCheck,
  moderado: Compass,
  agresivo: TrendingUp,
};

export function TestInversor() {
  const [etapa, setEtapa] = useState<"inicio" | "test" | "resultado">("inicio");
  const [actual, setActual] = useState(0);
  const [respuestas, setRespuestas] = useState<number[]>(
    Array.from({ length: PREGUNTAS.length }, () => -1),
  );
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  const responder = (idxOpcion: number) => {
    setRespuestas((prev) => prev.map((v, i) => (i === actual ? idxOpcion : v)));
    if (actual < PREGUNTAS.length - 1) {
      setTimeout(() => setActual((a) => a + 1), 180);
    }
  };

  const reiniciar = () => {
    setEtapa("inicio");
    setActual(0);
    setRespuestas(Array.from({ length: PREGUNTAS.length }, () => -1));
    setPerfil(null);
  };

  const verPerfil = () => {
    const pts = respuestas.reduce((sum, idxOpcion, iq) => {
      if (idxOpcion < 0) return sum;
      const op = PREGUNTAS[iq]!.opciones[idxOpcion];
      if (!op) return sum;
      return sum + op.puntos;
    }, 0);
    const resultado = calcularPerfil(pts);
    setPerfil(resultado);
    setEtapa("resultado");
    guardarPerfilInversor({
      id: resultado.id,
      nombre: resultado.nombre as "Conservador" | "Moderado" | "Agresivo",
    });
  };

  const preguntasRespondidas = respuestas.filter((r) => r >= 0).length;

  const preguntarAI = (texto: string) => requestOpenChat(texto);

  return (
    <div className="mx-auto mt-14 max-w-3xl">
      <div className="surface-card rounded-[2rem] p-6 sm:p-10">
        {etapa === "inicio" && (
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <ClipboardList className="h-6 w-6" />
            </span>
            <h3 className="mt-6 font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold">
              Test del Inversor
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground lg:text-[16px]">
              8 preguntas para orientar tu perfil de riesgo y mostrarte qué productos suelen
              adaptarse mejor a vos, con una explicación de cada uno. El resultado es
              <strong className="text-primary"> orientativo</strong>: la definición final siempre la
              tomás vos junto a tu asesor.
            </p>
            <button
              onClick={() => setEtapa("test")}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-[14px] font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-primary/90"
            >
              Comenzar el test
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="mt-4 text-[12px] text-muted-foreground">
              No pide datos personales ni tarda más de 2 minutos.
            </p>
          </div>
        )}

        {etapa === "test" && (
          <div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Pregunta {actual + 1} de {PREGUNTAS.length}
              </span>
              <button
                onClick={reiniciar}
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-primary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Volver a empezar
              </button>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${((actual + 1) / PREGUNTAS.length) * 100}%` }}
              />
            </div>

            <div key={actual} className="mt-8">
              <h3 className="font-display text-[clamp(1.35rem,2.8vw,1.8rem)] font-semibold leading-snug">
                {PREGUNTAS[actual]!.pregunta}
              </h3>
              {PREGUNTAS[actual]!.ayuda && (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  {PREGUNTAS[actual]!.ayuda}
                </p>
              )}
              <div className="mt-6 space-y-2.5">
                {PREGUNTAS[actual]!.opciones.map((op, idx) => {
                  const elegida = respuestas[actual] === idx;
                  return (
                    <button
                      key={op.id}
                      onClick={() => responder(idx)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left text-[14.5px] transition-all ${
                        elegida
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-primary/[0.05]"
                      }`}
                    >
                      {op.label}
                      {elegida && <Check className="h-4 w-4 flex-none text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={() => setActual((a) => Math.max(0, a - 1))}
                disabled={actual === 0}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" />
                Anterior
              </button>
              {actual === PREGUNTAS.length - 1 ? (
                <button
                  onClick={verPerfil}
                  disabled={preguntasRespondidas < PREGUNTAS.length}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-[13.5px] font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-40"
                >
                  Ver mi perfil
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <span className="text-[13px] text-muted-foreground">
                  {preguntasRespondidas}/{PREGUNTAS.length} respondidas
                </span>
              )}
            </div>
          </div>
        )}

        {etapa === "resultado" && perfil && (
          <div className="text-center">
            {(() => {
              const Icon = ICONOS[perfil.id];
              return (
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold">
                  <Icon className="h-6 w-6" />
                </span>
              );
            })()}
            <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-gold">
              Tu perfil sugerido
            </p>
            <h3 className="mt-2 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold">
              {perfil.nombre}
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground lg:text-[16px]">
              {perfil.detalle}
            </p>

            <div className="mt-8 text-left">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Composición sugerida
              </p>
              <div className="mt-4 space-y-3">
                {perfil.composicion.map((c) => (
                  <div key={c.nombre}>
                    <div className="flex items-center justify-between text-[13.5px]">
                      <span className="font-semibold">{c.nombre}</span>
                      <span className="font-semibold text-primary">{c.porcentaje}%</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${c.porcentaje}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 text-left">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Productos que suelen adaptarse a tu perfil
              </p>
              <div className="mt-4 space-y-3">
                {perfil.productos.map((p) => (
                  <div key={p.nombre} className="rounded-xl border border-border/70 px-4 py-3.5">
                    <p className="text-[14px] font-semibold text-primary">{p.nombre}</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
                      {p.descripcion}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() =>
                  preguntarAI(
                    `Mi perfil de inversor resultó **${perfil.nombre}**. ¿Me explicás con más detalle los productos sugeridos (${perfil.composicion.map((c) => c.nombre).join(", ")}) y por qué son los más adaptados a mi perfil?`,
                  )
                }
                className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-6 py-3 text-[14px] font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/15"
              >
                <Sparkles className="h-4 w-4" />
                Preguntarle a IA
              </button>
              <button
                onClick={reiniciar}
                className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-[14px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <RotateCcw className="h-4 w-4" />
                Rehacer el test
              </button>
            </div>

            <p className="mt-6 flex items-start justify-center gap-2 text-[12px] leading-snug text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-none" />
              Resultado orientativo basado en tus respuestas. No constituye recomendación de
              inversión ni reemplaza el asesoramiento personalizado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
