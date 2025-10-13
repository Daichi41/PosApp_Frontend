
# デプロイ / 運用（Azure）
- Backend: App Service Python / `gunicorn app.main:app --workers 2 --timeout 120`
- Frontend: App Service Node / `NEXT_PUBLIC_API_BASE` を設定
- DB: Outbound IP 許可、`ssl_ca` 指定、PITR/バックアップ確認
