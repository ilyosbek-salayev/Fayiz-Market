#!/usr/bin/env bash
# Removes ONLY records created by scripts/deploy-qa (names/emails starting with "QA-PROD"/"qa-prod-")
# from the production D1, after a full export to dist/backups/. Optional args: R2 object keys to delete.
set -euo pipefail
cd "$(dirname "$0")/../../apps/api"
export CLOUDFLARE_ACCOUNT_ID=8c9b943ebbbb7bcff4386e624c4482ca
mkdir -p ../../dist/backups
npx wrangler d1 export fayz-market --env production --remote --output "../../dist/backups/fayz-market-before-qa-cleanup-$(date +%Y%m%d-%H%M%S).sql" >/dev/null
npx wrangler d1 execute fayz-market --env production --remote --json --command "$(cat <<'SQL'
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE 'QA-PROD%');
DELETE FROM orders WHERE customer_name LIKE 'QA-PROD%';
DELETE FROM inventory_adjustments WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'QA-PROD%');
DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'QA-PROD%');
DELETE FROM products WHERE name LIKE 'QA-PROD%';
DELETE FROM categories WHERE name LIKE 'QA-PROD%';
DELETE FROM sessions WHERE admin_id IN (SELECT id FROM admins WHERE email LIKE 'qa-prod-%');
DELETE FROM admins WHERE email LIKE 'qa-prod-%';
DELETE FROM login_attempts WHERE email LIKE 'qa-prod-%';
SELECT (SELECT COUNT(*) FROM categories) AS categories,(SELECT COUNT(*) FROM products) AS products,(SELECT COUNT(*) FROM orders) AS orders,(SELECT COUNT(*) FROM admins) AS admins;
SQL
)" 2>/dev/null | python3 -c "import sys,json;raw=sys.stdin.read();d=json.loads(raw[raw.index('['):]);print('changes',[x['meta']['changes'] for x in d[:-1]],'remaining',d[-1]['results'])"
for key in "$@"; do npx wrangler r2 object delete "fayz-market-images/$key" --remote 2>&1 | grep -E "complete|ERROR" || true; done
