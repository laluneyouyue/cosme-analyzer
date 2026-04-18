# =============================================================================
# コスメ成分解析アプリ - バックエンドサーバー
# =============================================================================
# このファイルはFastAPIを使ったWebサーバーのメインファイルです。
# フロントエンドから送られてきた画像とユーザープロファイルを受け取り、
# OpenAI Responses APIで成分表を解析して結果を返します。
#
# 【解析の流れ】
#   Step 1: Responses API + Vision で画像から成分表を読み取る
#           → 成分が見つかれば → そのまま相性解析して結果を返す
#           → 成分が見つからなければ → 商品名を取得して Step 2 へ
#   Step 2: Responses API + web_search ツールで商品名を検索し成分を取得
#           → 取得した成分で相性解析して結果を返す
# =============================================================================

import os
import base64
import json
import re
from datetime import datetime
from pathlib import Path

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
    version="2.0.0",
)

# =============================================================================
# CORS（クロスオリジンリソース共有）の設定
# =============================================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# OpenAIクライアントの初期化
# =============================================================================
openai_api_key = os.environ.get("OPENAI_API_KEY")
if not openai_api_key:
    print("⚠️  警告: OPENAI_API_KEYが設定されていません。.envファイルを確認してください。")

client = OpenAI(api_key=openai_api_key)

# =============================================================================
# データモデルの定義（Pydanticを使用）
# =============================================================================

class IngredientAnalysis(BaseModel):
    """個別の成分解析結果のデータ構造"""
    name: str           # 成分名（日本語）
    original_name: str  # 元の成分名（外国語の場合）
    rating: str         # 評価: "good" / "bad" / "neutral"
    description: str    # 成分の簡単な解説

class RadarChartData(BaseModel):
    """レーダーチャート用のスコアデータ"""
    moisturizing: int   # 保湿力 (0-100)
    soothing: int       # 鎮静力 (0-100)
    anti_aging: int     # エイジングケア (0-100)
    brightening: int    # 透明感・美白 (0-100)
    safety: int         # 安全性・低刺激 (0-100)

class AnalysisResult(BaseModel):
    """解析結果全体のデータ構造（フロントエンドに返すJSONの形）"""
    compatibility_score: int              # 相性スコア (0-100)
    radar_chart: RadarChartData           # レーダーチャート用データ
    ingredients: list[IngredientAnalysis] # 成分リスト
    summary: str                          # 総合コメント

# =============================================================================
# ユーティリティ関数
# =============================================================================

# =============================================================================
# ログユーティリティ
# =============================================================================

# ログの保存先ディレクトリ（main.py と同じ階層に logs/ フォルダを作成）
LOG_DIR = Path(__file__).parent / "logs"

def save_llm_log(step: str, prompt: str, response_text: str) -> None:
    """
    LLM へのプロンプトとレスポンスをファイルに保存する関数。

    デバッグ時に「何を送って何が返ってきたか」を確認するために使います。

    保存形式:
        logs/YYYYMMDD_HHMMSS_<step>.json
        例: logs/20260419_153012_step1_vision.json

    @param step          ログのラベル（例: "step1_vision", "step2_websearch"）
    @param prompt        LLM に送ったプロンプト文字列
    @param response_text LLM から返ってきたテキスト
    """
    # ディレクトリがなければ作成する（exist_ok=True: すでにあってもエラーにしない）
    LOG_DIR.mkdir(exist_ok=True)

    # ファイル名にタイムスタンプを付けて一意にする
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"{timestamp}_{step}.json"

    log_data = {
        "timestamp": datetime.now().isoformat(),  # ISO形式の日時文字列
        "step": step,
        "prompt": prompt,
        "response": response_text,
    }

    # ensure_ascii=False: 日本語をそのまま保存（\uXXXX にエスケープしない）
    # indent=2: 読みやすいように 2スペースでインデント
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)

    print(f"📝 LLMログを保存しました: {log_path}")


def build_analysis_prompt(
    ingredients_text: str,
    skin_type: str,
    personal_color: str,
    desired_effects: str,
    avoid_ingredients: str,
    source_note: str = "",
) -> str:
    """
    成分テキストとユーザープロファイルから解析プロンプトを組み立てる関数。

    プロンプトは複数の場所から使い回すため、関数として切り出しています。
    source_note: 成分の取得元（画像 or Web検索）を示す補足文言
    """
    return f"""
あなたはコスメ成分の専門家です。
以下の成分情報とユーザープロファイルをもとに相性を分析してください。
{source_note}

【成分情報】
{ingredients_text}

【ユーザープロファイル】
- 肌質: {skin_type}
- パーソナルカラー: {personal_color}
- 重視する効果: {desired_effects}
- 避けたい成分: {avoid_ingredients if avoid_ingredients else "特になし"}

【分析の手順】
1. 成分名が外国語（韓国語・英語など）の場合は、まず日本語に翻訳する
2. 各成分のプロファイルへの適合度を評価する
3. 総合的な相性スコアを算出する

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
      "original_name": "元の成分名（日本語の場合は同じ値）",
      "rating": "good または bad または neutral",
      "description": "この成分についての簡単な解説（30文字以内）"
    }}
  ],
  "summary": "このコスメとあなたの相性についての総合コメント（100文字以内）"
}}
"""


