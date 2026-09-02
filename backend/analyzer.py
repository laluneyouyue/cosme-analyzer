# =============================================================================
# 解析の中身（OpenAI とのやり取りと処理の流れ）
# =============================================================================
# 【解析の流れ】
#   Step 1: Responses API + Vision で画像から成分表を読み取る
#           → 成分が見つかれば → そのまま相性解析して結果を返す
#           → 成分が見つからなければ → 商品名を取得して Step 2 へ
#   Step 2: Responses API + web_search ツールで商品名を検索し成分を取得
#           → 取得した成分で相性解析して結果を返す
#
# 【このファイルは FastAPI を知りません】
# HTTPステータスコードや Web の作法は main.py 側の担当にして、
# ここは「解析する」という仕事だけに集中させています。
# 失敗したときは下で定義する独自の例外を投げ、
# それを HTTP の何番に変換するかは main.py が決めます。
#
# こうしておくと、将来この解析処理を Web 以外（バッチ処理や
# コマンドラインツール）から呼びたくなったときにそのまま使えます。
# =============================================================================

import json
import re
from datetime import datetime

# OpenAI: ChatGPTなどを提供しているOpenAIのPythonライブラリ
from openai import OpenAI

import config
import prompts
from schemas import AnalysisResult, parse_analysis_result


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
    """解析処理そのものが失敗したときの例外。

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
        例: logs/20260419_153012_step1_vision.json

    @param step          ログのラベル（例: "step1_vision", "step2_websearch"）
    @param prompt        LLM に送ったプロンプト文字列
    @param response_text LLM から返ってきたテキスト
    """
    # 保存が無効なら何もせず抜ける（本番はこちら）
    if not config.SAVE_LLM_LOGS:
        return

    # ディレクトリがなければ作成する（exist_ok=True: すでにあってもエラーにしない）
    config.LOG_DIR.mkdir(exist_ok=True)

    # ファイル名にタイムスタンプを付けて一意にする
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = config.LOG_DIR / f"{timestamp}_{step}.json"

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
    # Chat Completions API との主な違い:
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
            # text.format: Responses API でレスポンス形式を指定する方法
            # json_object を指定するとモデルが必ず JSON を返すよう強制される
            text={"format": {"type": "json_object"}},
            # temperature: 回答のばらつき具合を決めるパラメータ（0〜2）。
            # 既定値では毎回わずかに違う答えを返すため、同じ画像でも結果がブレる。
            # 0 にすると「一番もっともらしい答え」だけを選ぶようになり、再現性が上がる。
            temperature=0,
        )

        # output_text: Responses API でのレスポンステキストの取得方法
        data = json.loads(resp.output_text)

        # プロンプトと生レスポンスをファイルに保存（デバッグ用）
        # 画像データは大きいためプロンプトのテキスト部分のみ保存する
        save_llm_log("step1_vision", prompts.STEP1_VISION_PROMPT, resp.output_text)

        return data

    except Exception as e:
        # 詳細はサーバのログにだけ出す。
        # 例外の文面には内部の構成情報が含まれることがあるため利用者には見せない。
        print(f"[ERROR] Step 1 (Vision) 失敗: {e}")
        raise AnalysisError("画像の解析に失敗しました。時間をおいて再度お試しください。")


# =============================================================================
# 読み取れた成分から相性を解析する
# =============================================================================

