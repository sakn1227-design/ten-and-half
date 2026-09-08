# Vercel / Supabase 本番公開チェックリスト

## Supabase

- [ ] Anonymous Sign-InsをON
- [ ] `supabase/migrations/001_init.sql`を実行
- [ ] `supabase/verify.sql`で`field_card_secrets`のSELECTがfalseであることを確認
- [ ] Realtime publicationに`rooms / players / field_cards / player_cards / game_results / game_events`が含まれることを確認
- [ ] `field_card_secrets`がRealtime publicationに含まれていないことを確認

## Vercel

- [ ] GitHubリポジトリをImport
- [ ] `VITE_SUPABASE_URL`を設定
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY`を設定
- [ ] Service Role Keyを設定していないことを確認
- [ ] Build Command = `npm run build`
- [ ] Output Directory = `dist`

## 公開後

- [ ] `/?room=XXXXXX`の招待URLが参加画面を開く
- [ ] iPhone Safariでsafe-areaにボタンが隠れない
- [ ] 2台以上でRealtime反映を確認
- [ ] 「3・2・1・せーの！」が全端末で表示される
- [ ] 一時切断 → 復帰時にDBから最新状態を復元する
- [ ] 10.5宣言 / BUST / SHOWDOWNの表示を確認
