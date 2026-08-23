-- Interpretaciones IA diarias de apertura/cierre — consultable histórico
-- Ejecutar en Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS interpretaciones_mercado (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('apertura','cierre')),
  fecha DATE NOT NULL,
  datos_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  interpretacion TEXT NOT NULL,
  modelo TEXT,
  proveedor TEXT,
  fecha_generacion TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tipo, fecha)
);

CREATE INDEX IF NOT EXISTS idx_interpretaciones_mercado_tipo_fecha ON interpretaciones_mercado (tipo, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_interpretaciones_mercado_fecha ON interpretaciones_mercado (fecha DESC);

ALTER TABLE interpretaciones_mercado ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'interpretaciones_mercado' AND policyname = 'Admin full access'
  ) THEN
    CREATE POLICY "Admin full access" ON interpretaciones_mercado
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_interpretaciones_mercado_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interpretaciones_mercado_updated ON interpretaciones_mercado;
CREATE TRIGGER trg_interpretaciones_mercado_updated
  BEFORE UPDATE ON interpretaciones_mercado
  FOR EACH ROW EXECUTE FUNCTION update_interpretaciones_mercado_updated_at();
