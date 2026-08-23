-- Tabla para almacenar portafolios importados por paste + agente clasificador
-- Ejecutar en Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS portafolios_clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_nombre TEXT NOT NULL,
  cliente_cuenta TEXT,
  cliente_alias TEXT,
  cliente_perfil TEXT DEFAULT 'moderado',
  cliente_custodio TEXT,
  df JSONB NOT NULL DEFAULT '[]'::jsonb,
  resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
  texto_original TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_portafolios_clientes_nombre ON portafolios_clientes (cliente_nombre);
CREATE INDEX IF NOT EXISTS idx_portafolios_clientes_cuenta ON portafolios_clientes (cliente_cuenta);

-- RLS básico (lectura/escritura solo admin)
ALTER TABLE portafolios_clientes ENABLE ROW LEVEL SECURITY;

-- Permisos para service_role (server-fns usan supabaseAdmin)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'portafolios_clientes' AND policyname = 'Admin full access'
  ) THEN
    CREATE POLICY "Admin full access" ON portafolios_clientes
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_portafolios_clientes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portafolios_clientes_updated ON portafolios_clientes;
CREATE TRIGGER trg_portafolios_clientes_updated
  BEFORE UPDATE ON portafolios_clientes
  FOR EACH ROW
  EXECUTE FUNCTION update_portafolios_clientes_updated_at();
