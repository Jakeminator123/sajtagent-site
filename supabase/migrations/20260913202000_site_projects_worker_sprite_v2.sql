-- V2 project worker binding. Nullable and server-owned.
-- Authenticated clients keep SELECT-only on site_projects; they cannot
-- assign worker_sprite_id or choose another principal's worker.

alter table public.site_projects
  add column worker_sprite_id text;

alter table public.site_projects
  add constraint site_projects_worker_sprite_id_format
    check (
      worker_sprite_id is null
      or (
        char_length(worker_sprite_id) between 1 and 160
        and worker_sprite_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
      )
    );

create unique index site_projects_worker_sprite_id_unique
  on public.site_projects (worker_sprite_id)
  where worker_sprite_id is not null;
