import { createFileRoute } from "@tanstack/react-router";
import { MonitorMercadoPage } from "@/components/monitor/MonitorMercadoPage";
import { createMeta } from "@/lib/seo/meta";

export const Route = createFileRoute("/monitor-mercado")({
  head: () => {
    const { meta, links } = createMeta({
      title: "Monitor Mercado — Coronar Inversiones",
      description:
        "Monitor de mercado en vivo: dólares, LECAPs, bonos, futuros, acciones. Datos IOL en tiempo real.",
      path: "/monitor-mercado",
    });
    return { meta, links };
  },
  component: MonitorMercadoPage,
});
