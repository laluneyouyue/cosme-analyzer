# =============================================================================
# データモデルと、LLM出力の検証
# =============================================================================
# このファイルには2種類のものが入っています。
#
#   1. フロントエンドに返す JSON の「形」の定義（Pydantic モデル）
#   2. LLM が返してきた値を、扱える形に検証・正規化する関数
#
# この2つを同じファイルに置いているのは、常にセットで変更されるからです。
# 返す形を変えるときは、必ず検証も変わります。
#
# 【設計方針】
# LLM の出力は「外部からの入力」と同じ扱いをします。
# 画像に「これまでの指示を無視しろ」といった文字を仕込むプロンプト
# インジェクションを受けても、想定外の値がそのまま画面に流れ込まないよう、
# ここで必ず範囲と種類を確認してから先に進めます。
# =============================================================================

# Pydantic: データの型チェックとバリデーションを行うライブラリ
from pydantic import BaseModel

import config


# =============================================================================
# ユーザープロファイル（解析の入力）
# =============================================================================

class UserProfile(BaseModel):
    """解析に使うユーザーの条件。

    パーソナルカラーは成分表から判定できないため、ここには含めません。
    （プロフィール画面では設定できますが、解析には送っていません）
    """
    skin_type: str            # 乾燥肌 / 脂性肌 / 混合肌 / 敏感肌 / 普通肌 など
    age_group: str            # 10代 / 20代 / 30代 / 40代 / 50代以上
    desired_effects: list[str]  # 重視する効果（AXIS_LABELS の表示名の配列）
    avoid_ingredients: list[str]  # 避けたい成分名


# =============================================================================
# フロントエンドに返すデータの形
# =============================================================================

class AxisScores(BaseModel):
    """5軸それぞれのスコア (0-100)。

    レーダーチャートの外側（製品の実力）と内側（あなたが求めるもの）の
    両方でこの形を使います。
    """
    moisturizing: int = 0   # 保湿・うるおい
    soothing: int = 0       # 鎮静・肌あれケア
    anti_aging: int = 0     # ハリ・エイジングケア
    brightening: int = 0    # 透明感・くすみケア
    pore: int = 0           # 毛穴・皮脂ケア


class IngredientAnalysis(BaseModel):
    """個別の成分の解析結果。

    rating は LLM ではなく Python が決めます（scoring.py 参照）。
    """
    name: str              # 成分名（日本語）
    original_name: str     # 元の成分名（外国語の場合）
    description: str       # 成分の簡単な解説
    rating: str            # 評価: "good" / "bad" / "neutral"
    position: int          # 成分表の何番目か（1始まり）
    is_top_ranked: bool    # 配合上位かどうか（バッジ表示用）
    is_avoided: bool       # 「避けたい成分」に該当したか
    irritation_risk: int   # 刺激リスク (0-3)


class Reliability(BaseModel):
    """この解析結果がどれくらい確からしいか。

    「点数がいくつか」だけを返すと、それがしっかり読み取れた成分表から
    出たものなのか、半分しか読めなかった写真から出たものなのかが区別できません。
    LLM を使う以上どうしても誤りは残るので、精度そのものを上げる努力とは別に、
    「どこまで確からしいか」を隠さず一緒に返すことにしています。

    値は verification.py が計算します（LLM には作らせません）。
    """
    source: str            # "image"（成分表を読んだ）/ "web"（商品名から検索した）
    verified: bool         # 元の成分表と突き合わせたか（web 経路では False）
    source_count: int      # 元の成分表から数えた成分の件数
    listed_count: int      # 解析結果に載せた成分の件数
    dropped_count: int     # 成分表に見当たらず除外した件数
    omission_rate: int     # 取りこぼし率 (0-100 の%)
    warnings: list[str]    # 画面に出す注意文（無ければ空）


class AnalysisResult(BaseModel):
    """解析結果全体のデータ構造（フロントエンドに返すJSONの形）"""
    product_name: str                        # 製品名（読み取れなければ「名称不明」）
    product_summary: str                     # この製品がどういう製品かの説明
    compatibility_score: int                 # 相性スコア (0-100)
    score_reason: str                        # なぜその点数なのかの説明（Python生成）
    radar_product: AxisScores                # レーダー外側: この製品の実力
    radar_need: AxisScores                   # レーダー内側: あなたが求めるもの
    axis_contributors: dict[str, list[str]]  # 軸ごとに効いている成分名
    irritation_level: str                    # "低" / "中" / "高"
    irritation_reasons: list[str]            # 刺激リスクの根拠になった成分名
    ingredients: list[IngredientAnalysis]    # 成分リスト
    source: str                              # "image"（成分表を読んだ）/ "web"（検索した）
    reliability: Reliability                 # この結果の確からしさ


