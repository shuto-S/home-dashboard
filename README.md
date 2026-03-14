# Home Dashboard

家庭内で使う、サーバレス前提のリビング向けダッシュボードです。ブラウザだけで年月日、現在時刻、天気、Google カレンダーを 1 画面に表示します。

## Features

- 年月日、曜日、現在時刻を常時表示
- Open-Meteo から今日の天気、最高/最低気温、今から先 12 時間の気温と降水確率を取得
- Google Calendar API を使って家族カレンダーを読み取り表示
- 取得失敗時は localStorage のキャッシュを使って表示を継続
- PWA と Service Worker でオフライン時も最後の表示を維持
- 白黒でも読みやすい、低彩度のミニマルレイアウト

## Setup

1. 依存をインストールします。

   ```bash
   npm install
   ```

2. 環境変数を設定します。

   ```bash
   cp .env.example .env
   ```

3. `.env` に以下を設定します。

   - `VITE_LATITUDE`: 自宅の緯度
   - `VITE_LONGITUDE`: 自宅の経度
   - `VITE_TIMEZONE`: 例 `Asia/Tokyo`
   - `VITE_LOCATION_LABEL`: 表示上の地点名。例 `自宅` `世田谷区`
   - `VITE_CALENDAR_ID`: Google 家族カレンダー ID
   - `VITE_GOOGLE_CLIENT_ID`: Google Cloud で作成した OAuth クライアント ID

4. 開発サーバを起動します。

   ```bash
   npm run dev
   ```

5. 家庭内端末に常時表示する場合は、ブラウザを全画面表示にして PWA としてインストールすると運用しやすくなります。

## Google Calendar configuration

- Google Cloud Console で OAuth クライアントを作成し、承認済み JavaScript 生成元にローカルの開発 URL を追加します
- スコープは `https://www.googleapis.com/auth/calendar.readonly` を利用します
- 家族カレンダー ID は Google Calendar の設定画面から取得します

### OAuth setup example

ローカル開発なら、承認済み JavaScript 生成元に以下を追加します。

- `http://localhost:5173`
- `http://127.0.0.1:5173`

家庭内で固定端末に配信する場合は、その URL も追加します。例:

- `http://192.168.1.10:5173`
- `https://dashboard.example.local`

### Calendar ID example

Google カレンダーの対象カレンダーを開き、設定と共有からカレンダー ID を確認します。家族カレンダーなら `xxxx@group.calendar.google.com` 形式になることが多いです。

## Deployment

- 開発確認は `npm run dev`
- 本番配信用ビルドは `npm run build`
- 生成物は `dist/` に出力されるので、静的ホスティングや家庭内の簡易 HTTP 配信にそのまま置けます

家庭内のみで使うなら、以下のどちらかが現実的です。

- 常時起動の Mac や Raspberry Pi 上で `dist/` を静的配信する
- Vercel や Netlify に静的配置し、OAuth 許可オリジンをその URL に合わせる

## Verification checklist

- `.env` 設定後に `npm run dev` で天気が表示される
- Google 連携ボタンから認証し、家族カレンダーが表示される
- ネットワーク遮断時に最後の表示が維持される
- モバイル幅でも 1 画面で情報が崩れない
- `npm run build` が成功する

## Notes

- Google カレンダーは初回のみ認証が必要です
- サーバを持たない前提のため、秘密鍵の保護が必要な API は使っていません
- オフライン時は Service Worker と localStorage のキャッシュを使って最後の表示を継続します
- 実運用では表示端末を自動スリープしない設定にすることを想定しています