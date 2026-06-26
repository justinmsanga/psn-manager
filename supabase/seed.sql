-- Seed default games for PSN Manager
insert into public.games (name, default_ps4_price, default_ps5_price) values
  ('Elden Ring: Shadow of the Erdtree', 35.00, 45.00),
  ('God of War Ragnarok', 30.00, 40.00),
  ('Gran Turismo 7', 25.00, 35.00),
  ('Spider-Man 2', 35.00, 45.00),
  ('Horizon Forbidden West', 25.00, 35.00),
  ('The Last of Us Part I', 30.00, 40.00),
  ('Ghost of Tsushima DC', 20.00, 30.00),
  ('FC 25 (Standard)', 40.00, 50.00),
  ('Call of Duty: Black Ops 6', 45.00, 55.00),
  ('Resident Evil 4 Remake', 25.00, 35.00)
on conflict (name) do update set
  default_ps4_price = excluded.default_ps4_price,
  default_ps5_price = excluded.default_ps5_price;