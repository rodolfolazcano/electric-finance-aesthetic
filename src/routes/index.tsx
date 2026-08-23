import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Plus,
  Menu,
  X,
  ExternalLink,
  Layers,
  Scale,
  Phone,
  Linkedin,
  ArrowRight,
  TrendingUp,
  Gauge,
  Activity,
  LineChart,
  KeyRound,
} from "lucide-react";
import bgImage from "@/assets/bg-skyline.jpg";
import balanzLogo from "@/assets/balanz.png";
import inviuLogo from "@/assets/inviu.png";
import iolLogo from "@/assets/iol.png";
import retratoCintia from "@/assets/cintia-boos.png";
import { SugerenciasSeccion } from "@/components/SugerenciasSeccion";
import { TestInversor } from "@/components/TestInversor";
import { IOLLoginButton } from "@/components/shared/IOLLoginButton";
import { ICONOS_INSTRUMENTO, type NombreInstrumento } from "@/components/instrument-icons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  leerPerfilInversor,
  suscribirPerfilInversor,
  type PerfilResultante,
} from "@/lib/perfil-inversor";

const WHATSAPP =
  "https://wa.me/541162355944?text=Hola%20Cintia%2C%20quiero%20asesoramiento%20sobre%20inversiones";
const CNV_REGISTRO =
  "https://www.cnv.gov.ar/SitioWeb/RegistrosPublicos/DetallesRegistrosPublicos/105037?tipoEntidadId=2&tipoAgente=302";
const LINKEDIN = "https://www.linkedin.com/in/cintiaboos/";

// Contenido real de cada sección, que el agente IA recibe para razonar y
// proponer preguntas en tiempo real al visitante al pasar el mouse.
function contenidoInicio(): string {
  return `Hero del sitio de Cintia Boos, Agente Productora CNV Mat. N° 2192: "Tu norte financiero, con criterio". Asesoramiento patrimonial en Buenos Aires, Argentina: criterio, no datos sueltos, sin costo directo para el cliente (Ley 26.831). Opera con brokers ALyC registrados en la CNV. Credenciales visibles: CNV N° 2192 (matrícula verificable en el registro público), 3 brokers habilitados, asesoramiento online.`;
}

function contenidoTest(): string {
  return `Sección Perfil: "Conozca su perfil de inversor". Test del Inversor: 8 preguntas, 2 minutos, sin datos personales. Resultado orientativo (Conservador, Moderado o Agresivo) que orienta qué productos suelen adaptarse mejor a cada perfil de riesgo; la definición final la toma el cliente junto a su asesor.`;
}

function contenidoHerramientas(): string {
  return `Sección Herramientas: "Probá el panel de análisis financiero". Dashboard interactivo con datos en vivo de Yahoo Finance, IOL, BCRA, ArgentinaDatos y CriptoYa. Cuatro módulos: Contexto (macro argentino, intermercado y ciclo económico), Análisis (semáforo técnico + fundamental por activo), Cuantitativo (optimizador de carteras con 5 estrategias, riesgo por distribución de retornos, CAPM con auto-benchmark) y Sectores (performance, matriz de correlaciones, valuación relativa y oportunidades del día). Para analizar el portafolio propio, el visitante inicia sesión con su usuario y contraseña de InvertirOnline (IOL) desde el botón IOL del panel; las credenciales se procesan en el servidor y no se guardan en el sitio. Acceso libre desde el botón "Abrir Herramientas".`;
}

function contenidoInstrumentos(
  lista: Instrumento[],
  perfil: PerfilResultante | null,
  verTodos: boolean,
): string {
  const encabezado = perfil
    ? verTodos
      ? `Catálogo completo de instrumentos que se operan en cuenta comitente en un ALyC registrado en CNV.`
      : `El visitante completó el Test del Inversor y tiene perfil ${perfil.nombre}: se muestran los instrumentos que suelen adaptarse a ese perfil.`
    : `Catálogo de instrumentos que se operan en cuenta comitente en un ALyC registrado en CNV. Se adapta automáticamente al perfil de riesgo del visitante si completa el Test del Inversor.`;
  const items = lista.map(
    (i) => `- ${i.nombre} (perfil ${i.perfil}): ${i.que} ${i.moneda}. ${i.porque}. ${i.paraQuien}`,
  );
  return `${encabezado}\n\n${items.join("\n")}`;
}

function contenidoBrokers(): string {
  return `Sección Brokers: "Opero a través de". Toda operación se ejecuta en la cuenta comitente del cliente, en el bróker registrado en CNV que elija. Brokers habilitados (ALyC Integral): ${BROKERS.map(
    (b) => `${b.name} — ${b.mat}`,
  ).join("; ")}.`;
}

function contenidoPreguntas(): string {
  return `Sección de preguntas frecuentes:\n${FAQ.map((f) => `P: ${f.q}\nR: ${f.a}`).join("\n\n")}`;
}

