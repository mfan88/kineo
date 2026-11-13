-- Correcting visits (P2, P3).
--
-- A practitioner can delete a visit saved by mistake and change a visit's date, but
-- only while the visit isn't on an invoice: an invoice's visits, their dates and the
-- dates on its lines stay as they were. A visit can't be dated after today; notes are
-- written after the visit. "Today" here is the server's UTC date plus a day, since a
-- practitioner's local date can be ahead of UTC (the apps check the exact local day).
-- The apps check the same rules first; the messages here match theirs word for word.
-- Deleting is limited only for the apps' own requests, so removing a practice's data
-- (an admin, with no signed-in practitioner) still works.

create function public.visits_corrections()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Only the apps' requests (a signed-in practitioner): an admin removing a whole
    -- practice, or an invoice outright, deletes its visits too.
    if old.invoice_id is not null and public.requesting_owner_id() is not null then
      raise exception 'This visit is on an invoice, so it can''t be deleted. Take it off the invoice first.'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if new.visit_date > (now() at time zone 'UTC')::date + 1 then
    raise exception 'A visit can''t be dated after today.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and new.visit_date is distinct from old.visit_date
    and (old.invoice_id is not null or new.invoice_id is not null) then
    raise exception 'This visit is on an invoice, so its date can''t be changed. Take it off the invoice first.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger visits_corrections
  before insert or update or delete on public.visits
  for each row execute function public.visits_corrections();
