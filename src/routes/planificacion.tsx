import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/planificacion")({
  loader: () => {
    throw redirect({ to: "/herramientas", search: { tab: "planificacion", subTab: undefined, ticker: undefined } });
  },
  component: () => null,
});