function contenidoAlianzas(): string {
  return `Sección Alianzas ("Profesionales de confianza"). Profesionales terceros independientes, ajenos a la actividad regulada por la CNV:
- Franco Lamas — Desarrollo de software (Presencia digital). Landing pages, sitios completos y apps a medida, con hosting incluido los primeros meses. Developer · DevOps · SRE.
- Estudio Jurídico Dr. Pupi Cervio — Recupero de criptoestafas. Representación penal, rastreo forense de fondos y billeteras, presentación de la denuncia y seguimiento judicial. Sitio oficial: pupicervio.com.`;
}

// Pregunta de respaldo si el agente no responde con sugerencias (fallback mínimo).
const FALLBACK_SECCION = {
  inicio:
    "¿Cómo funciona el asesoramiento de Cintia Boos, Agente Productora CNV, y cómo se empieza?",
  "test-inversor":
    "¿Cómo puedo conocer mi perfil de inversor y qué productos suelen adaptarse mejor a cada perfil de riesgo?",
  herramientas:
    "¿Qué herramientas de análisis financiero puedo probar y cómo conecto mi cuenta de IOL para analizar mi portafolio?",
  instrumentos:
    "¿Qué instrumentos se pueden operar en el mercado de capitales argentino y cómo elegirlos según perfil y horizonte?",
  brokers:
    "¿Qué es un ALyC registrado en la CNV y en qué debería fijarme al elegir un bróker para operar?",
  preguntas: "Respondeme las dudas más comunes antes de empezar a invertir.",
  alianzas: "Contame sobre los profesionales aliados del sitio y cómo contactarlos.",
} as const;

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Cintia Boos · Agente Productora CNV Mat. N° 2192" },
      {
        name: "description",
        content:
          "Asesoramiento patrimonial personalizado en Buenos Aires. Agente Productora registrada en CNV, Mat. N° 2192. Operá con brokers ALyC habilitados.",
      },
      { property: "og:title", content: "Cintia Boos · Agente Productora CNV Mat. N° 2192" },
      {
        property: "og:description",
        content: "Asesoramiento patrimonial personalizado en Buenos Aires. Matrícula CNV N° 2192.",
      },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FinancialService",
          name: "Cintia Boos · Agente Productora CNV",
          areaServed: "Buenos Aires, Argentina",
          description:
            "Asesoramiento patrimonial personalizado. Agente Productora registrada en CNV, Matrícula N° 2192.",
        }),
      },
    ],
  }),
});

const NAV = [
  { id: "inicio", label: "Inicio" },
  { id: "test-inversor", label: "Perfil" },
  { id: "herramientas", label: "Herramientas" },
  { id: "instrumentos", label: "Instrumentos" },
  { id: "brokers", label: "Brokers" },
  { id: "preguntas", label: "Preguntas" },
  { id: "alianzas", label: "Alianzas" },
];

const CREDIBILIDAD = [
  {
    value: "CNV N° 2192",
    label: "Matrícula verificable en el registro público de la CNV",
    link: CNV_REGISTRO,
    linkLabel: "Verificar el registro",
  },
  { value: "3 ALyC", label: "Brokers de primera línea para operar su cuenta" },
  { value: "Sin costo", label: "Para usted · Conforme Ley 26.831" },
  { value: "100% online", label: "Buenos Aires · Argentina y el exterior" },
];

type PerfilRiesgo = "Conservador" | "Moderado" | "Agresivo";

type Instrumento = {
  nombre: NombreInstrumento;
  que: string;
  moneda: string;
  perfil: PerfilRiesgo;
  verificar?: boolean;
  porque: string;
  paraQuien: string;
};

