# =============================================================================
# 出力の検証（原典照合と取りこぼし検出）
# =============================================================================
# LLM の返答をそのまま信じないための、最後の関門です。
#
# 【なぜ必要か】
# 成分の分類を LLM に任せている以上、次の2つの失敗が起こりえます。
#
#   ③ でっちあげ … 成分表に無い成分を、それらしく足してしまう
#   ④ 取りこぼし … 成分表にあるのに、出力から抜け落ちる
#
# どちらも「返ってきた JSON を見ただけ」では気づけません。
# 形式は正しく、内容ももっともらしいからです。
# 気づく方法はひとつだけで、Step 1 で読み取った元の成分表（＝原典）と
# 突き合わせることです。このファイルはそれだけをやります。
#
# 【設計方針：疑わしきは残す】
# 照合は文字列の一致で行うため、表記ゆれで「無い」と誤判定する危険があります。
# 本物の成分を消してしまうと点数そのものが狂うので、
#   ・ゆるめの一致判定を使う
#   ・一致率が極端に低いときは照合自体を信用せず、何も消さない
# という二段構えにしています。消すことより、消しすぎないことを優先します。
#
# 【このファイルも外部と通信しません】
# scoring.py と同じく、入力が同じなら出力も同じ純粋な関数の集まりです。
# =============================================================================

import re
# unicodedata: 全角/半角などの文字の揺れをそろえるための標準ライブラリ
import unicodedata

import config
from schemas import TRIVIAL_INGREDIENT_NAMES


# =============================================================================
# 文字列の正規化
# =============================================================================

# 照合の邪魔になる記号と空白。成分表は書き方の揺れが大きいため先に落とす。
#   例) "ヒアルロン酸Na（保湿）" -> "ヒアルロン酸na保湿"
_NOISE_PATTERN = re.compile(
    r"[\s　・･,，、.。/／\\|:：;；\-−–—ー_()（）\[\]【】「」『』\"'*]+"
)

# 成分表の見出しなど、成分名ではない語。取りこぼしの計算から除く。
_HEADING_WORDS = {
    "全成分", "成分", "有効成分", "その他の成分", "表示成分",
    "配合成分", "ingredients", "ingredient",
}


def normalize(text: str) -> str:
    """照合用に文字列をそろえる。

    大文字小文字・全角半角・記号の有無で「別物」と判定されないよう、
    比較の前に必ずこの関数を通します。

    NFKC: 全角英数を半角にそろえる Unicode の正規化方式。
      これで "Ｎａ" と "Na" が同じものとして扱えるようになります。
    """
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKC", text).lower()
    return _NOISE_PATTERN.sub("", normalized)


def _bigrams(text: str) -> set:
    """文字列を2文字ずつに切り出した集合を返す。

    "ヒアルロン酸" -> {"ヒア", "アル", "ルロ", "ロン", "ン酸"}

    完全一致だけで比べると "水酸化Na" と "水酸化ナトリウム" が別物に
    なってしまいます。2文字の並びがどれくらい共通しているかを見ることで、
    表記ゆれを吸収します。
    """
    return {text[i:i + 2] for i in range(len(text) - 1)}


def _similarity(term: str, target: str, target_bigrams: set) -> float:
    """term が target にどれくらい含まれているかを 0.0〜1.0 で返す。

    (1) そのまま含まれていれば 1.0
    (2) そうでなければ、2文字の並びがどれだけ共通しているかの割合

    短い語は偶然の一致が起きやすいので、(1) しか認めません。
    """
    if not term or not target:
        return 0.0
    if term in target:
        return 1.0
    if len(term) <= config.VERIFY_EXACT_ONLY_LENGTH:
        return 0.0

    grams = _bigrams(term)
    if not grams:
        return 0.0
    return len(grams & target_bigrams) / len(grams)


# =============================================================================
# 原典（Step 1 で読み取った成分表）の準備
# =============================================================================

# 水などの当たり前成分は意図的に出力から外しているので、
# 取りこぼしの計算からも除く（除外を「読み落とし」と数えないため）
_TRIVIAL_KEYS = {normalize(name) for name in TRIVIAL_INGREDIENT_NAMES}


def split_source_terms(source_text: str) -> list[str]:
    """成分表の文字列を、成分名の一覧に分解する。

    全成分表示は「、」や「,」で区切って並べる決まりなので、
    区切り文字で切るだけでおおよその成分名が取り出せます。
    見出し語と、水のような当たり前成分は取り除きます。
    """
    if not source_text:
        return []

    # 区切り文字（読点・カンマ・中黒・スラッシュ・改行）で切る
    parts = re.split(r"[、,，・･/／\n\r]+", source_text)

    terms = []
    for part in parts:
        key = normalize(part)
        # 1文字以下は成分名として扱わない（分割時のかけらであることが多い）
        if len(key) <= 1:
            continue
        if key in _HEADING_WORDS or key in _TRIVIAL_KEYS:
            continue
        terms.append(part.strip())

    return terms


