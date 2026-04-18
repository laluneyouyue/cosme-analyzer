# =============================================================================
# コスメ成分解析アプリ - バックエンドサーバー
# =============================================================================
# このファイルはFastAPIを使ったWebサーバーのメインファイルです。
# フロントエンドから送られてきた画像とユーザープロファイルを受け取り、
# OpenAI APIのVision機能で成分表を解析して結果を返します。
# =============================================================================

import os
import base64
import json
from typing import Optional

# FastAPI: Pythonで高速なWebAPIを作るためのフレームワーク
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
# CORS: フロントエンド(別のポート)からのリクエストを許可するための設定
from fastapi.middleware.cors import CORSMiddleware
# Pydantic: データの型チェックとバリデーションを行うライブラリ
from pydantic import BaseModel

# OpenAI: ChatGPTなどを提供しているOpenAIのPythonライブラリ
from openai import OpenAI

# python-dotenv: .envファイルから環境変数を読み込むライブラリ
from dotenv import load_dotenv

# .envファイルを読み込む（APIキーなどの秘密情報をコードに直接書かないための仕組み）
load_dotenv()

# =============================================================================
# FastAPIアプリケーションの初期化
# =============================================================================
app = FastAPI(
    title="コスメ成分解析API",
    description="コスメのパッケージ画像から成分を読み取り、ユーザープロファイルとの相性を解析します",
    version="1.0.0",
)

# =============================================================================
# CORS（クロスオリジンリソース共有）の設定
# =============================================================================
# フロントエンド（localhost:5173）からバックエンド（localhost:8000）への
# リクエストを許可する設定。開発中は全オリジンを許可しています。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # フロントエンドのURL
    allow_credentials=True,
    allow_methods=["*"],   # GET, POST, PUT, DELETEなど全メソッドを許可
    allow_headers=["*"],   # 全ヘッダーを許可
)

# =============================================================================
# OpenAIクライアントの初期化
# =============================================================================
# 環境変数からAPIキーを読み込んでOpenAIクライアントを作成
# APIキーが設定されていない場合はエラーメッセージを表示
openai_api_key = os.environ.get("OPENAI_API_KEY")
if not openai_api_key:
    print("⚠️  警告: OPENAI_API_KEYが設定されていません。.envファイルを確認してください。")

client = OpenAI(api_key=openai_api_key)

# =============================================================================
# データモデルの定義（Pydanticを使用）
# =============================================================================

class UserProfile(BaseModel):
    """ユーザープロファイルのデータ構造を定義するクラス"""
    skin_type: str = "普通肌"                    # 肌質（例: 敏感肌、乾燥肌、脂性肌）
    personal_color: str = "ブルベ夏"              # パーソナルカラー
    desired_effects: str = "保湿・透明感"          # 重視する効果
    avoid_ingredients: str = "エタノール"          # 避けたい成分

class IngredientAnalysis(BaseModel):
    """個別の成分解析結果のデータ構造"""
    name: str               # 成分名（日本語）
    original_name: str      # 元の成分名（外国語の場合）
    rating: str             # 評価: "good"（良）/ "bad"（悪）/ "neutral"（普通）
    description: str        # 成分の簡単な解説

class RadarChartData(BaseModel):
    """レーダーチャート用のスコアデータ"""
    moisturizing: int       # 保湿力 (0-100)
    soothing: int           # 鎮静力 (0-100)
    anti_aging: int         # エイジングケア (0-100)
    brightening: int        # 透明感・美白 (0-100)
    safety: int             # 安全性・低刺激 (0-100)

class AnalysisResult(BaseModel):
    """解析結果全体のデータ構造（フロントエンドに返すJSONの形）"""
    compatibility_score: int                    # 相性スコア (0-100)
    radar_chart: RadarChartData                 # レーダーチャート用データ
    ingredients: list[IngredientAnalysis]       # 成分リスト
    summary: str                                # 総合コメント

# =============================================================================
# APIエンドポイントの定義
# =============================================================================

@app.get("/")
async def root():
    """動作確認用のエンドポイント"""
    return {"message": "コスメ成分解析APIが起動しています 🌸"}

