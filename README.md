# 選択肢問題WEBアプリ

MySQL を使った選択肢問題学習アプリです。以下の機能を実装しています。

- 既存 `users` テーブルを使ったログイン（`userid` + ハッシュ化パスワード照合）
- DB に保存された章の一覧表示
- 章ごとのクイズ出題と採点
- 章ごとのランキング表示（正答数順）
- 章作成（章タイトル、問題文、選択肢、正解登録）

## 使い方

1. 依存関係をインストール

```bash
npm install
```

2. 環境変数を準備

```bash
cp .env.example .env
```

3. DB にテーブル作成

```bash
mysql -u <user> -p <db_name> < schema.sql
```

4. サーバ起動

```bash
npm start
```

## 既存 users テーブル想定

```sql
users(
  userid VARCHAR(64) PRIMARY KEY,
  display_name VARCHAR(128),
  password_hash VARCHAR(255) NOT NULL
)
```

`password_hash` は `bcrypt` のハッシュを想定しています。
