import { createServerFn } from "@tanstack/react-start";
import { validarProyecto } from "./validate-project";

export const ejecutarValidacion = createServerFn({ method: "GET" })
  .handler(async () => {
    return await validarProyecto();
  });