@app.post("/analyze", response_model=AnalysisResult)
async def analyze_ingredients(
    # UploadFile: フロントエンドから送られてきた画像ファイルを受け取る
    image: UploadFile = File(..., description="コスメのパッケージ画像"),
    # Form: フロントエンドから送られてきたフォームデータ（テキスト）を受け取る
    skin_type: str = Form(default="普通肌"),
    personal_color: str = Form(default="ブルベ夏"),
    desired_effects: str = Form(default="保湿・透明感"),
    avoid_ingredients: str = Form(default=""),
):
    """
    コスメ画像と成分を解析するメインエンドポイント

    フロントエンドからの画像とユーザープロファイルを受け取り、
    OpenAI APIで解析して結果を返します。
    """

    # -------------------------------------------------------------------------
    # ステップ1: 画像ファイルの読み込みとBase64エンコード
    # -------------------------------------------------------------------------
    # OpenAI APIに画像を送るために、画像データをBase64という形式に変換します。
    # Base64は画像などのバイナリデータをテキスト（文字列）に変換する方法です。
    try:
        image_data = await image.read()  # ファイルの内容を読み込む
        base64_image = base64.b64encode(image_data).decode("utf-8")  # Base64に変換

        # 画像のMIMEタイプを判定（JPEG/PNG/WebPなど）
        # MIMEタイプ: ファイルの種類を表す識別子（例: image/jpeg）
        content_type = image.content_type or "image/jpeg"
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"画像の読み込みに失敗しました: {str(e)}")

    # -------------------------------------------------------------------------
    # ステップ2: OpenAI APIへのプロンプト（指示文）を作成
    # -------------------------------------------------------------------------
    # OpenAIに何をしてほしいか、どんな形式で返してほしいかを指示するテキストです。
    prompt = f"""
あなたはコスメ成分の専門家です。
提供された画像からコスメの成分表を読み取り、以下のユーザープロファイルとの相性を分析してください。

【ユーザープロファイル】
- 肌質: {skin_type}
- パーソナルカラー: {personal_color}
- 重視する効果: {desired_effects}
- 避けたい成分: {avoid_ingredients if avoid_ingredients else "特になし"}

【分析の手順】
1. 画像から成分表のテキストをすべて読み取る
2. 成分名が外国語（韓国語・英語など）の場合は、まず日本語に翻訳する
3. 各成分のプロファイルへの適合度を評価する
4. 総合的な相性スコアを算出する

【返答形式】
必ず以下のJSON形式のみで返答してください。それ以外のテキストは一切含めないでください。

{{
  "compatibility_score": 相性スコア(0-100の整数),
  "radar_chart": {{
    "moisturizing": 保湿力スコア(0-100),
    "soothing": 鎮静力スコア(0-100),
    "anti_aging": エイジングケアスコア(0-100),
    "brightening": 透明感・美白スコア(0-100),
    "safety": 安全性・低刺激スコア(0-100)
  }},
  "ingredients": [
    {{
      "name": "日本語の成分名",
      "original_name": "画像に記載されていた元の成分名",
      "rating": "good または bad または neutral",
      "description": "この成分についての簡単な解説（30文字以内）"
    }}
  ],
  "summary": "このコスメとあなたの相性についての総合コメント（100文字以内）"
}}

成分が読み取れない場合は、サンプルデータとして一般的なスキンケア成分で分析してください。
"""

    # -------------------------------------------------------------------------
    # ステップ3: OpenAI APIにリクエストを送信（Vision機能を使用）
    # -------------------------------------------------------------------------
    # Vision機能: テキストだけでなく画像も一緒に送って分析できるOpenAIの機能
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # gpt-4o-miniを使用
            messages=[
                {
                    "role": "user",
                    "content": [
                        # テキストの指示（プロンプト）
                        {
                            "type": "text",
                            "text": prompt
                        },
                        # 画像データ（Base64形式）
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{content_type};base64,{base64_image}",
                                "detail": "high"  # 画像の解析精度を高く設定
                            }
                        }
                    ]
                }
            ],
            # temperature: 回答のランダム性（0に近いほど一定した回答）
            # JSONを確実に返すために低く設定
            temperature=0,
            # max_tokens: 回答の最大文字数（トークン数）
            max_tokens=2000,
            # response_format: JSON形式で返答を強制する設定
            response_format={"type": "json_object"},
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"OpenAI APIへのリクエストに失敗しました: {str(e)}"
        )

    # -------------------------------------------------------------------------
    # ステップ4: OpenAIのレスポンスをパース（解析）してPythonオブジェクトに変換
    # -------------------------------------------------------------------------
    try:
        # OpenAIからの返答テキストを取得
        response_text = response.choices[0].message.content

        # JSON文字列をPythonの辞書（dict）に変換
        result_data = json.loads(response_text)

        # Pydanticモデルに変換（型チェックとバリデーションを行う）
        # RadarChartDataオブジェクトを作成
        radar_chart = RadarChartData(**result_data["radar_chart"])

        # 各成分のIngredientAnalysisオブジェクトを作成
        ingredients = [
            IngredientAnalysis(**ingredient)
            for ingredient in result_data["ingredients"]
        ]

        # 最終的なAnalysisResultオブジェクトを作成して返す
        return AnalysisResult(
            compatibility_score=result_data["compatibility_score"],
            radar_chart=radar_chart,
            ingredients=ingredients,
            summary=result_data["summary"]
        )

    except (json.JSONDecodeError, KeyError, TypeError) as e:
        # JSONのパースに失敗した場合はエラーを返す
        raise HTTPException(
            status_code=500,
            detail=f"APIレスポンスの解析に失敗しました: {str(e)}"
        )


# =============================================================================
# サーバー起動（このファイルを直接実行した場合のみ）
# =============================================================================
# ターミナルで「python main.py」と実行した場合に起動します。
# 通常は「uvicorn main:app --reload」コマンドで起動します。
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
