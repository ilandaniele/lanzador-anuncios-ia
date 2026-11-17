INSERT INTO `plans` (`id`, `name`, `max_members`, `max_ad_accounts`, `max_creatives_per_launch`, `ai_daily_neurons`, `ai_monthly_neurons`, `price_monthly_minor`, `currency`, `is_active`, `created_at`) VALUES
	('beta', 'Beta', 10, 10, 30, 2000, 30000, 0, 'USD', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
	('starter', 'Starter', 10, 10, 30, 2000, 30000, 0, 'USD', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
	('pro', 'Pro', 10, 10, 30, 2000, 30000, 0, 'USD', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
