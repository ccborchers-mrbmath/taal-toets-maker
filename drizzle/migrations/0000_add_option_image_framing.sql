ALTER TABLE public.question_options
  ADD COLUMN IF NOT EXISTS image_zoom double precision NOT NULL DEFAULT 1.32,
  ADD COLUMN IF NOT EXISTS image_offset_x double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_offset_y double precision NOT NULL DEFAULT 0;

ALTER TABLE public.question_options
  ADD CONSTRAINT question_options_image_zoom_range CHECK (image_zoom BETWEEN 1 AND 2.25),
  ADD CONSTRAINT question_options_image_offset_x_range CHECK (image_offset_x BETWEEN -0.4 AND 0.4),
  ADD CONSTRAINT question_options_image_offset_y_range CHECK (image_offset_y BETWEEN -0.4 AND 0.4);