def _analyze_known_ingredients(
    ingredients_text: str,
    skin_type: str,
    personal_color: str,
    desired_effects: str,
    avoid_ingredients: str,
) -> AnalysisResult:
    """画像から読み取れた成分をもとに相性を解析する。"""
    prompt = prompts.build_analysis_prompt(
        ingredients_text=ingredients_text,
        skin_type=skin_type,
        personal_color=personal_color,
        desired_effects=desired_effects,
        avoid_ingredients=avoid_ingredients,
        source_note="※ 成分は画像の成分表から読み取りました。",
    )

    try:
        resp = client.responses.create(
            model=config.ANALYSIS_MODEL,
            input=prompt,
            text={"format": {"type": "json_object"}},
            # 同じ成分・同じプロファイルなら同じスコアが出るようにする
            temperature=0,
        )
        save_llm_log("step1_analysis", prompt, resp.output_text)
        return parse_analysis_result(json.loads(resp.output_text))

    except Exception as e:
        print(f"[ERROR] 成分解析 失敗: {e}")
        raise AnalysisError("成分の解析に失敗しました。時間をおいて再度お試しください。")


# =============================================================================
# Step 2: Web検索で成分を調べて相性を解析する
# =============================================================================

def _search_and_analyze(
    product_name: str,
    skin_type: str,
    personal_color: str,
    desired_effects: str,
    avoid_ingredients: str,
) -> AnalysisResult:
    """商品名から Web 検索で成分を調べ、相性を解析する。"""
    prompt = prompts.build_search_and_analyze_prompt(
        product_name=product_name,
        skin_type=skin_type,
        personal_color=personal_color,
        desired_effects=desired_effects,
        avoid_ingredients=avoid_ingredients,
    )

    try:
        # tools=[{"type": "web_search"}]: モデルが必要と判断したときに
        # 自動的にWeb検索を実行できるようにする設定。
        # モデルは検索結果を参照したうえで最終的なテキストを生成する。
        resp = client.responses.create(
            model=config.ANALYSIS_MODEL,
            tools=[{"type": "web_search"}],
            input=prompt,
            # 成分リストが長くなりすぎてJSONが途中で切れないよう上限を設定
            max_output_tokens=config.STEP2_MAX_OUTPUT_TOKENS,
            # 同じ成分・同じプロファイルなら同じスコアが出るようにする
            temperature=0,
        )

        save_llm_log("step2_websearch", prompt, resp.output_text)

        # web_search 使用時はモデルが余分なテキストを返す場合があるため
        # JSON 抽出ユーティリティで安全にパースする
        return parse_analysis_result(extract_json_from_text(resp.output_text))

    except Exception as e:
        print(f"[ERROR] Step 2 (Web検索) 失敗: {e}")
        raise AnalysisError(
            "商品情報の検索に失敗しました。成分表が写るように撮影してお試しください。"
        )


# =============================================================================
# 外から呼ばれる入口
# =============================================================================

def analyze_cosmetic(
    base64_image: str,
    content_type: str,
    skin_type: str,
    personal_color: str,
    desired_effects: str,
    avoid_ingredients: str,
) -> AnalysisResult:
    """
    画像とユーザープロファイルから解析結果を組み立てる。

    成分表が読めたかどうかで処理が2通りに分かれる。
    """
    step1_data = _read_ingredients_from_image(base64_image, content_type)

    # ---- 成分表が画像から読み取れた場合 → Step 2 不要、直接解析する ----
    if step1_data.get("ingredients_found") and step1_data.get("ingredients_text"):
        return _analyze_known_ingredients(
            ingredients_text=step1_data["ingredients_text"],
            skin_type=skin_type,
            personal_color=personal_color,
            desired_effects=desired_effects,
            avoid_ingredients=avoid_ingredients,
        )

    # ---- 成分表が見つからなかった場合 → Web検索で取得 ----
    # 画像から読み取った文字列がそのまま次のプロンプトに混ざる唯一の経路なので、
    # 長文の指示を仕込まれないよう100文字で切り詰める。
    product_name = str(step1_data.get("product_name") or "").strip()[:100]
    if not product_name:
        raise ImageUnreadableError(
            "画像から成分表も商品名も読み取れませんでした。成分表が写るように撮影してください。"
        )

    return _search_and_analyze(
        product_name=product_name,
        skin_type=skin_type,
        personal_color=personal_color,
        desired_effects=desired_effects,
        avoid_ingredients=avoid_ingredients,
    )
