import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/planificacion")({
  loader: () => {
    throw redirect({ to: "/herramientas", search: { tab: "calculadora", subTab: "planificador", ticker: undefined } });
  },
  component: () => null,
});
