-- Token lifetime setting PostgREST reads. Runs once, when the database is first
-- created. Adapted from Supabase's self-hosting setup (Apache-2.0).
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
