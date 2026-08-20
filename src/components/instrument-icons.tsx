import type { ReactElement, ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

const base: IconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function S({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return (
    <svg {...base} className={className}>
      {children}
    </svg>
  );
}

/** Bonos soberanos — certificado + edificio público */
export function IconBonoSoberano({ className }: { className?: string }) {
  return (
    <S className={className}>
      <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V10h-5V3Z" />
      <path d="M14 3v6h6" opacity={0.55} />
      <path d="M8.5 13.5h7v5h-7Z" />
      <path d="M9.5 13.5v5M12 13.5v5M14.5 13.5v5" opacity={0.55} />
    </S>
  );
}

/** Obligaciones negociables — documento sellado + empresa */
export function IconObligacionNegociable({ className }: { className?: string }) {
  return (
    <S className={className}>
      <path d="M6.5 3.5h7.5l4 4V19.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5v4h4" opacity={0.55} />
      <circle cx="12" cy="13" r="3.4" />
      <path d="M9.4 13h5.2M12 10.6v4.8" opacity={0.6} />
    </S>
  );
}

/** Acciones locales — campana de apertura + velas japonesas */
export function IconAccionLocal({ className }: { className?: string }) {
  return (
    <S className={className}>
      <path d="M12 3.5V4.5" opacity={0.5} />
      <path d="M8.75 5.2a3.25 3.25 0 1 1 6.5 0" />
      <path d="M10.6 5.2v1.6M13.4 5.2v1.6" opacity={0.55} />
      <path d="M5.5 15.5V9.5M4.25 11.5h2.5" />
      <path d="M10.5 18V11M9 13.5h3" />
      <path d="M16.5 16V8M15.25 11h2.5" />
      <path d="M4 20h16" opacity={0.55} />
    </S>
  );
}

/** Acciones internacionales — globo + curva ascendente */
export function IconAccionInternacional({ className }: { className?: string }) {
  return (
    <S className={className}>
      <circle cx="11" cy="12" r="7.2" />
      <path
        d="M4 12h14M11 4.8c2.9 2.5 2.9 13.9 0 16.4M11 4.8c-2.9 2.5-2.9 13.9 0 16.4"
        opacity={0.6}
      />
      <path d="m14.5 10.5 1.5-1.5 2 2 2.5-2.5" />
      <path d="M18.5 7.5h2v2" />
    </S>
  );
}

/** CEDEARs — certificado + globo + flecha */
export function IconCedear({ className }: { className?: string }) {
  return (
    <S className={className}>
      <path d="M7 3.5h8l3 3v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M15 3.5v3h3" opacity={0.55} />
      <circle cx="10" cy="12.5" r="2.6" />
      <path d="M7.4 12.5h5.2M10 9.9v5.2" opacity={0.6} />
      <path d="m14.5 6.5 1.3-1.3M15.8 5.2v2.3M17.1 6.6l-1.3-1.3" opacity={0.85} />
    </S>
  );
}

/** ADRs — recibo + estrella */
export function IconAdr({ className }: { className?: string }) {
  return (
    <S className={className}>
      <path d="M6.5 3.5h8l3 3v11a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14.5 3.5v3h3" opacity={0.55} />
      <path d="m9 10 .9 1.9 2 .3-1.5 1.4.4 2L9 14.9l-1.8 1 1.4-2-1.5-1.4 2-.3Z" />
    </S>
  );
}

/** ETFs — canasta + gráficos */
export function IconEtf({ className }: { className?: string }) {
  return (
    <S className={className}>
      <path d="M4 10h16l-1.8 8.4a1 1 0 0 1-1 .6H6.8a1 1 0 0 1-1-.6Z" />
      <path d="M9 6.5a3 3 0 0 1 6 0" opacity={0.6} />
      <path d="m7.5 13.5 2-2.3 2 1.9 2-2.2 2.5 2.6" opacity={0.85} />
    </S>
  );
}

/** Letras del Tesoro — certificado + reloj */
export function IconLetraTesoro({ className }: { className?: string }) {
  return (
    <S className={className}>
      <path d="M6.5 3.5h8l4 4V19a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14.5 3.5v4h4" opacity={0.55} />
      <circle cx="12" cy="13.5" r="3.6" />
      <path d="M12 11.4v2.1l1.5 1" opacity={0.85} />
    </S>
  );
}

/** Money market — bóveda + flujo de monedas */
export function IconMoneyMarket({ className }: { className?: string }) {
  return (
    <S className={className}>
      <path d="M6 10.5h12a1.5 1.5 0 0 1 1.5 1.5V16a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2v-4a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="m9 4.5 1.6 1.6L12.2 4.5M9 6.1h6" opacity={0.7} />
      <circle cx="12" cy="14" r="1.8" />
      <path d="M12 12.2v1.8l1.3.9" opacity={0.85} />
    </S>
  );
}

/** Cauciones bursátiles — monedas en ciclo + candado */
export function IconCaucion({ className }: { className?: string }) {
  return (
    <S className={className}>
      <path d="M12 20.5a8 8 0 1 1 6.9-4" />
      <path d="M20.5 20.5v-3h-3" opacity={0.85} />
      <rect x="8.5" y="8.5" width="7" height="6" rx="1.6" />
      <path d="M9.9 8.5V6.4a2.1 2.1 0 0 1 4.2 0v2.1" />
      <path d="M12 12v1" opacity={0.85} />
    </S>
  );
}

/** Cheques de pago diferido — cheque + calendario */
export function IconChequeDiferido({ className }: { className?: string }) {
  return (
    <S className={className}>
      <rect x="7.5" y="6" width="9" height="14" rx="1.8" />
      <path d="M7.5 10h9M10 6V4M14 6V4" opacity={0.6} />
      <path d="M10 13.5h4M10 16h2.5" />
    </S>
  );
}

/** Opciones — bifurcación + contrato */
export function IconOpcion({ className }: { className?: string }) {
  return (
    <S className={className}>
      <path d="M9 20V12M9 12l-4 8M9 12l6 8" />
      <path d="M16.5 4.5h4M16.5 8h4M16.5 11.5h4" opacity={0.75} />
    </S>
  );
}

export const ICONOS_INSTRUMENTO = {
  "Bonos soberanos": IconBonoSoberano,
  "Obligaciones negociables": IconObligacionNegociable,
  "Acciones locales (BCBA)": IconAccionLocal,
  "Acciones internacionales": IconAccionInternacional,
  CEDEARs: IconCedear,
  ADRs: IconAdr,
  ETFs: IconEtf,
  "Letras del Tesoro": IconLetraTesoro,
  "Money market": IconMoneyMarket,
  "Cauciones bursátiles": IconCaucion,
  "Cheques de pago diferido": IconChequeDiferido,
  Opciones: IconOpcion,
} satisfies Record<string, (props: { className?: string }) => ReactElement>;

export type NombreInstrumento = keyof typeof ICONOS_INSTRUMENTO;
