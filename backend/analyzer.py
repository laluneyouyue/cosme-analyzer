# =============================================================================
# 解析の中身（OpenAI とのやり取りと処理の流れ）
# =============================================================================
# 【解析の流れ】
#   Step 1: Vision で画像から成分表を読み取る
#           → 成分が見つかれば → その成分を分類させる
#           → 成分が見つからなければ → 商品名を取得して Step 2 へ
#   Step 2: web_search ツールで商品名から成分を検索し、そのまま分類させる
#   仕上げ: 分類結果を scoring.py に渡して点数を計算する
#
# 【LLM に頼むのは「分類」まで】
# 点数は一切 LLM に出させません。scoring.py が計算します。
# そのためユーザーのプロフィール（肌質・年齢など）を OpenAI に送る必要が
# なくなりました。個人情報を外部に出さずに済むうえ、同じ製品なら
# 常に同じ分類結果が返るので、将来キャッシュすることもできます。
#
# 【このファイルは FastAPI を知りません】
# HTTPステータスコードや Web の作法は main.py 側の担当にして、
# ここは「解析する」という仕事だけに集中させています。
# =============================================================================

import json
import re
from datetime import datetime

# OpenAI: ChatGPTなどを提供しているOpenAIのPythonライブラリ
from openai import OpenAI

import config
import prompts
import scoring
import verification
from schemas import AnalysisResult, UserProfile, sanitize_raw_ingredients


# =============================================================================
# OpenAIクライアントの初期化
# =============================================================================

if not config.OPENAI_API_KEY:
    print("⚠️  警告: OPENAI_API_KEYが設定されていません。.envファイルを確認してください。")

client = OpenAI(
    api_key=config.OPENAI_API_KEY,
    timeout=config.OPENAI_TIMEOUT,
    max_retries=config.OPENAI_MAX_RETRIES,
)


# =============================================================================
# このファイルが投げる例外
# =============================================================================

class AnalysisError(Exception):
    """解析処理そのものが失敗したときの例外（サーバ側の問題）。

    通信エラーやモデルの応答不良など、利用者側では直しようがない失敗。
    → main.py は 500 に変換する。
    """


class ImageUnreadableError(Exception):
    """画像から必要な情報が読み取れなかったときの例外。

    撮り直せば解決する種類の失敗。
    → main.py は 422 に変換する。
    """


# =============================================================================
# ログユーティリティ
# =============================================================================

def save_llm_log(step: str, prompt: str, response_text: str) -> None:
    """
    LLM へのプロンプトとレスポンスをファイルに保存する関数。

    デバッグ時に「何を送って何が返ってきたか」を確認するために使います。

    保存形式:
        logs/YYYYMMDD_HHMMSS_<step>.json

    @param step          ログのラベル（例: "step1_vision", "step2_websearch"）
    @param prompt        LLM に送ったプロンプト文字列
    @param response_text LLM から返ってきたテキスト
    """
    # 保存が無効なら何もせず抜ける（本番はこちら）
    if not config.SAVE_LLM_LOGS:
        return

    # ディレクトリがなければ作成する（exist_ok=True: すでにあってもエラーにしない）
    config.LOG_DIR.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = config.LOG_DIR / f"{timestamp}_{step}.json"

    log_data = {
        "timestamp": datetime.now().isoformat(),
        "step": step,
        "prompt": prompt,
        "response": response_text,
    }

    # ensure_ascii=False: 日本語をそのまま保存（\uXXXX にエスケープしない）
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)

    print(f"📝 LLMログを保存しました: {log_path}")


# =============================================================================
# レスポンスの後処理
# =============================================================================

def extract_json_from_text(text: str) -> dict:
    """
    テキストの中から JSON 部分を抽出して dict に変換するユーティリティ関数。

    web_search 使用時にモデルが返すパターンに対応:
      1. ```json ... ``` のマークダウンコードブロックで囲まれている
      2. JSON の前後に説明文や引用リンクが付いている
    """
    # ① マークダウンコードブロック (```json ... ``` / ``` ... ```) を除去する
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


# =============================================================================
# Step 1: 画像から成分表を読み取る
# =============================================================================

def _read_ingredients_from_image(base64_image: str, content_type: str) -> dict:
    """
    Vision で画像を読み、成分表または商品名を取り出す。

    戻り値の dict:
        {"ingredients_found": bool, "product_name": str|None, "ingredients_text": str|None}
    """
    # Responses API: OpenAI が提供する新しい API インターフェース。
    #   - client.responses.create() を使う
    #   - messages の代わりに input を使う
    #   - レスポンスは resp.output_text で取得
    #   - tools パラメータで web_search などのツールを有効化できる
    try:
        resp = client.responses.create(
            model=config.VISION_MODEL,
            # input にテキストと画像を一緒に渡す（マルチモーダル）
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": prompts.STEP1_VISION_PROMPT,
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
            # json_object を指定するとモデルが必ず JSON を返すよう強制される
            text={"format": {"type": "json_object"}},
            # temperature: 回答のばらつき具合（0〜2）。0 にすると再現性が上がる
            temperature=0,
        )

        data = json.loads(resp.output_text)
        # 画像データは大きいためプロンプトのテキスト部分のみ保存する
        save_llm_log("step1_vision", prompts.STEP1_VISION_PROMPT, resp.output_text)
        return data

    except Exception as e:
        # 詳細はサーバのログにだけ出す。
        # 例外の文面には内部の構成情報が含まれることがあるため利用者には見せない。
        print(f"[ERROR] Step 1 (Vision) 失敗: {e}")
        raise AnalysisError("画像の解析に失敗しました。時間をおいて再度お試しください。")


