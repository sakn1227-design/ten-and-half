# 10.5 — Party Card Game

友人同士がスマートフォンを持ち寄って遊ぶ、リアルタイム・パーティーカードゲームです。React + TypeScript + Vite + Supabaseで実装し、Vercelへそのままデプロイできる構成です。

## 主な機能

- 6桁ルームコード / `?room=XXXXXX` 招待URL
- Supabase Anonymous Authでログイン不要
- Realtime同期 + Presence接続表示 + 復帰時DB再取得
- 初期カードはRLSで本人だけに公開
- 未公開の場札は`field_card_secrets`へ分離し、ホストを含むクライアントAPIから取得不可
- A=1、2〜10=数値、J/Q/K=0.5（内部はhalf-units整数管理）
- 2〜3人=場札5枚、4〜5人=6枚、6人以上=7枚
- ホストによる口頭オークション結果記録
- 全端末同期の「3・2・1・せーの！」演出 / TIE BREAK
- カード3Dフリップ、獲得、10.5宣言、BUST、SHOWDOWN演出
- 効果音・振動・アニメーション軽減設定
- 10.5宣言時は最初のカードだけ公開
- BUST優先の敗者判定、同点時の口数分割
- PWA manifest / Service Worker / iPhone safe-area対応
- Vitest単体テスト / PlaywrightモバイルE2E雛形 / GitHub Actions CI

## 技術スタック

React 19 / TypeScript / Vite / Supabase Auth・PostgreSQL・Realtime・RLS・RPC / Vitest / Playwright / Vercel。

アニメーションはiPhone Safariでの軽さを優先し、GPUフレンドリーな`transform` / `opacity`中心のCSSで実装しています。`prefers-reduced-motion`にも対応します。

## 1. Supabaseセットアップ

1. SupabaseでProjectを作成
2. **Authentication → Providers → Anonymous Sign-Ins** をON
3. SQL Editorで `supabase/migrations/001_init.sql` を実行
4. `supabase/verify.sql` を実行し、秘密テーブルの権限を確認

### セキュリティ設計

秘密情報はCSSで隠す方式ではありません。

- `player_cards`: 本人 (`owner_user_id = auth.uid()`) または公開済み行だけSELECT可能
- `field_card_secrets`: `authenticated`にも直接SELECT権限なし
- `field_cards`: 未公開中は`rank / suit / value_half_units`がNULL。公開RPCがサーバー側で秘密テーブルからコピー
- ホスト専用操作: UIだけでなくSECURITY DEFINER RPC内でも`host_user_id`を検証
- 10.5宣言: DB側で合計21 half-unitsか検証
- カード獲得: 対象カードを`FOR UPDATE`でロックし二重獲得を防止
- ゲーム値: 0.5単位を整数で保持し、JS/SQLの浮動小数点判定を回避
- `game_events`: 演出同期用。未公開カード情報はpayloadへ入れない

**Service Role Keyはフロントエンドへ設定しないでください。**

## 2. 環境変数

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

旧Supabaseプロジェクトでは`VITE_SUPABASE_ANON_KEY`も利用できます。

## 3. ローカル起動

```bash
npm install
npm run dev
```

## 4. テスト / ビルド

```bash
npm run typecheck
npm test
npm run build
```

実DBを使うE2E:

```bash
npx playwright install webkit
E2E_SUPABASE_URL="https://...supabase.co" \
E2E_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..." \
npm run test:e2e
```

E2E用Supabase環境変数がない場合、Playwrightはセットアップ画面のモバイルsmoke testのみ実行し、実DBマルチプレイヤーテストをskipします。

## 5. Vercelへデプロイ

1. このGitHubリポジトリをVercelへImport
2. Environment Variablesへ以下を設定
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. Deploy

`vercel.json`はFramework=Vite、Build=`npm run build`、Output=`dist`を指定済みです。

本番前チェック:

```bash
npm run check:env
npm test
npm run build
```

## ゲームルール

- A=1 / 2〜10=数字どおり / J・Q・K=0.5
- 合計10.5なら宣言可能
- 11以上はBUST
- BUSTが1人以上いればBUSTした全員が敗者
- BUSTがいなければ合計最小のプレイヤーが敗者
- 負け基本4口 + 10.5宣言者1人につき4口
- 同点負けは総口数を敗者人数で分割

## ディレクトリ

```text
src/
  components/       # カード、モーダル、演出
  features/
    home/
    game/
    result/
  hooks/
  lib/
supabase/
  migrations/
  verify.sql
e2e/
.github/workflows/
```

## PWA / オフラインについて

manifestと最小限のService Workerを含みます。Service Workerはアプリシェルと同一オリジン静的ファイルをキャッシュしますが、ゲーム状態のsource of truthは常にSupabaseです。オフライン中にゲームを進行させる設計ではありません。

## 実機確認の推奨手順

1. iPhone SafariとAndroid Chromeの2〜3台で同じルームへ参加
2. ホスト開始後、各端末で自分の初期カードだけ見えることを確認
3. 他人の秘密カードがDevTools / Supabase APIでも取得できないことを確認
4. 場札公開 → 最終オークション → 獲得を確認
5. 獲得者だけ合計が更新されることを確認
6. 10.5宣言で最初のカードだけ公開されることを確認
7. BUSTが本人以外へ漏れないことを確認
8. Safariをバックグラウンドへ送り、復帰後に状態が再取得されることを確認
9. SHOWDOWNで全カードと敗者・口数が表示されることを確認

詳しい公開チェックは`DEPLOY.md`を参照してください。
