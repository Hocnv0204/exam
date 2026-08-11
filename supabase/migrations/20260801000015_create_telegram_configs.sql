-- Migration: Create telegram_configs table for linking classes to Telegram groups/channels
CREATE TABLE IF NOT EXISTS public.telegram_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID UNIQUE NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  chat_title TEXT,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_telegram_configs_class_id ON public.telegram_configs(class_id);

-- Enable RLS
ALTER TABLE public.telegram_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Service role has full access (bypasses RLS)
CREATE POLICY "Service role full access"
  ON public.telegram_configs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins can view all telegram configs
CREATE POLICY "Admins can view telegram configs"
  ON public.telegram_configs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'ADMIN'
    )
  );

-- Admins can insert telegram configs
CREATE POLICY "Admins can insert telegram configs"
  ON public.telegram_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'ADMIN'
    )
  );

-- Admins can update telegram configs
CREATE POLICY "Admins can update telegram configs"
  ON public.telegram_configs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'ADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'ADMIN'
    )
  );

-- Admins can delete telegram configs
CREATE POLICY "Admins can delete telegram configs"
  ON public.telegram_configs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'ADMIN'
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_telegram_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_telegram_configs_updated_at
  BEFORE UPDATE ON public.telegram_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_telegram_configs_updated_at();