# =============================================================================
# 読み取れた成分を分類する
# =============================================================================

def _classify_ingredients(ingredients_text: str, product_name: str) -> dict:
    """画像から読み取れた成分を、軸ごとの分類データに変換する。"""
    prompt = prompts.build_classification_prompt(ingredients_text, product_name)

    try:
        resp = client.responses.create(
            model=config.ANALYSIS_MODEL,
            input=prompt,
            text={"format": {"type": "json_object"}},
            max_output_tokens=config.MAX_OUTPUT_TOKENS,
            # 同じ成分なら必ず同じ分類になるようにする
            temperature=0,
        )
        save_llm_log("step1_classify", prompt, resp.output_text)
        return json.loads(resp.output_text)

    except Exception as e:
        print(f"[ERROR] 成分の分類 失敗: {e}")
        raise AnalysisError("成分の解析に失敗しました。時間をおいて再度お試しください。")


# =============================================================================
# Step 2: Web検索で成分を調べて分類する
# =============================================================================

def _search_and_classify(product_name: str) -> dict:
    """商品名から Web 検索で成分を調べ、そのまま分類する。"""
    prompt = prompts.build_search_and_classify_prompt(product_name)

    try:
        # tools=[{"type": "web_search"}]: モデルが必要と判断したときに
        # 自動的にWeb検索を実行できるようにする設定。
        resp = client.responses.create(
            model=config.ANALYSIS_MODEL,
            tools=[{"type": "web_search"}],
            input=prompt,
            # 成分リストが長くなりすぎて JSON が途中で切れないよう上限を設定
            max_output_tokens=config.MAX_OUTPUT_TOKENS,
            temperature=0,
        )

        save_llm_log("step2_websearch", prompt, resp.output_text)

        # web_search 使用時はモデルが余分なテキストを返す場合があるため
        # JSON 抽出ユーティリティで安全にパースする
        return extract_json_from_text(resp.output_text)

    except Exception as e:
        print(f"[ERROR] Step 2 (Web検索) 失敗: {e}")
        raise AnalysisError(
            "商品情報の検索に失敗しました。成分表が写るように撮影してお試しください。"
        )


# =============================================================================
# 分類結果 + プロフィール → 最終的な解析結果
# =============================================================================

def _build_result(
    raw: dict,
    profile: UserProfile,
    fallback_name: str,
    source: str,
    source_text: str = "",
) -> AnalysisResult:
    """LLM の分類結果に検証と採点を加えて、画面に返す形にまとめる。

    @param source_text Step 1 で読み取った成分表。照合の「原典」になる。
                       Web検索経路では原典が存在しないため空文字。
    """
    # ① LLM の出力を、計算に使える形に整える（範囲チェック・水の除外・件数上限）
    ingredients = sanitize_raw_ingredients(raw.get("ingredients"))

    # ② 原典に無い成分（でっちあげ）を落とす。
    #    採点より前に行う。存在しない成分が点数に混ざらないようにするため。
    ingredients, dropped_names = verification.filter_hallucinated(ingredients, source_text)

    if not ingredients:
        raise ImageUnreadableError(
            "成分を読み取れませんでした。成分表がはっきり写るように撮影してください。"
        )

    # ③ 点数の計算はすべて scoring.py が行う
    scored = scoring.score_ingredients(ingredients, profile)

    # ④ この結果がどれくらい確からしいかをまとめる
    reliability = verification.build_reliability(
        ingredients=ingredients,
        source=source,
        source_text=source_text,
        dropped_names=dropped_names,
    )

    # 製品名は分類結果を優先し、無ければ画像から読めた名前を使う
    product_name = str(raw.get("product_name") or "").strip()[:100]
    if not product_name:
        product_name = fallback_name or "名称不明"

    return AnalysisResult(
        product_name=product_name,
        product_summary=str(raw.get("product_summary") or "")[:120],
        source=source,
        reliability=reliability,
        **scored,
    )


# =============================================================================
# 外から呼ばれる入口
# =============================================================================

def analyze_cosmetic(
    base64_image: str,
    content_type: str,
    profile: UserProfile,
) -> AnalysisResult:
    """
    画像とユーザープロファイルから解析結果を組み立てる。

    成分表が読めたかどうかで処理が2通りに分かれる。
    """
    step1_data = _read_ingredients_from_image(base64_image, content_type)

    # 画像から読み取った文字列がそのまま次のプロンプトに混ざる経路なので、
    # 長文の指示を仕込まれないよう文字数を制限する。
    image_product_name = str(step1_data.get("product_name") or "").strip()[:100]

    # ---- 成分表が画像から読み取れた場合 → Web検索は不要 ----
    if step1_data.get("ingredients_found") and step1_data.get("ingredients_text"):
        ingredients_text = str(step1_data["ingredients_text"])[:4000]
        raw = _classify_ingredients(ingredients_text, image_product_name)
        # 読み取った成分表を「原典」として渡し、分類結果と突き合わせる
        return _build_result(
            raw, profile, image_product_name,
            source="image",
            source_text=ingredients_text,
        )

    # ---- 成分表が見つからなかった場合 → Web検索で取得 ----
    if not image_product_name:
        raise ImageUnreadableError(
            "画像から成分表も商品名も読み取れませんでした。成分表が写るように撮影してください。"
        )

    # Web検索経路には突き合わせる原典が無い。照合できないことを隠さず、
    # source="web" として画面に「検索結果に基づく」と表示する。
    raw = _search_and_classify(image_product_name)
    return _build_result(raw, profile, image_product_name, source="web")