const INSTRUMENTOS: Instrumento[] = [
  {
    nombre: "Bonos soberanos",
    que: "Deuda emitida por el Estado Nacional.",
    moneda: "Pesos o dólares · mercado local",
    perfil: "Moderado",
    verificar: true,
    porque: "El riesgo depende de la ley de emisión, la moneda, el plazo y el contexto macro.",
    paraQuien: "Quien busca ingresos de un emisor soberano, con esa salvedad.",
  },
  {
    nombre: "Obligaciones negociables",
    que: "Deuda emitida por empresas privadas.",
    moneda: "Pesos o dólares · mercado local",
    perfil: "Moderado",
    verificar: true,
    porque: "El riesgo depende de la calidad crediticia del emisor.",
    paraQuien: "Quien busca renta fija corporativa más allá del Estado.",
  },
  {
    nombre: "Acciones locales (BCBA)",
    que: "Participación en empresas que cotizan en BYMA.",
    moneda: "Pesos · mercado local",
    perfil: "Agresivo",
    porque: "Renta variable: el precio sigue al mercado y a la empresa.",
    paraQuien: "Quien tiene horizonte largo y tolerancia a la volatilidad.",
  },
  {
    nombre: "Acciones internacionales",
    que: "Acciones de empresas que cotizan en mercados externos.",
    moneda: "Dólares · NYSE / Nasdaq",
    perfil: "Agresivo",
    porque: "Renta variable internacional, con riesgo de mercado global.",
    paraQuien: "Quien quiere diversificar fuera de la economía argentina.",
  },
  {
    nombre: "CEDEARs",
    que: "Certificados que representan acciones extranjeras, en pesos.",
    moneda: "Pesos · mercado local",
    perfil: "Agresivo",
    porque: "Replica el riesgo del subyacente y suma riesgo de moneda y de mercado local.",
    paraQuien: "Quien quiere exposición global operando en la bolsa local.",
  },
  {
    nombre: "ADRs",
    que: "Recibos de depósito de acciones de empresas extranjeras.",
    moneda: "Dólares · mercados externos",
    perfil: "Agresivo",
    porque: "Mismo riesgo del subyacente, en moneda y mercado externos.",
    paraQuien: "Quien busca renta variable en dólares en mercados externos.",
  },
  {
    nombre: "ETFs",
    que: "Canastas de activos que se operan como una acción.",
    moneda: "Pesos o dólares · CEDEAR local o mercado externo",
    perfil: "Moderado",
    verificar: true,
    porque: "Diversifica, pero el riesgo sigue al activo que replica.",
    paraQuien: "Quien quiere diversificar con un solo instrumento.",
  },
  {
    nombre: "Letras del Tesoro",
    que: "Deuda de corto plazo del Estado, emitida a descuento.",
    moneda: "Pesos o dólares · mercado local",
    perfil: "Conservador",
    verificar: true,
    porque: "El corto plazo reduce el riesgo de tasa; el riesgo depende del tipo y la emisión.",
    paraQuien: "Quien quiere preservar capital en el corto plazo.",
  },
  {
    nombre: "Money market",
    que: "Fondos de inversión de liquidez inmediata.",
    moneda: "Pesos o dólares · FCI local",
    perfil: "Conservador",
    porque: "Cartera de corto plazo y alta liquidez, baja volatilidad.",
    paraQuien: "Quien necesita tener el dinero disponible en todo momento.",
  },
  {
    nombre: "Cauciones bursátiles",
    que: "Préstamo garantizado: el colocador presta fondos; el tomador los recibe dejando títulos en garantía.",
    moneda: "Pesos · mercado local (BYMA)",
    perfil: "Conservador",
    porque: "Como colocador, el préstamo está garantizado con títulos, con plazo y tasa conocidos.",
    paraQuien: "Quien busca renta fija de corto plazo con garantía.",
  },
  {
    nombre: "Cheques de pago diferido",
    que: "Cheques corporativos que se cobran a futuro.",
    moneda: "Pesos · segmento PyME",
    perfil: "Moderado",
    verificar: true,
    porque: "Con aval de una SGR el riesgo se modera; sin aval, depende del emisor.",
    paraQuien: "Quien busca renta fija corporativa y entiende el riesgo del emisor.",
  },
  {
    nombre: "Opciones",
    que: "Derecho, no obligación, de comprar o vender un activo.",
    moneda: "Pesos o dólares · mercado local",
    perfil: "Agresivo",
    porque: "Apalancamiento y riesgo de pérdida total; requiere conocimiento previo.",
    paraQuien: "Solo para operadores con experiencia.",
  },
];

const BROKERS = [
  {
    name: "Balanz",
    logo: balanzLogo,
    mat: "ALyC Integral · Mat. CNV N° 210",
    url: "https://balanz.com/",
  },
  {
    name: "Inviu",
    logo: inviuLogo,
    mat: "ALyC Integral · Mat. CNV N° 205",
    url: "https://inviu.lat/ar/",
  },
  {
    name: "IOL invertironline",
    logo: iolLogo,
    mat: "ALyC Integral · Mat. CNV N° 273",
    url: "https://www.invertironline.com/",
  },
];

const FAQ = [
  {
    q: "¿Cuánto cuesta este servicio?",
    a: "No tiene costo directo para usted. La actividad se remunera a través del bróker; nunca se percibe un cargo directo sobre su cuenta.",
  },
  {
    q: "¿Se requiere un capital mínimo?",
    a: "No hay un monto mínimo. Se comienza con el capital disponible y el plan se ajusta a su evolución.",
  },
  {
    q: "¿Qué sucede si no tengo conocimientos de inversión?",
    a: "El punto de partida es un diagnóstico. Partimos de cero, sin jerga innecesaria y sin presiones.",
  },
  {
    q: "¿Es seguro operar con un ALyC regulado?",
    a: "Su dinero permanece en su cuenta comitente, en el bróker registrado en la CNV que usted elija.",
  },
];

const CONTAINER = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";
const SECTION = "scroll-mt-24 py-14 lg:py-20";

function RiskChip({ perfil, verificar }: { perfil: PerfilRiesgo; verificar?: boolean }) {
  const tone =
    perfil === "Conservador"
      ? "text-emerald-400 ring-emerald-400/30 bg-emerald-400/10"
      : perfil === "Moderado"
        ? "text-gold ring-gold/40 bg-gold/10"
        : "text-rose-400 ring-rose-400/30 bg-rose-400/10";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ring-1 ${tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {perfil}
      {verificar === true && (
        <span className="normal-case tracking-normal text-muted-foreground">· VERIFICAR</span>
      )}
    </span>
  );
}

function SectionHeading({
  label,
  title,
  lead,
}: {
  label: string;
  title: string;
  lead?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="eyebrow">{label}</p>
      <h2 className="mt-4 font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight">
        {title}
      </h2>
      {lead && (
        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground lg:text-[19px]">
          {lead}
        </p>
      )}
    </div>
  );
}

