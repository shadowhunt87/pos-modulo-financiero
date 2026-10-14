-- R3 / ANEXO-S0 3.12: la bitácora no se modifica. Un UPDATE sobre "AuditLog" falla.
-- El DELETE no se bloquea todavía: las pruebas e2e limpian AuditLog con deleteMany (deuda 9.2 del anexo).
CREATE FUNCTION auditlog_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora no se modifica' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_no_update" BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION auditlog_no_update();
