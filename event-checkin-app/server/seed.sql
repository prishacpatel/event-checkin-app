INSERT INTO events (name, venue, starts_at, capacity) VALUES
  ('Diwali Night', 'Student Union Ballroom', now() + interval '21 days', 150);

INSERT INTO shifts (event_id, role, starts_at, ends_at, capacity)
SELECT 1, role, now() + interval '21 days' + start_offset, now() + interval '21 days' + end_offset, cap
FROM (VALUES
  ('Setup crew',          interval '-2 hours', interval '0 hours',   6),
  ('Door and check-in',   interval '0 hours',  interval '2 hours',   3),
  ('Food service',        interval '0 hours',  interval '3 hours',   5),
  ('Stage and sound',     interval '1 hour',   interval '4 hours',   2),
  ('Cleanup crew',        interval '3 hours',  interval '5 hours',   6)
) AS t(role, start_offset, end_offset, cap);
