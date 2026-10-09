-- Reglas contables a nivel de base de datos (Prisma no las expresa en el schema).
-- Son la última línea de defensa: aunque un bug o un script se salte el service,
-- la BD rechaza líneas de asiento inválidas.

-- Cada línea tiene débito O crédito, uno solo, y mayor a cero.
ALTER TABLE "JournalEntryLine"
  ADD CONSTRAINT "JournalEntryLine_amounts_check"
  CHECK (
    ("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)
  );

-- Un período fiscal no puede terminar antes de empezar.
ALTER TABLE "FiscalPeriod"
  ADD CONSTRAINT "FiscalPeriod_dates_check"
  CHECK ("startDate" <= "endDate");
