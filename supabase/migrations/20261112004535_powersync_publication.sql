-- The publication PowerSync replicates from. It must be named `powersync`.
--
-- Lists Kineō's tables explicitly rather than FOR ALL TABLES, which PowerSync warns
-- can use a lot of memory, and which would also pick up tables that aren't ours.
-- Add new tables here (ALTER PUBLICATION powersync ADD TABLE ...) when a migration
-- creates one that the apps need offline.
--
-- On the server, the powersync_role that reads it is created by
-- infra/db/init/99-powersync.sql.

create publication powersync for table
  public.profiles,
  public.practice_settings,
  public.invoice_styles,
  public.patients,
  public.price_items,
  public.invoices,
  public.visits,
  public.invoice_lines;
