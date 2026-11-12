-- Event triggers. Apply AFTER the data load.
DROP EVENT TRIGGER IF EXISTS "system_log_ddl";
CREATE EVENT TRIGGER "system_log_ddl" ON ddl_command_end EXECUTE FUNCTION "public"."log_ddl_command"();
DROP EVENT TRIGGER IF EXISTS "system_log_drop";
CREATE EVENT TRIGGER "system_log_drop" ON sql_drop EXECUTE FUNCTION "public"."log_ddl_drop"();
