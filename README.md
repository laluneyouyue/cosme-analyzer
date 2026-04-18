# コスメ成分相性解析アプリ 🌸

コスメのパッケージ裏面を撮影するだけで、あなたの肌質やパーソナルカラーに合った成分かどうかをAIが判定してくれるアプリです。

## ✨ アプリの機能

- 📷 **カメラ撮影** — スマホの背面カメラでコスメの成分表をそのまま撮影
- 🔍 **Web検索フォールバック** — 成分表が写っていない場合は商品名でWeb検索して成分を自動取得
- 🌍 **多言語対応** — 韓国語・英語の成分表も日本語に翻訳して解析
- 💯 **相性スコア** — あなたのプロファイルとの相性を0〜100%で表示
- 📊 **レーダーチャート** — 保湿・鎮静・エイジングケアなど成分の傾向を視覚化
- 🟢🔴 **成分ハイライト** — 良い成分は緑、注意成分は赤で一目でわかる
- 🕒 **解析履歴** — 過去の解析結果をページ更新後も保持。個別選択・一括削除に対応
- 💾 **設定の永続化** — プロファイル設定はブラウザを閉じても保持される

## 🛠️ 使用技術

| 領域 | 技術 |
|------|------|
| フロントエンド | React 19 + TypeScript + Vite |
| スタイリング | Tailwind CSS v4 |
| グラフ描画 | Recharts |
| HTTP通信 | Axios |
| バックエンド | Python 3.11+ + FastAPI |
| AI解析 | OpenAI Responses API (gpt-4o-mini / Vision + Web Search) |
| 環境変数管理 | python-dotenv |
| データ永続化 | localStorage（プロファイル・履歴・画像） |

## 📁 ディレクトリ構成

```
cosme-analyzer/
├── frontend/                # フロントエンド (React + TypeScript)
│   ├── src/
│   │   ├── App.tsx          # ルートコンポーネント（画面切り替え・履歴管理）
│   │   ├── api.ts           # バックエンドとの通信処理
│   │   ├── types.ts         # TypeScript型定義
│   │   ├── index.css        # グローバルスタイル
│   │   └── components/
│   │       ├── HomePage.tsx    # ホーム画面（カメラ撮影）
│   │       ├── ProfilePage.tsx # プロファイル設定画面
│   │       ├── ResultPage.tsx  # 解析結果画面
│   │       └── HistoryPage.tsx # 解析履歴画面（選択削除対応）
│   ├── vite.config.ts       # Vite設定（Tailwindプラグイン、APIプロキシ）
│   └── package.json
│
├── backend/                 # バックエンド (Python + FastAPI)
│   ├── main.py              # FastAPIアプリ本体（APIエンドポイント定義）
│   ├── requirements.txt     # Pythonパッケージの一覧
│   ├── .env.example         # 環境変数の設定例（これをコピーして.envを作成）
│   └── logs/                # LLMデバッグログ（.gitignore対象）
│       └── YYYYMMDD_HHMMSS_<step>.json  # プロンプト・レスポンスの記録
│
├── .gitignore               # Gitで管理しないファイルの設定
└── README.md                # このファイル
```

## 🚀 ローカルでの起動手順

### 必要なもの

