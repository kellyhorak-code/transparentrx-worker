#!/bin/bash
echo "📊 Database Status"
echo "=================="
echo ""
echo "Tables:"
wrangler d1 execute transparentrx-db --command="SELECT name FROM sqlite_master WHERE type='table';" 2>/dev/null
echo ""
echo "Drug Count:"
wrangler d1 execute transparentrx-db --command="SELECT COUNT(*) as count FROM ndc_master;" 2>/dev/null
echo ""
echo "Activity Messages:"
wrangler d1 execute transparentrx-db --command="SELECT COUNT(*) as count FROM activity_feed;" 2>/dev/null
echo ""
echo "Sample Drugs:"
wrangler d1 execute transparentrx-db --command="SELECT ndc_11, proprietary_name FROM ndc_master LIMIT 5;" 2>/dev/null
