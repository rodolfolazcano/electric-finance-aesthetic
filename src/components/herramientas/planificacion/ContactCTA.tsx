import { WHATSAPP } from "@/lib/contacto";

type Props = {
  origen: string;
};

export function ContactCTA({ origen }: Props) {
  return (
    <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
      <p className="text-sm text-muted-foreground">
        ¿Querés que un asesor revise este plan?{" "}
        <a
          href={`${WHATSAPP}?text=Hola%20Cintia,%20quiero%20que%20revise%20mi%20plan%20(${encodeURIComponent(origen)})`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Dejanos tu consulta
        </a>
      </p>
    </div>
  );
}
