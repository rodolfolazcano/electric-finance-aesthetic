import { Link } from "@tanstack/react-router";

type Props = {
  origen: string;
};

export function ContactCTA({ origen }: Props) {
  return (
    <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
      <p className="text-sm text-muted-foreground">
        ¿Querés que un asesor revise este plan?{" "}
        <Link
          to="/contacto"
          search={{ origen } as Record<string, string>}
          className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Dejanos tu consulta
        </Link>
      </p>
    </div>
  );
}