def extract_json_from_text(text: str) -> dict:
    """
    テキストの中から JSON 部分を抽出して dict に変換するユーティリティ関数。

    web_search 使用時にモデルが返すパターンに対応:
      1. ```json ... ``` のマークダウンコードブロックで囲まれている
      2. JSON の前後に説明文や引用リンクが付いている
    """
    # ① マークダウンコードブロック (```json ... ``` / ``` ... ```) を除去する
    # re.sub(パターン, 置換後, 対象文字列): パターンに一致した部分を置換する
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = re.sub(r"```", "", cleaned).strip()

    # ② そのままパースを試みる（コードブロック除去で解決する場合）
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # ③ 最初の { から最後の } までを取り出して再試行
    # re.DOTALL: . が改行にもマッチするようにするフラグ
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"レスポンスから JSON を抽出できませんでした。レスポンス先頭: {text[:200]}")


def parse_analysis_result(result_data: dict) -> AnalysisResult:
    """
    dict から AnalysisResult Pydantic モデルを組み立てるユーティリティ関数。
    2つのステップで同じ変換が必要なため共通化しています。
    """
    radar_chart = RadarChartData(**result_data["radar_chart"])
    ingredients = [
        IngredientAnalysis(**ingredient)
        for ingredient in result_data["ingredients"]
    ]
    return AnalysisResult(
        compatibility_score=result_data["compatibility_score"],
        radar_chart=radar_chart,
        ingredients=ingredients,
        summary=result_data["summary"],
    )

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
):
    """
    コスメ画像と成分を解析するメインエンドポイント。

    Step 1: Vision で画像から成分を抽出（成分あり → 解析して返す）
    Step 2: 成分なし → Web 検索で商品の成分を取得 → 解析して返す
    """

    # -------------------------------------------------------------------------
    # 画像の読み込みと Base64 エンコード
    # -------------------------------------------------------------------------
    try:
        image_data = await image.read()
        base64_image = base64.b64encode(image_data).decode("utf-8")
        content_type = image.content_type or "image/jpeg"
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"画像の読み込みに失敗しました: {str(e)}")

    # =========================================================================
    # Step 1: Responses API + Vision で画像から成分を読み取る
    # =========================================================================
    # Responses API: OpenAI が提供する新しい API インターフェース。
    # Chat Completions API との主な違い:
    #   - client.responses.create() を使う
    #   - messages の代わりに input を使う
    #   - レスポンスは resp.output_text で取得
    #   - tools パラメータで web_search などのツールを有効化できる
    # =========================================================================

    step1_prompt = f"""
あなたはコスメ成分の専門家です。
提供された画像を注意深く確認してください。

【確認すること】
1. 画像にコスメの成分表（Ingredients / 전성분 / 成分 などの表示）があるか
2. ある場合 → 成分をすべて書き出す
3. ない場合 → 商品名・ブランド名を読み取る

【返答形式】
必ず以下の JSON のみで返答してください。

成分表が見つかった場合:
{{
  "ingredients_found": true,
  "product_name": "読み取れた商品名（不明なら null）",
  "ingredients_text": "成分1, 成分2, 成分3, ..."
}}

成分表が見つからなかった場合:
{{
  "ingredients_found": false,
  "product_name": "読み取れた商品名またはブランド名（不明なら null）",
  "ingredients_text": null
}}
"""

    try:
        # Responses API で Vision リクエストを送信
        step1_resp = client.responses.create(
            model="gpt-4o-mini",
            # input にテキストと画像を一緒に渡す（マルチモーダル）
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": step1_prompt,
                        },
                        {
                            "type": "input_image",
                            # data URL 形式: "data:MIMEタイプ;base64,Base64文字列"
                            "image_url": f"data:{content_type};base64,{base64_image}",
                            "detail": "high",  # 高解像度モードで画像を解析
                        },
                    ],
                }
            ],
            # text.format: Responses API でレスポンス形式を指定する方法
            # json_object を指定するとモデルが必ず JSON を返すよう強制される
            text={"format": {"type": "json_object"}},
        )

        # output_text: Responses API でのレスポンステキストの取得方法
        step1_data = json.loads(step1_resp.output_text)

        # プロンプトと生レスポンスをファイルに保存（デバッグ用）
        # 画像データは大きいためプロンプトのテキスト部分のみ保存する
        save_llm_log("step1_vision", step1_prompt, step1_resp.output_text)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Step 1 (Vision) の処理に失敗しました: {str(e)}",
        )

    # =========================================================================
    # Step 1 の結果で分岐
    # =========================================================================

    if step1_data.get("ingredients_found") and step1_data.get("ingredients_text"):
        # -----------------------------------------------------------------
        # 成分表が画像から読み取れた場合 → Step 2 不要、直接解析する
        # -----------------------------------------------------------------
        ingredients_text = step1_data["ingredients_text"]
        source_note = "※ 成分は画像の成分表から読み取りました。"

        analysis_prompt = build_analysis_prompt(
            ingredients_text=ingredients_text,
            skin_type=skin_type,
            personal_color=personal_color,
            desired_effects=desired_effects,
            avoid_ingredients=avoid_ingredients,
            source_note=source_note,
        )

        try:
            analysis_resp = client.responses.create(
                model="gpt-4o-mini",
                input=analysis_prompt,
                text={"format": {"type": "json_object"}},
            )
            save_llm_log("step1_analysis", analysis_prompt, analysis_resp.output_text)
            result_data = json.loads(analysis_resp.output_text)
            return parse_analysis_result(result_data)

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"成分解析の処理に失敗しました: {str(e)}",
            )

    else:
        # -----------------------------------------------------------------
        # 成分表が画像に見つからなかった場合 → Step 2: Web 検索で取得
        # -----------------------------------------------------------------
        product_name = step1_data.get("product_name")
        if not product_name:
            raise HTTPException(
                status_code=422,
                detail="画像から成分表も商品名も読み取れませんでした。成分表が写るように撮影してください。",
            )

        # =================================================================
        # Step 2: Responses API + web_search ツールで成分を検索・解析
        # =================================================================
        # tools=[{"type": "web_search"}]: モデルが必要と判断したときに
        # 自動的にWeb検索を実行できるようにする設定。
        # モデルは検索結果を参照したうえで最終的なテキストを生成する。
        # =================================================================

        search_and_analyze_prompt = f"""
あなたはコスメ成分の専門家です。
「{product_name}」というコスメ製品の成分（全成分）を Web で検索して調べてください。

成分が判明したら、以下のユーザープロファイルとの相性を分析し、
必ず JSON 形式のみで返答してください。

【ユーザープロファイル】
- 肌質: {skin_type}
- パーソナルカラー: {personal_color}
- 重視する効果: {desired_effects}
- 避けたい成分: {avoid_ingredients if avoid_ingredients else "特になし"}

【分析の手順】
1. 成分名が外国語（韓国語・英語など）の場合は日本語に翻訳する
2. 各成分のプロファイルへの適合度を評価する
3. 総合的な相性スコアを算出する

【返答形式】
JSON のみで返答してください（説明文・引用・コードブロックは不要）。
成分が多い場合は代表的な20種類までに絞ってください。

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
      "original_name": "元の成分名（日本語なら同じ値）",
      "rating": "good または bad または neutral",
      "description": "この成分についての簡単な解説（30文字以内）"
    }}
  ],
  "summary": "Web検索で取得した成分をもとに解析しました。{product_name}とあなたの相性コメント（100文字以内）"
}}
"""

        try:
            # web_search ツールを有効にして Responses API を呼び出す
            # モデルは自動的に検索が必要と判断したとき tool を実行し、
            # 結果を踏まえて最終テキスト（output_text）を生成する
            step2_resp = client.responses.create(
                model="gpt-4o-mini",
                tools=[{"type": "web_search"}],
                input=search_and_analyze_prompt,
                # 成分リストが長くなりすぎてJSONが途中で切れないよう上限を設定
                max_output_tokens=4096,
            )

            # web_search 使用時はモデルが余分なテキストを返す場合があるため
            # JSON 抽出ユーティリティで安全にパースする
            save_llm_log("step2_websearch", search_and_analyze_prompt, step2_resp.output_text)
            result_data = extract_json_from_text(step2_resp.output_text)
            return parse_analysis_result(result_data)

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Step 2 (Web検索) の処理に失敗しました: {str(e)}",
            )


# =============================================================================
# サーバー起動（このファイルを直接実行した場合のみ）
# =============================================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
