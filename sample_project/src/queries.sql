-- Reporting queries for the scenario database.
CREATE VIEW active_users AS
SELECT u.id, u.name
FROM users u
INNER JOIN sessions s ON s.user_id = u.id
WHERE s.ended_at IS NULL;

INSERT INTO users (name, email) VALUES ('Ada', 'ada@example.com');
UPDATE users SET name = 'Ada L' WHERE id = 1;
DELETE FROM sessions WHERE ended_at < '2020-01-01';

SELECT u.name, COUNT(s.id) AS session_count
FROM users u
LEFT JOIN sessions s ON s.user_id = u.id
GROUP BY u.name;