# =============================================================================
# LLM出力の検証
# =============================================================================

# 解析結果に載せても意味がない当たり前の成分（水）の表記ゆれ一覧
# プロンプトでも除外を指示しているが、モデルが従わない場合に備えてここでも除外する
TRIVIAL_INGREDIENT_NAMES = {"水", "精製水", "water", "aqua", "정제수"}


def is_trivial_ingredient(ingredient: dict) -> bool:
    """成分が「水」などの表示不要な当たり前成分かどうかを判定する"""
    name = (ingredient.get("name") or "").strip().lower()
    original = (ingredient.get("original_name") or "").strip().lower()
    return name in TRIVIAL_INGREDIENT_NAMES or original in TRIVIAL_INGREDIENT_NAMES


def clamp_int(value, low: int, high: int, default: int) -> int:
    """値を必ず low〜high の整数に収める。

    LLM が 9999 や "強い" のような想定外の値を返しても、
    後続の計算やグラフの描画が壊れないようにするための安全装置。
    """
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def sanitize_raw_ingredient(raw: dict, fallback_position: int) -> dict:
    """LLM が返した成分1件を、計算に使える形に整える。

    @param raw               LLM の返答に含まれていた成分1件
    @param fallback_position position が欠けていたときに使う順番（1始まり）
    """
    effects_source = raw.get("effects")
    if not isinstance(effects_source, dict):
        effects_source = {}

    # 5軸それぞれを 0〜3 に収める。未知のキーは無視される
    effects = {
        axis: clamp_int(effects_source.get(axis), 0, 3, 0)
        for axis in config.AXES
    }

    return {
        "name": str(raw.get("name") or "不明な成分")[:60],
        "original_name": str(raw.get("original_name") or "")[:60],
        "description": str(raw.get("description") or "")[:120],
        # position は 1〜999。欠けていればリスト上の順番で代用する
        "position": clamp_int(raw.get("position"), 1, 999, fallback_position),
        "effects": effects,
        "irritation_risk": clamp_int(raw.get("irritation_risk"), 0, 3, 0),
        "low_dose_active": bool(raw.get("low_dose_active")),
    }


def sanitize_raw_ingredients(raw_list) -> list[dict]:
    """LLM が返した成分リスト全体を整える。

    水などの当たり前成分を除外し、件数の上限も掛けます。
    """
    if not isinstance(raw_list, list):
        return []

    cleaned = []
    for index, raw in enumerate(raw_list, start=1):
        if not isinstance(raw, dict):
            continue
        if is_trivial_ingredient(raw):
            continue
        cleaned.append(sanitize_raw_ingredient(raw, fallback_position=index))

    return cleaned[: config.MAX_INGREDIENTS]


# =============================================================================
# 画面から送られてきた文字列をプロフィールに組み立てる
# =============================================================================

def _split_terms(text: str) -> list[str]:
    """カンマ区切りの文字列を配列に分解する。

    半角カンマ・全角カンマ・読点のどれで区切られていても受け付けます。
    """
    if not text:
        return []
    normalized = text.replace("、", ",").replace("，", ",")
    return [term.strip() for term in normalized.split(",") if term.strip()]


def build_profile(
    skin_type: str,
    age_group: str,
    desired_effects: str,
    avoid_ingredients: str,
) -> UserProfile:
    """フォームの文字列から UserProfile を組み立てる。

    desired_effects は "保湿・うるおい,透明感・くすみケア" のような
    カンマ区切りで送られてきます。フォームの項目を配列にせず文字列のままに
    しているのは、通信の形を単純に保つためです。
    """
    return UserProfile(
        skin_type=(skin_type or "").strip()[:20] or "普通肌",
        age_group=(age_group or "").strip()[:20] or "30代",
        desired_effects=_split_terms(desired_effects)[:5],
        avoid_ingredients=_split_terms(avoid_ingredients)[:20],
    )
