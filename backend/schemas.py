# =============================================================================
# データモデルと、LLM出力の検証
# =============================================================================
# このファイルには2種類のものが入っています。
#
#   1. フロントエンドに返す JSON の「形」の定義（Pydantic モデル）
#   2. LLM が返してきた値を、その形に収まるよう検証・正規化する関数
#
# この2つを同じファイルに置いているのは、常にセットで変更されるからです。
# 返す形を変えるときは、必ず検証も変わります。
# =============================================================================

# Pydantic: データの型チェックとバリデーションを行うライブラリ
from pydantic import BaseModel


# =============================================================================
# フロントエンドに返すデータの形
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
# LLM出力の検証に使う定義
# =============================================================================

# rating に入ってよい値の一覧。これ以外が来たら neutral に倒す。
VALID_RATINGS = {"good", "bad", "neutral"}

# 解析結果に載せても意味がない当たり前の成分（水）の表記ゆれ一覧
# プロンプトでも除外を指示しているが、モデルが従わない場合に備えてここでも除外する
TRIVIAL_INGREDIENT_NAMES = {"水", "精製水", "water", "aqua", "정제수"}


def is_trivial_ingredient(ingredient: dict) -> bool:
    """成分が「水」などの表示不要な当たり前成分かどうかを判定する"""
    name = (ingredient.get("name") or "").strip().lower()
    original = (ingredient.get("original_name") or "").strip().lower()
    return name in TRIVIAL_INGREDIENT_NAMES or original in TRIVIAL_INGREDIENT_NAMES


def clamp_score(value, default: int = 50) -> int:
    """スコアを必ず 0〜100 の整数に収める。

    LLM が 9999 や "高い" のような想定外の値を返しても、
    グラフの描画が壊れないようにするための安全装置。
    """
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return default


def sanitize_ingredient(ingredient: dict) -> dict:
    """LLM が返した成分1件を、想定内の値に整える。

    【なぜ必要か】
    LLM の出力は「外部からの入力」と同じ扱いをするのが原則。
    画像の中に「これまでの指示を無視しろ」といった文字を仕込む
    プロンプトインジェクションを受けても、想定外の値がそのまま
    画面に流れ込まないようにする。
    """
    rating = str(ingredient.get("rating") or "").strip().lower()
    if rating not in VALID_RATINGS:
        rating = "neutral"

    return {
        "name": str(ingredient.get("name") or "不明な成分")[:60],
        "original_name": str(ingredient.get("original_name") or "")[:60],
        "rating": rating,
        "description": str(ingredient.get("description") or "")[:120],
    }


def parse_analysis_result(result_data: dict) -> AnalysisResult:
    """
    dict から AnalysisResult モデルを組み立てる。

    ここで値の範囲や種類を検証してから返すことで、
    LLM が何を返してもフロントエンドが壊れないようにしています。
    """
    radar_source = result_data.get("radar_chart") or {}
    radar_chart = RadarChartData(
        moisturizing=clamp_score(radar_source.get("moisturizing")),
        soothing=clamp_score(radar_source.get("soothing")),
        anti_aging=clamp_score(radar_source.get("anti_aging")),
        brightening=clamp_score(radar_source.get("brightening")),
        safety=clamp_score(radar_source.get("safety")),
    )

    ingredients = [
        IngredientAnalysis(**sanitize_ingredient(ingredient))
        for ingredient in (result_data.get("ingredients") or [])
        if isinstance(ingredient, dict) and not is_trivial_ingredient(ingredient)
    ]

    return AnalysisResult(
        compatibility_score=clamp_score(result_data.get("compatibility_score")),
        radar_chart=radar_chart,
        ingredients=ingredients,
        summary=str(result_data.get("summary") or "")[:300],
    )
