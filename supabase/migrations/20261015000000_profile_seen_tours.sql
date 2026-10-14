-- Migration: đánh dấu tour hướng dẫn đã xem ở phía backend
-- (thay vì chỉ localStorage: đổi máy/trình duyệt vẫn chỉ hiện lần đầu)

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS seen_tours TEXT[] NOT NULL DEFAULT '{}';
