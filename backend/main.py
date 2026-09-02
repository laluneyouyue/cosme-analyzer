# =============================================================================
# コスメ成分解析アプリ - バックエンドサーバー
# =============================================================================
# このファイルは Web の窓口（ルーティング）だけを担当します。
#
#   ・リクエストを受け取る
#   ・送られてきたものが妥当かを確認する（合言葉・画像の形式とサイズ）
#   ・解析は analyzer.py に任せる
#   ・失敗を HTTP のステータスコードに翻訳して返す
#
# 【ファイル構成】
#   main.py      ← ここ。Web の窓口
#   config.py    設定値（環境変数・モデル名・上限値）
#   schemas.py   返すデータの形と、LLM出力の検証
#   prompts.py   LLM に送る文言
#   analyzer.py  解析の流れと OpenAI とのやり取り
# =============================================================================

import base64
# secrets: 暗号的に安全な比較を行うための標準ライブラリ
import secrets

# FastAPI: Pythonで高速なWebAPIを作るためのフレームワーク
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Header
# CORS: フロントエンド(別のポート)からのリクエストを許可するための設定
from fastapi.middleware.cors import CORSMiddleware

import config
from analyzer import analyze_cosmetic, AnalysisError, ImageUnreadableError
from schemas import AnalysisResult

# =============================================================================
# FastAPIアプリケーションの初期化
# =============================================================================
app = FastAPI(
    title="コスメ成分解析API",
    description="コスメのパッケージ画像から成分を読み取り、ユーザープロファイルとの相性を解析します",
    version="2.0.0",
)

# =============================================================================
# CORS（クロスオリジンリソース共有）の設定
# =============================================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    # Cookie やログインセッションを使っていないので False にする。
    # True のままだと不要な権限を開けたままになる。
    allow_credentials=False,
    # 実際に使うメソッドだけに絞る（このAPIは GET と POST しか使わない）
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# =============================================================================
# リクエストの検証
# =============================================================================

def verify_app_secret(x_app_secret: str) -> None:
    """Cloudflare 経由で来たリクエストかどうかを確認する。

    本番では Cloudflare 側が X-App-Secret ヘッダーを付けて転送してくる。
    一致しないリクエスト（サーバのURLを直接叩かれた等）はここで拒否する。
    APP_SECRET が未設定のローカル開発では、この検証は素通りする。

    secrets.compare_digest: 1文字目が違っても最後まで比較する関数。
      普通の == は途中で打ち切るため「何文字目まで合っていたか」が
      応答時間の差として漏れる。秘密の値を比べるときはこちらを使う。
    """
    if config.APP_SECRET and not secrets.compare_digest(x_app_secret, config.APP_SECRET):
        raise HTTPException(status_code=401, detail="アクセスが許可されていません")


async def read_validated_image(image: UploadFile) -> tuple[str, str]:
    """画像を検証して、Base64文字列とMIMEタイプを返す。

    受け取ったデータを信用せず、種類とサイズを先に確認する。
    """
    if image.content_type not in config.ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="対応していない画像形式です。JPEG / PNG / WebP を使用してください。",
        )

    try:
        image_data = await image.read()
    except Exception as e:
        print(f"[ERROR] 画像の読み込みに失敗: {e}")
        raise HTTPException(status_code=400, detail="画像の読み込みに失敗しました。")

    if not image_data:
        raise HTTPException(status_code=400, detail="画像が空です。")

    if len(image_data) > config.MAX_IMAGE_BYTES:
        # 413 = Payload Too Large（送られたデータが大きすぎる）
        raise HTTPException(
            status_code=413,
            detail="画像サイズが大きすぎます（10MBまで）。",
        )

    base64_image = base64.b64encode(image_data).decode("utf-8")
    content_type = image.content_type or "image/jpeg"
    return base64_image, content_type


# =============================================================================
# APIエンドポイントの定義
# =============================================================================

@app.get("/")
async def root():
    """動作確認用のエンドポイント"""
    return {"message": "コスメ成分解析APIが起動しています 🌸"}


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_ingredients(
    image: UploadFile = File(..., description="コスメのパッケージ画像"),
    skin_type: str = Form(default="普通肌"),
    personal_color: str = Form(default="ブルベ夏"),
    desired_effects: str = Form(default="保湿・透明感"),
    avoid_ingredients: str = Form(default=""),
    # Header: HTTPヘッダーの値を受け取る仕組み。
    # x_app_secret という引数名は自動的に "X-App-Secret" ヘッダーに対応する。
    x_app_secret: str = Header(default=""),
):
    """
    コスメ画像と成分を解析するメインエンドポイント。

    Step 1: Vision で画像から成分を抽出（成分あり → 解析して返す）
    Step 2: 成分なし → Web 検索で商品の成分を取得 → 解析して返す
    """
    verify_app_secret(x_app_secret)
    base64_image, content_type = await read_validated_image(image)

    # 解析そのものは analyzer.py に任せ、
    # 失敗したときだけ HTTP のステータスコードに翻訳する。
    try:
        return analyze_cosmetic(
            base64_image=base64_image,
            content_type=content_type,
            skin_type=skin_type,
            personal_color=personal_color,
            desired_effects=desired_effects,
            avoid_ingredients=avoid_ingredients,
        )
    except ImageUnreadableError as e:
        # 422 = 送られた内容は正しい形だが、処理できる中身ではなかった。
        # 撮り直せば解決するので、利用者に何をすべきか伝える。
        raise HTTPException(status_code=422, detail=str(e))
    except AnalysisError as e:
        # 500 = サーバ側の問題。利用者にできることはない。
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# サーバー起動（このファイルを直接実行した場合のみ）
# =============================================================================
if __name__ == "__main__":
    import uvicorn
    # 第1引数は app オブジェクトではなく "ファイル名:変数名" の文字列で渡す。
    # reload=True（保存時の自動再起動）は、uvicorn が自分でファイルを
    # 読み直す必要があるため、文字列でないと起動を拒否される。
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
