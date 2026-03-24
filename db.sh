#!/bin/bash
DB="transparentrx-db"

case "$1" in
  tables)
    echo "📋 Tables:"
    wrangler d1 execute $DB --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
    ;;
  users)
    echo "👥 Users:"
    wrangler d1 execute $DB --command="SELECT id, email, is_premium, plan, status, created_at FROM users;"
    ;;
  activity)
    echo "📝 Activity Feed:"
    wrangler d1 execute $DB --command="SELECT id, message FROM activity_feed;"
    ;;
  stats)
    echo "📊 Statistics:"
    echo -n "Users: "
    wrangler d1 execute $DB --command="SELECT COUNT(*) FROM users;" --json | grep -o '"count":[0-9]*' | cut -d: -f2
    echo -n "Activity messages: "
    wrangler d1 execute $DB --command="SELECT COUNT(*) FROM activity_feed;" --json | grep -o '"count":[0-9]*' | cut -d: -f2
    echo -n "Auth tokens: "
    wrangler d1 execute $DB --command="SELECT COUNT(*) FROM auth_tokens;" --json | grep -o '"count":[0-9]*' | cut -d: -f2
    echo -n "Usage records: "
    wrangler d1 execute $DB --command="SELECT COUNT(*) FROM usage_tracking;" --json | grep -o '"count":[0-9]*' | cut -d: -f2
    ;;
  info)
    echo "📦 Database Info:"
    wrangler d1 info $DB
    ;;
  sql)
    shift
    echo "🔍 Executing: $*"
    wrangler d1 execute $DB --command="$*"
    ;;
  *)
    echo "Usage: ./db.sh {tables|users|activity|stats|info|sql 'query'}"
    echo ""
    echo "Examples:"
    echo "  ./db.sh tables          - List all tables"
    echo "  ./db.sh users           - Show users"
    echo "  ./db.sh activity        - Show activity feed"
    echo "  ./db.sh stats           - Show record counts"
    echo "  ./db.sh info            - Database info"
    echo "  ./db.sh sql 'SELECT * FROM users'"
    ;;
esac