- **Node.js** 18以上（[公式サイト](https://nodejs.org/)からインストール）
- **Python** 3.11以上（[公式サイト](https://www.python.org/)からインストール）
- **OpenAI APIキー**（[platform.openai.com](https://platform.openai.com/api-keys) で取得）

> ⚠️ **Web検索機能について**: OpenAI の Web Search 機能（Responses API）を使用しています。
> APIキーに Web Search の利用権限があることを確認してください。

---

### ステップ1: リポジトリをクローン（またはフォルダをダウンロード）

```bash
git clone <リポジトリのURL>
cd cosme-analyzer
```

---

### ステップ2: バックエンドのセットアップ

```bash
# backendフォルダに移動
cd backend

# Python仮想環境を作成（プロジェクト専用のPython環境）
python -m venv .venv

# 仮想環境を有効化
# Windowsの場合:
.venv\Scripts\activate

# Mac/Linuxの場合:
source .venv/bin/activate

# 必要なパッケージをインストール
pip install -r requirements.txt
```

---

### ステップ3: 環境変数（.env）の設定

```bash
# .env.example をコピーして .env ファイルを作成
# Windowsの場合:
copy .env.example .env

# Mac/Linuxの場合:
cp .env.example .env
```

作成した `.env` ファイルをテキストエディタで開き、APIキーを設定します:

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx  ← ここにあなたのAPIキーを入力
```

> ⚠️ **注意**: `.env` ファイルは絶対にGitにコミットしないでください！
> `.gitignore` に設定済みなので、通常は自動的に除外されます。

---

### ステップ4: バックエンドサーバーを起動

```bash
# backendフォルダで以下を実行（仮想環境が有効な状態で）
uvicorn main:app --reload --port 8000
```

ブラウザで `http://localhost:8000` にアクセスして
`{"message": "コスメ成分解析APIが起動しています 🌸"}` と表示されれば成功です！

---

### ステップ5: フロントエンドのセットアップと起動

**新しいターミナルを開いて**以下を実行します:

```bash
# frontendフォルダに移動
cd cosme-analyzer/frontend

# npmパッケージをインストール
npm install

# 開発サーバーを起動
npm run dev
```

ブラウザで `http://localhost:5173` にアクセスするとアプリが表示されます 🎉

---

## 📱 スマホで試す方法

開発サーバーを起動した状態で、スマホのブラウザから
`http://[パソコンのIPアドレス]:5173` にアクセスすると
スマホでも動作確認できます。

パソコンのIPアドレスは以下のコマンドで確認できます:
- Windows: `ipconfig` → IPv4アドレス
- Mac/Linux: `ifconfig` または `ip addr`

---

## 🔑 APIの仕様

バックエンドが起動中に `http://localhost:8000/docs` にアクセスすると、
FastAPIが自動生成するAPIドキュメント（Swagger UI）を確認できます。

### エンドポイント一覧

| メソッド | パス | 説明 |
|--------|------|------|
| GET | `/` | 動作確認用 |
| POST | `/analyze` | 画像解析（メイン機能） |

### `/analyze` の処理フロー

```
画像受信
  ↓
Step 1: Responses API + Vision（画像から成分表を読み取る）
  ├─ 成分表あり → 成分を解析して結果を返す
  └─ 成分表なし（商品名を取得）
        ↓
      Step 2: Responses API + Web Search（商品名で成分を検索・解析）
        └─ 結果を返す
```

### LLMデバッグログ

解析実行のたびに `backend/logs/` にプロンプトとレスポンスがJSON形式で保存されます。
Web検索が正しく動いているか確認したい場合はこのファイルを参照してください。

```
backend/logs/
├── 20260419_153012_step1_vision.json      # 画像から成分抽出
├── 20260419_153013_step1_analysis.json    # 成分→相性解析（成分あり時）
└── 20260419_153021_step2_websearch.json   # Web検索+解析（成分なし時）
```

---

## 🤝 学習ポイント

このプロジェクトは初学者がAPI連携とUI構築を学ぶために設計されています。

### フロントエンド

| ファイル | 学べること |
|---------|-----------|
| `frontend/src/api.ts` | axiosでのHTTPリクエスト、FormDataの使い方 |
| `frontend/src/App.tsx` | useStateによるSPA画面管理、localStorageでの永続化 |
| `frontend/src/components/HomePage.tsx` | `input[type=file capture="environment"]`でカメラ起動、FileReaderでdata URL変換 |
| `frontend/src/components/ResultPage.tsx` | Rechartsのレーダーチャートの実装 |
| `frontend/src/components/HistoryPage.tsx` | Setを使った複数選択UIの実装 |

### バックエンド

| ファイル | 学べること |
|---------|-----------|
| `backend/main.py` | FastAPIエンドポイント定義、OpenAI Responses API（Vision・Web Search）の呼び出し方 |

### データ永続化の仕組み

```
プロファイル設定
  → localStorage["cosme_analyzer_profile"] に JSON で保存
  → 起動時に読み込んで useState の初期値に使う

解析履歴
  → 画像を canvas でリサイズ（max 480px / JPEG 60%）してから data URL に変換
  → 解析結果と一緒に localStorage["cosme_analyzer_history"] に保存
  → 最大20件を超えたら古いものを自動削除
```
