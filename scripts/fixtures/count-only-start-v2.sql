-- LOCAL FIXTURE ONLY. Not a migration; use fresh disposable PostgreSQL over a private local socket.
-- The harness creates a database and an ephemeral marker. This file does not expose an endpoint.
BEGIN;
DO $guard$
BEGIN
  IF pg_catalog.current_database() <> 'lab_count_fixture_v2'
     OR pg_catalog.inet_server_addr() IS NOT NULL
     OR pg_catalog.to_regclass('pg_temp.lab_count_fixture_v2_marker') IS NULL THEN
    RAISE EXCEPTION 'fixture marker absent or private local socket required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_temp.lab_count_fixture_v2_marker WHERE token='private-synthetic-only'
  ) THEN
    RAISE EXCEPTION 'fixture marker absent or invalid';
  END IF;
END;
$guard$;
CREATE SCHEMA lab_count_v2_fixture;
REVOKE ALL ON SCHEMA lab_count_v2_fixture FROM PUBLIC;
CREATE TABLE lab_count_v2_fixture.gate (
  mode text NOT NULL CHECK (mode ~ '^[a-z0-9_]{1,80}$'),
  release_version text NOT NULL CHECK (release_version ~ '^[A-Za-z0-9_.+-]{1,80}$'),
  cohort text NOT NULL CHECK (cohort ~ '^[a-z0-9_-]{1,80}$'),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (mode, release_version),
  UNIQUE (mode, release_version, cohort)
);
CREATE TABLE lab_count_v2_fixture.ledger (
  start_id uuid PRIMARY KEY CHECK (start_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  mode text NOT NULL,
  release_version text NOT NULL,
  cohort text NOT NULL,
  FOREIGN KEY (mode, release_version, cohort) REFERENCES lab_count_v2_fixture.gate (mode, release_version, cohort)
);
CREATE INDEX count_mode_cohort ON lab_count_v2_fixture.ledger (mode, cohort);
ALTER TABLE lab_count_v2_fixture.gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_count_v2_fixture.ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lab_count_v2_fixture.gate, lab_count_v2_fixture.ledger FROM PUBLIC;

CREATE FUNCTION lab_count_v2_fixture.immutable_gate_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $body$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'gate identity is immutable';
  END IF;
  IF ROW(OLD.mode,OLD.release_version,OLD.cohort) IS DISTINCT FROM ROW(NEW.mode,NEW.release_version,NEW.cohort) THEN
    RAISE EXCEPTION 'gate identity is immutable';
  END IF;
  RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION lab_count_v2_fixture.immutable_gate_identity() FROM PUBLIC;
CREATE TRIGGER gate_identity BEFORE UPDATE OR DELETE ON lab_count_v2_fixture.gate
FOR EACH ROW EXECUTE FUNCTION lab_count_v2_fixture.immutable_gate_identity();
CREATE FUNCTION lab_count_v2_fixture.append_only_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $body$
BEGIN
  RAISE EXCEPTION 'ledger is append-only';
END;
$body$;
REVOKE ALL ON FUNCTION lab_count_v2_fixture.append_only_ledger() FROM PUBLIC;
CREATE TRIGGER ledger_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON lab_count_v2_fixture.ledger
FOR EACH STATEMENT EXECUTE FUNCTION lab_count_v2_fixture.append_only_ledger();

CREATE FUNCTION lab_count_v2_fixture.record_start(p_event jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $body$
DECLARE
  v_start uuid;
  v_id text;
  v_mode text;
  v_release text;
  v_cohort text;
  v_prior lab_count_v2_fixture.ledger%ROWTYPE;
BEGIN
  IF pg_catalog.jsonb_typeof(p_event) IS DISTINCT FROM 'object'
     OR pg_catalog.octet_length(p_event::text)>512 THEN
    RETURN pg_catalog.jsonb_build_object('status','invalid');
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_event)) <> 4
     OR pg_catalog.jsonb_typeof(p_event->'startId') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_event->'mode') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_event->'version') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_event->'kind') IS DISTINCT FROM 'string'
     OR p_event->>'kind' <> 'normal-start' THEN
    RETURN pg_catalog.jsonb_build_object('status','invalid');
  END IF;
  v_id:=p_event->>'startId';
  v_mode:=p_event->>'mode';
  v_release:=p_event->>'version';
  IF pg_catalog.char_length(v_id) <> 36
     OR v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR v_mode !~ '^[a-z0-9_]{1,80}$'
     OR v_release !~ '^[A-Za-z0-9_.+-]{1,80}$' THEN
    RETURN pg_catalog.jsonb_build_object('status','invalid');
  END IF;
  v_start:=v_id::uuid;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id, 397124::bigint));
  SELECT * INTO v_prior FROM lab_count_v2_fixture.ledger WHERE start_id=v_start;
  IF FOUND THEN
    IF v_prior.mode=v_mode AND v_prior.release_version=v_release THEN
      RETURN pg_catalog.jsonb_build_object('status','duplicate','startId',v_id,'mode',v_mode,'version',v_release);
    END IF;
    RETURN pg_catalog.jsonb_build_object('status','conflict');
  END IF;
  -- A successful read lock keeps the gate's owner decision stable through commit.
  SELECT g.cohort INTO v_cohort FROM lab_count_v2_fixture.gate g
   WHERE g.mode=v_mode AND g.release_version=v_release AND g.enabled
   FOR SHARE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status','disabled');
  END IF;
  INSERT INTO lab_count_v2_fixture.ledger(start_id,mode,release_version,cohort)
   VALUES(v_start,v_mode,v_release,v_cohort)
   ON CONFLICT (start_id) DO NOTHING;
  IF NOT FOUND THEN
    -- A write outside the expected fixture function cannot change an existing row.
    SELECT * INTO v_prior FROM lab_count_v2_fixture.ledger WHERE start_id=v_start;
    IF FOUND AND v_prior.mode=v_mode AND v_prior.release_version=v_release THEN
      RETURN pg_catalog.jsonb_build_object('status','duplicate','startId',v_id,'mode',v_mode,'version',v_release);
    END IF;
    RETURN pg_catalog.jsonb_build_object('status',CASE WHEN NOT FOUND THEN 'retry' ELSE 'conflict' END);
  END IF;
  RETURN pg_catalog.jsonb_build_object('status','accepted','startId',v_id,'mode',v_mode,'version',v_release);
END;
$body$;
REVOKE ALL ON FUNCTION lab_count_v2_fixture.record_start(jsonb) FROM PUBLIC;
COMMIT;