# =============================================================================
# A. 原典照合ガード（でっちあげの排除）
# =============================================================================

def filter_hallucinated(
    ingredients: list[dict],
    source_text: str,
) -> tuple[list[dict], list[str]]:
    """成分表に存在しない成分を取り除く。

    LLM が返した成分ひとつひとつについて、その名前が元の成分表に
    出てくるかを確かめます。出てこないものは、モデルが「ありそうな成分」を
    足してしまったものとみなして落とします。

    照合そのものが怪しいとき（＝ほとんどの成分が一致しないとき）は、
    表記の揺れや読み取り結果の形式が想定外だった可能性が高いので、
    何も落とさずにそのまま返します。誤って本物を消す方が害が大きいためです。

    @return (残した成分リスト, 落とした成分名のリスト)
    """
    if not ingredients or not source_text:
        return ingredients, []

    source_norm = normalize(source_text)
    if not source_norm:
        return ingredients, []
    source_bigrams = _bigrams(source_norm)

    kept = []
    dropped = []
    for item in ingredients:
        # 日本語名と原語名のどちらかが原典にあれば「実在する」と認める
        score = max(
            _similarity(normalize(item.get("name", "")), source_norm, source_bigrams),
            _similarity(normalize(item.get("original_name", "")), source_norm, source_bigrams),
        )
        if score >= config.VERIFY_MATCH_THRESHOLD:
            kept.append(item)
        else:
            dropped.append(item.get("name", ""))

    # --- 安全弁: 一致率が低すぎるときは照合結果を採用しない -----------------
    if len(kept) / len(ingredients) < config.VERIFY_MIN_MATCH_RATIO:
        print(
            "[WARN] 原典照合の一致率が低いため照合を無効化します "
            f"({len(kept)}/{len(ingredients)})"
        )
        return ingredients, []

    if dropped:
        print(f"[INFO] 原典に無い成分を除外しました: {dropped}")

    return kept, dropped


# =============================================================================
# B. 取りこぼし検出
# =============================================================================

def omission_rate(source_terms: list[str], ingredients: list[dict]) -> int:
    """成分表にあったのに出力に載らなかった割合（%）を返す。

    原典側の成分をひとつずつ見て、解析結果の中に対応するものがあるかを
    確かめます。見つからないものが多ければ、画像の読み取りか分類の
    どこかで取りこぼしが起きています。

    A（でっちあげの排除）と向きが逆であることに注意してください。
      A は「出力 -> 原典」を見る（無いものを足していないか）
      B は「原典 -> 出力」を見る（あるものを落としていないか）
    """
    if not source_terms:
        return 0

    # 解析結果側の名前をまとめて1本の文字列にし、そこに含まれるかで判定する
    output_norm = normalize(
        " ".join(
            "{} {}".format(item.get("name", ""), item.get("original_name", ""))
            for item in ingredients
        )
    )
    output_bigrams = _bigrams(output_norm)

    covered = 0
    for term in source_terms:
        key = normalize(term)
        if _similarity(key, output_norm, output_bigrams) >= config.VERIFY_MATCH_THRESHOLD:
            covered += 1

    missing = len(source_terms) - covered
    return round(missing / len(source_terms) * 100)


# =============================================================================
# C. まとめ（画面に返す信頼度の情報）
# =============================================================================

def build_reliability(
    ingredients: list[dict],
    source: str,
    source_text: str,
    dropped_names: list[str],
) -> dict:
    """解析結果がどれくらい確からしいかを、画面に出せる形にまとめる。

    数字を出すだけでなく、利用者が読んで意味のわかる注意文も作ります。
    「わからなかったことを、わからないと言う」ための部分です。

    @param ingredients   照合後に残った成分リスト
    @param source        "image"（成分表を読んだ）/ "web"（検索した）
    @param source_text   Step 1 で読み取った成分表。web 経路では空
    @param dropped_names 原典照合で落とした成分名
    """
    source_terms = split_source_terms(source_text) if source_text else []

    # 原典が無ければ照合していない。数字を出さず、その旨だけを伝える。
    verified = bool(source_terms)
    rate = omission_rate(source_terms, ingredients) if verified else 0

    warnings = []

    if source == "web":
        warnings.append(
            "パッケージから成分表を読み取れなかったため、"
            "商品名をもとにWebで調べた情報で解析しています。"
            "実際の配合と異なる場合があります。"
        )

    if dropped_names:
        warnings.append(
            f"成分表に見当たらなかった成分を{len(dropped_names)}件除外しました。"
        )

    if verified and rate >= config.OMISSION_WARN_RATE:
        warnings.append(
            f"成分表の約{rate}%を解析できていません。"
            "成分表全体がはっきり写るように撮り直すと精度が上がります。"
        )

    return {
        "source": source,
        "verified": verified,
        "source_count": len(source_terms),
        "listed_count": len(ingredients),
        "dropped_count": len(dropped_names),
        "omission_rate": rate,
        "warnings": warnings,
    }
