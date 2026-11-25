CREATE TRIGGER `workspaces_owner_limit`
BEFORE INSERT ON `workspaces`
WHEN (
  SELECT count(*) FROM `workspaces`
  WHERE `owner_user_id` = NEW.`owner_user_id` AND `status` != 'deleting'
) >= 3
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_LIMIT');
END;
--> statement-breakpoint
CREATE TRIGGER `workspaces_owner_limit_on_update`
BEFORE UPDATE OF `owner_user_id`, `status` ON `workspaces`
WHEN NEW.`status` != 'deleting'
  AND (OLD.`owner_user_id` != NEW.`owner_user_id` OR OLD.`status` = 'deleting')
  AND (
    SELECT count(*) FROM `workspaces`
    WHERE `owner_user_id` = NEW.`owner_user_id`
      AND `status` != 'deleting'
      AND `id` != NEW.`id`
  ) >= 3
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_LIMIT');
END;
