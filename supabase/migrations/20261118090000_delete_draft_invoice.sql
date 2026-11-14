-- Deleting an invoice: only a draft, and its number is never used again.
--   - A practitioner's own delete of a sent, paid or cancelled invoice is refused
--     (those stay as records; cancel a sent one instead).
--   - Deleting a draft first takes its visits off it, so they go back to Ready to
--     invoice. Its lines go with it (on delete cascade); visit items are on visits,
--     so they stay with their visits.
--   - The draft's number is skipped from then on: the practice's starting number
--     moves up to one past it, so create_invoice never hands it out again.
-- The function is security definer because own_row_id is not callable by the API roles;
-- it only touches this invoice's visits and this owner's practice_settings row.
-- Nothing cascades into invoices (patients are never deleted through them), and an
-- admin removing a whole practice (no signed-in practitioner) is not held to the lock.
-- Row-level security already has a delete policy keyed on the owner (invoices_delete_own
-- in 20261111222421_row_level_security.sql), and the grants are the table's existing ones.

create function public.invoices_delete_only_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the apps' requests (a signed-in practitioner).
  if public.requesting_owner_id() is null then
    return old;
  end if;

  if old.status is distinct from 'draft' then
    raise exception 'Only a draft invoice can be deleted.'
      using errcode = 'check_violation';
  end if;

  -- Still a draft here, so the visit lock allows taking its visits off.
  update public.visits
     set invoice_id = null, updated_at = now()
   where invoice_id = old.id and owner_id = old.owner_id;

  -- Never reuse the number: when it's the practice's highest, start at least one past
  -- it (create_invoice already goes past any number still in use). Only ever raised.
  if not exists (
    select 1 from public.invoices
     where owner_id = old.owner_id and number > old.number
  ) then
    insert into public.practice_settings (id, owner_id, invoice_number_start)
    values (
      public.own_row_id('practice_settings', old.owner_id),
      old.owner_id,
      least(old.number + 1, 99999999)
    )
    on conflict (owner_id) do update
      set invoice_number_start = greatest(
            public.practice_settings.invoice_number_start,
            excluded.invoice_number_start
          ),
          updated_at = now();
  end if;

  return old;
end;
$$;

create trigger invoices_delete_only_draft
  before delete on public.invoices
  for each row execute function public.invoices_delete_only_draft();

revoke all on function public.invoices_delete_only_draft() from public, anon, authenticated;