function TooltipTerm({ term, tip }: { term: string; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted decoration-gold/60 underline-offset-4">
          {term}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function WhatsAppLink({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function Index() {
  const [active, setActive] = useState("inicio");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [perfilInv, setPerfilInv] = useState<PerfilResultante | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    setPerfilInv(leerPerfilInversor());
    return suscribirPerfilInversor((p) => {
      setPerfilInv(p);
      if (!p) setVerTodos(false);
    });
  }, []);

  const instrumentosMostrados =
    perfilInv && !verTodos
      ? INSTRUMENTOS.filter((i) => i.perfil === perfilInv.nombre)
      : INSTRUMENTOS;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const ids = NAV.map((n) => n.id);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0.1, 0.4] },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <TooltipProvider delayDuration={120}>
      <div className="relative min-h-screen">
        {/* ============ FONDO GLOBAL ============ */}
        <div aria-hidden className="fixed inset-0 -z-10">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${bgImage})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(56rem 34rem at 82% 8%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 62%), radial-gradient(46rem 30rem at -5% 92%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 60%), linear-gradient(180deg, rgba(6,9,18,0.72) 0%, rgba(6,9,18,0.45) 45%, rgba(6,9,18,0.62) 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(56rem 34rem at 82% 8%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 62%)",
            }}
          />
        </div>

        {/* ============ HEADER ============ */}
        <header
          className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
            scrolled || menuOpen
              ? "border-b border-border/60 bg-background/55 backdrop-blur-xl"
              : "border-b border-transparent bg-transparent"
          }`}
        >
          <div
            className={`${CONTAINER} flex items-center justify-between gap-4 py-4 transition-all ${
              scrolled ? "py-3" : ""
            }`}
          >
            <a href="#inicio" className="flex shrink-0 items-center gap-2.5">
              <span className="h-9 w-9 overflow-hidden rounded-full border border-primary/40">
                <img src={retratoCintia} alt="Cintia Boos" className="h-full w-full object-cover" />
              </span>
              <span className="font-display text-[17px] font-semibold leading-none">
                Cintia <em className="italic text-primary">Boos</em>
              </span>
            </a>

            <nav className="hidden items-center gap-8 md:flex" aria-label="Principal">
              {NAV.map((n) => (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  className={`text-[11px] uppercase tracking-[0.16em] transition-colors ${
                    active === n.id
                      ? "text-primary underline decoration-primary decoration-2 underline-offset-[22px]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {n.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center">
                <IOLLoginButton />
              </div>
              <WhatsAppLink className="hidden items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex">
                Consultar por WhatsApp
              </WhatsAppLink>
              <WhatsAppLink
                aria-label="Consultar por WhatsApp"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 sm:hidden"
              >
                <Phone className="h-4 w-4" />
              </WhatsAppLink>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
                aria-expanded={menuOpen}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground md:hidden"
              >
                {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {menuOpen && (
            <nav className="border-t border-border/60 bg-background/70 px-5 pb-6 pt-3 backdrop-blur-xl md:hidden">
              <ul className="flex flex-col">
                {NAV.map((n) => (
                  <li key={n.id}>
                    <a
                      href={`#${n.id}`}
                      onClick={() => setMenuOpen(false)}
                      className={`block py-3 text-[13px] uppercase tracking-[0.16em] transition-colors ${
                        active === n.id ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {n.label}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-3 border-t border-border/20 pt-4">
                <IOLLoginButton />
                <span className="text-[11px] text-muted-foreground">IOL — sesión global</span>
              </div>
              <WhatsAppLink className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-[13px] font-semibold text-primary-foreground">
                Consultar por WhatsApp
              </WhatsAppLink>
            </nav>
          )}
        </header>

        {/* ============ HERO ============ */}
        <SugerenciasSeccion
          id="inicio"
          label="Inicio"
          contenido={contenidoInicio()}
          fallbackPregunta={FALLBACK_SECCION.inicio}
        >
          <section id="inicio" className="relative flex min-h-[88svh] items-center overflow-hidden">
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(56rem 34rem at 82% 8%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 62%), radial-gradient(46rem 30rem at -5% 92%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 60%), linear-gradient(180deg, rgba(6,9,18,0.72) 0%, rgba(6,9,18,0.45) 45%, rgba(6,9,18,0.62) 100%)",
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(52rem 30rem at 78% 30%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 65%)",
              }}
            />

            <div className={`${CONTAINER} relative pt-28 pb-16`}>
              <p className="flex items-center gap-2 eyebrow">
                <ShieldCheck className="h-4 w-4" />
                Agente Productora CNV · Mat. N° 2192
              </p>

              <h1 className="mt-6 font-display">
                <span className="block text-[clamp(3rem,8vw,5.5rem)] font-semibold leading-[1.02] tracking-tight chrome-text">
                  Su capital, con estrategia
                </span>
                <span className="mt-3 block text-[clamp(1.35rem,3.2vw,2.2rem)] font-medium leading-tight tracking-tight text-primary">
                  Cintia Boos · Asesoramiento patrimonial con criterio
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-muted-foreground lg:text-[19px]">
                Invertir no es adivinar el próximo movimiento del mercado: es tener un plan que
                resista los que no se pueden anticipar. Diseñamos ese plan a su medida, en su cuenta
                comitente y con brokers regulados por la CNV. Sin costo directo para usted.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <WhatsAppLink className="btn-primary inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-[14px] font-semibold">
                  Quiero mi diagnóstico gratuito
                  <ArrowRight className="h-4 w-4" />
                </WhatsAppLink>
                <span className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
                  Respuesta el mismo día · Sin compromiso
                </span>
              </div>
              <div aria-hidden className="electric-line mt-14 max-w-2xl" />
            </div>
          </section>
        </SugerenciasSeccion>

        {/* ============ BARRA DE CREDIBILIDAD ============ */}
        <section className="border-y border-border/50 bg-background/20 backdrop-blur-sm">
          <div className={`${CONTAINER} py-8 lg:py-10`}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4 md:divide-x md:divide-border/70">
              {CREDIBILIDAD.map((s) => (
                <div key={s.label} className="md:px-8">
                  {s.link ? (
                    <a
                      href={s.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display text-[26px] font-semibold leading-none text-primary tabular-nums transition-colors hover:text-gold lg:text-[32px]"
                    >
                      {s.value}
                    </a>
                  ) : (
                    <p className="font-display text-[26px] font-semibold leading-none text-primary tabular-nums lg:text-[32px]">
                      {s.value}
                    </p>
                  )}
                  <p className="mt-2.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {s.label}
                  </p>
                  {s.linkLabel && (
                    <a
                      href={s.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-gold transition-colors hover:text-primary"
                    >
                      {s.linkLabel}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ TEST DEL INVERSOR ============ */}
        <SugerenciasSeccion
          id="test-inversor"
          label="Perfil"
          contenido={contenidoTest()}
          fallbackPregunta={FALLBACK_SECCION["test-inversor"]}
        >
          <section id="test-inversor" className={SECTION}>
            <div className={CONTAINER}>
              <SectionHeading
                label="Perfil"
                title="Descubra qué tipo de inversor es"
                lead="Ocho preguntas, dos minutos y cero datos personales. Al terminar sabrá si su perfil es conservador, moderado o agresivo, y qué instrumentos suelen acompañar mejor ese perfil. Es el punto de partida de una conversación seria: la decisión final siempre es suya."
              />
              <TestInversor />
            </div>
          </section>
        </SugerenciasSeccion>

        {/* ============ HERRAMIENTAS DE ANÁLISIS ============ */}
        <SugerenciasSeccion
          id="herramientas"
          label="Herramientas"
          contenido={contenidoHerramientas()}
          fallbackPregunta={FALLBACK_SECCION.herramientas}
        >
          <section id="herramientas" className={SECTION}>
            <div className={CONTAINER}>
              <SectionHeading
                label="Herramientas"
                title="Probá el panel de análisis financiero"
                lead={
                  <>
                    Un dashboard interactivo con datos en vivo de Yahoo Finance, IOL, BCRA,
                    ArgentinaDatos y CriptoYa: contexto macro, semáforo técnico y fundamental,
                    optimizador de carteras, riesgo, CAPM y análisis sectorial. Y si opera con
                    InvertirOnline, puede iniciar sesión con su usuario y contraseña para analizar{" "}
                    <em>su</em> portafolio real.
                  </>
                }
              />

              <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: Gauge,
                    titulo: "Contexto",
                    texto:
                      "Macro argentino en vivo: dólares, riesgo país, inflación, reservas, intermercado y etapa del ciclo económico.",
                  },
                  {
                    icon: Activity,
                    titulo: "Análisis",
                    texto:
                      "Semáforo técnico + fundamental por activo: RSI, MACD, medias, soportes y resistencias, con gráfico interactivo.",
                  },
                  {
                    icon: LineChart,
                    titulo: "Cuantitativo",
                    texto:
                      "Optimizador de carteras (5 estrategias), riesgo por distribución de retornos y CAPM con auto-benchmark.",
                  },
                  {
                    icon: Layers,
                    titulo: "Sectores",
                    texto:
                      "Performance sectorial, matriz de correlaciones entre ETFs, valuación relativa y oportunidades del día.",
                  },
                ].map((m) => (
                  <div
                    key={m.titulo}
                    className="rounded-2xl border border-border/70 bg-secondary/20 p-5 transition-colors hover:border-primary/40"
                  >
                    <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-foreground">
                      <m.icon className="h-4 w-4 flex-none text-primary" />
                      {m.titulo}
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                      {m.texto}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mx-auto mt-8 flex max-w-4xl flex-col items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/[0.07] px-6 py-5 text-center sm:flex-row sm:text-left">
                <p className="flex items-center gap-2 text-[13px] leading-snug text-foreground/90">
                  <KeyRound className="h-4 w-4 flex-none text-gold" />
                  <span>
                    ¿Quiere ver análisis sobre <strong className="text-primary">su</strong> cartera?
                    Dentro del panel, inicie sesión con su usuario y contraseña de{" "}
                    <strong>IOL</strong> (el botón «IOL» arriba a la derecha). Las credenciales se
                    procesan en el servidor al momento y no se guardan en el sitio.
                  </span>
                </p>
                <Link
                  to="/herramientas"
                  search={{ tab: "analisis" }}
                  className="flex-none rounded-full bg-primary px-5 py-2.5 text-[12.5px] font-semibold text-primary-foreground shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-all hover:-translate-y-0.5 hover:bg-primary/90"
                >
                  Abrir Herramientas
                </Link>
              </div>

              <p className="mx-auto mt-4 max-w-4xl text-center text-[11px] leading-snug text-muted-foreground">
                Herramientas informativas con datos de terceros. No constituyen recomendación de
                inversión.
              </p>
            </div>
          </section>
        </SugerenciasSeccion>

        {/* ============ INSTRUMENTOS ============ */}
        <SugerenciasSeccion
          id="instrumentos"
          label="Instrumentos"
          contenido={contenidoInstrumentos(instrumentosMostrados, perfilInv, verTodos)}
          fallbackPregunta={FALLBACK_SECCION.instrumentos}
        >
          <section id="instrumentos" className={SECTION}>
            <div className={CONTAINER}>
              <SectionHeading
                label="Instrumentos"
                title="El mercado completo, filtrado para usted"
                lead={
                  <>
                    Todas las operaciones se efectúan en su cuenta{" "}
                    <TooltipTerm
                      term="comitente"
                      tip="Cuenta a nombre del cliente en el bróker, donde permanecen depositados sus fondos y títulos."
                    />
                    , en un{" "}
                    <TooltipTerm
                      term="ALyC"
                      tip="Agente de Liquidación y Compensación: el bróker registrado en la CNV que ejecuta y liquida las operaciones."
                    />{" "}
                    registrado en la CNV. Su dinero permanece siempre a su nombre.
                  </>
                }
              />

              {perfilInv && !verTodos && (
                <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/[0.07] px-5 py-4 text-center sm:flex-row sm:text-left">
                  <p className="flex items-center gap-2 text-[13.5px] leading-snug text-foreground/90">
                    <TrendingUp className="h-4 w-4 flex-none text-primary" />
                    <span>
                      Mostrando los instrumentos que suelen adecuarse a su perfil{" "}
                      <strong className="text-primary">{perfilInv.nombre}</strong>.
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setVerTodos(true)}
                    className="flex-none rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-[11.5px] font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/15"
                  >
                    Ver el catálogo completo
                  </button>
                </div>
              )}
              {perfilInv && verTodos && (
                <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center justify-between gap-3 rounded-2xl border border-border/70 bg-secondary/20 px-5 py-4 text-center sm:flex-row sm:text-left">
                  <p className="flex items-center gap-2 text-[13.5px] leading-snug text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 flex-none text-primary" />
                    <span>
                      Catálogo completo.{" "}
                      <button
                        type="button"
                        onClick={() => setVerTodos(false)}
                        className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                      >
                        Volver a {perfilInv.nombre}
                      </button>
                    </span>
                  </p>
                </div>
              )}
              {!perfilInv && (
                <p className="mx-auto mt-6 max-w-xl text-center text-[12.5px] leading-relaxed text-muted-foreground">
                  Complete el{" "}
                  <a
                    href="#test-inversor"
                    className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    Test del Inversor
                  </a>{" "}
                  y el catálogo se ajustará automáticamente a su perfil.
                </p>
              )}

              <div className="mt-10 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {instrumentosMostrados.map(
                  ({ nombre, que, moneda, perfil, verificar, porque, paraQuien }) => {
                    const Icon = ICONOS_INSTRUMENTO[nombre];
                    const withTip = nombre === "CEDEARs";
                    const label = (
                      <span className="block text-[15px] font-semibold leading-snug text-foreground">
                        {withTip ? (
                          <TooltipTerm
                            term={nombre}
                            tip="Certificado que representa acciones de empresas extranjeras y se opera en pesos en la Bolsa local."
                          />
                        ) : (
                          nombre
                        )}
                      </span>
                    );
                    return (
                      <div
                        key={nombre}
                        className="surface-card group flex items-start gap-4 rounded-xl px-5 py-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/[0.06]"
                      >
                        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gradient-to-br from-white/12 to-white/[0.02] text-gold ring-1 ring-white/15 transition-colors group-hover:text-primary group-hover:ring-primary/40">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            {label}
                            <RiskChip
                              perfil={perfil}
                              {...(verificar === true ? { verificar: true } : {})}
                            />
                          </span>
                          <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                            {que}
                          </span>
                          <span className="mt-1 block text-[11px] uppercase tracking-[0.06em] text-muted-foreground/80">
                            {moneda}
                          </span>
                          <span className="mt-1.5 block text-[12.5px] leading-snug text-foreground/90">
                            {porque}
                          </span>
                          <span className="mt-1.5 block border-l-2 border-gold/40 pl-2 text-[11.5px] leading-snug text-gold/90">
                            {paraQuien}
                          </span>
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          </section>
        </SugerenciasSeccion>

        {/* ============ BROKERS ============ */}
        <SugerenciasSeccion
          id="brokers"
          label="Brokers"
          contenido={contenidoBrokers()}
          fallbackPregunta={FALLBACK_SECCION.brokers}
        >
          <section id="brokers" className={SECTION}>
            <div className={CONTAINER}>
              <SectionHeading
                label="Brokers"
                title="Operamos donde su dinero está protegido"
                lead="Balanz, Inviu e IOL: tres ALyC registrados en la CNV. Usted elige con quién operar y su cuenta comitente queda siempre a su nombre. Nosotros aportamos la estrategia; la custodia es del bróker regulado."
              />

              <div className="mt-10">
                <div className="surface-card overflow-hidden rounded-[2rem]">
                  <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3 sm:gap-0 sm:p-5">
                    {BROKERS.map((b, i) => (
                      <a
                        key={b.name}
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`group flex flex-col items-center rounded-2xl px-6 py-8 transition-colors hover:bg-primary/[0.06] ${
                          i > 0 ? "sm:border-l sm:border-border/60" : ""
                        }`}
                      >
                        <span className="flex h-28 w-full items-center justify-center px-6 lg:h-32">
                          <img
                            src={b.logo}
                            alt={`Logo ${b.name}`}
                            loading="lazy"
                            width={260}
                            height={96}
                            className="max-h-full w-full object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-105"
                          />
                        </span>
                        <span className="mt-5 text-[16px] font-semibold">{b.name}</span>
                        <span className="mt-1 text-[12px] leading-snug text-muted-foreground tabular-nums">
                          {b.mat}
                        </span>
                        <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary">
                          Sitio oficial
                          <ExternalLink className="h-3.5 w-3.5" />
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </SugerenciasSeccion>

        {/* ============ PREGUNTAS ============ */}
        <SugerenciasSeccion
          id="preguntas"
          label="Preguntas"
          contenido={contenidoPreguntas()}
          fallbackPregunta={FALLBACK_SECCION.preguntas}
        >
          <section id="preguntas" className={SECTION}>
            <div className={CONTAINER}>
              <SectionHeading
                label="Preguntas"
                title="Lo que todo nuevo inversor pregunta"
                lead="Sin letra chica: las dudas más frecuentes, respondidas antes de que dé el primer paso."
              />

              <div className="mx-auto mt-10 max-w-3xl">
                {FAQ.map((f) => (
                  <details key={f.q} className="group border-b border-border/70 py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 marker:hidden">
                      <span className="text-[17px] font-semibold leading-snug lg:text-[19px]">
                        {f.q}
                      </span>
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gold/40 text-gold transition-transform duration-300 group-open:rotate-45">
                        <Plus className="h-4 w-4" />
                      </span>
                    </summary>
                    <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground lg:text-[16px]">
                      {f.a}
                    </p>
                  </details>
                ))}
              </div>

              <div className="mt-10 text-center">
                <WhatsAppLink className="btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-primary-foreground">
                  ¿Quedó una duda? Escríbame por WhatsApp
                  <ArrowRight className="h-4 w-4" />
                </WhatsAppLink>
              </div>
            </div>
          </section>
        </SugerenciasSeccion>

        {/* ============ ALIANZAS ============ */}
        <SugerenciasSeccion
          id="alianzas"
          label="Alianzas"
          contenido={contenidoAlianzas()}
          fallbackPregunta={FALLBACK_SECCION.alianzas}
        >
          <section id="alianzas" className={SECTION}>
            <div className={CONTAINER}>
              <SectionHeading
                label="Alianzas"
                title="Profesionales de confianza"
                lead="Cuando el caso lo requiere, lo conectamos con especialistas independientes de confianza. Servicios ajenos a la actividad regulada por la CNV."
              />

              <div className="mx-auto mt-10 max-w-3xl">
                <div className="surface-card overflow-hidden rounded-2xl px-6">
                  <details className="group border-b border-border/70">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 marker:hidden">
                      <span className="flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary/15 text-primary">
                          <Layers className="h-5 w-5" />
                        </span>
                        <span className="flex flex-col items-start gap-0.5">
                          <span className="font-display text-[15px] font-semibold">
                            Franco Lamas · Desarrollo de software
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                            Presencia digital
                          </span>
                        </span>
                      </span>
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gold/40 text-gold transition-transform duration-300 group-open:rotate-45">
                        <Plus className="h-4 w-4" />
                      </span>
                    </summary>
                    <div className="pb-6">
                      <div className="rounded-xl border border-border/70 px-5 py-4">
                        <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                          Landing pages, sitios completos y apps a medida, con hosting incluido los
                          primeros meses.
                        </p>
                        <ul className="mt-3 space-y-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                          <li>— Landing page: una página, responsive, con SEO</li>
                          <li>
                            — Sitio completo: multi-página, panel de administración e integraciones
                          </li>
                          <li>— Apps a medida: desarrollo, DevOps y mantenimiento (SRE)</li>
                          <li>— Hosting incluido los primeros meses, con costo mensual luego</li>
                        </ul>
                        <p className="mt-4 text-[12px] italic text-muted-foreground">
                          Franco Lamas · Developer · DevOps · SRE
                        </p>
                      </div>
                    </div>
                  </details>

                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 marker:hidden">
                      <span className="flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gold/15 text-gold">
                          <Scale className="h-5 w-5" />
                        </span>
                        <span className="flex flex-col items-start gap-0.5">
                          <span className="font-display text-[15px] font-semibold">
                            Estudio Jurídico Dr. Pupi Cervio
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
                            Recupero de criptoestafas
                          </span>
                        </span>
                      </span>
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gold/40 text-gold transition-transform duration-300 group-open:rotate-45">
                        <Plus className="h-4 w-4" />
                      </span>
                    </summary>
                    <div className="pb-6">
                      <div className="rounded-xl border border-border/70 px-5 py-4">
                        <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                          Si te estafaron con criptoactivos, te conecto con representación penal
                          especializada.
                        </p>
                        <ul className="mt-3 space-y-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                          <li>— Representación penal del caso (abogado penalista)</li>
                          <li>— Rastreo forense de fondos y billeteras</li>
                          <li>— Presentación de la denuncia y seguimiento judicial</li>
                        </ul>
                        <p className="mt-4 text-[12px] italic text-muted-foreground">
                          Dr. Santiago Luis Pupi · Abogado penalista
                        </p>
                        <a
                          href="https://www.pupicervio.com/"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-gold underline underline-offset-4 hover:text-primary"
                        >
                          Sitio oficial: pupicervio.com
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </section>
        </SugerenciasSeccion>

        {/* ============ CTA FINAL ============ */}
        <section className="relative overflow-hidden border-t border-border/60 py-24 lg:py-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(46rem 22rem at 50% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)",
            }}
          />
          <div className={`${CONTAINER} relative text-center`}>
            <p className="eyebrow">Primer paso</p>
            <h2 className="mx-auto mt-4 max-w-3xl font-display text-[clamp(2rem,4.5vw,3.4rem)] font-semibold leading-tight">
              Empiece hoy con un diagnóstico claro
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground lg:text-[18px]">
              Analizamos su situación, su horizonte y su tolerancia al riesgo, y le mostramos un
              camino concreto. Sin costo, sin compromiso y con reglas claras desde el minuto uno.
            </p>
            <WhatsAppLink className="mt-9 inline-flex items-center gap-2.5 rounded-full bg-primary px-8 py-4 text-[15px] font-semibold text-primary-foreground shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-all hover:-translate-y-0.5 hover:bg-primary/90">
              Reservar mi diagnóstico por WhatsApp
              <ArrowRight className="h-4 w-4" />
            </WhatsAppLink>
          </div>
        </section>

        {/* ============ FOOTER ============ */}
        <footer className="border-t border-border/60 bg-background/70 backdrop-blur-md">
          <div className={`${CONTAINER} grid gap-12 py-16 md:grid-cols-3`}>
            <div>
              <a href="#inicio" className="flex items-center gap-2.5">
                <span className="h-9 w-9 overflow-hidden rounded-full border border-primary/40">
                  <img
                    src={retratoCintia}
                    alt="Cintia Boos"
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="font-display text-[18px] font-semibold leading-none">
                  Cintia <em className="italic text-primary">Boos</em>
                </span>
              </a>
              <p className="mt-5 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
                Asesoramiento patrimonial en Buenos Aires, Argentina. Las operaciones se efectúan a
                través de brokers ALyC registrados en la CNV.
              </p>
              <p className="mt-5 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-gold tabular-nums">
                <ShieldCheck className="h-4 w-4" />
                Agente Productora CNV · Mat. N° 2192
              </p>
              <p className="mt-3 max-w-xs text-[11px] leading-relaxed text-muted-foreground">
                Información general. No constituye recomendación de inversión.
              </p>
            </div>

            <div>
              <h3 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Navegación
              </h3>
              <ul className="mt-5 space-y-2.5 text-[14px]">
                {NAV.map((n) => (
                  <li key={n.id}>
                    <a
                      href={`#${n.id}`}
                      className="text-muted-foreground transition-colors hover:text-primary"
                    >
                      {n.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Contacto
              </h3>
              <ul className="mt-5 space-y-3 text-[14px]">
                <li>
                  <WhatsAppLink className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary">
                    <Phone className="h-4 w-4 text-primary" />
                    +54 9 11 6235 5944
                  </WhatsAppLink>
                </li>
                <li>
                  <a
                    href={LINKEDIN}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Linkedin className="h-4 w-4 text-primary" />
                    LinkedIn · Cintia Boos
                  </a>
                </li>
                <li>
                  <a
                    href={CNV_REGISTRO}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary"
                  >
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Verificar mi matrícula ante la CNV
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border/40">
            <div
              className={`${CONTAINER} flex flex-wrap items-center justify-between gap-3 py-6 text-[12px] text-muted-foreground`}
            >
              <p className="tabular-nums">
                © 2026 Cintia Boos · Agente Productora CNV · Mat. N° 2192
              </p>
              <p className="text-[10.5px] uppercase tracking-[0.16em] text-gold">
                Verifique siempre el registro. Es su primer resguardo.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
