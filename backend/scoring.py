# =============================================================================
# 採点ロジック
# =============================================================================
# LLM には「成分ごとの分類」だけをさせ、点数の計算はすべてこのファイルで行います。
#
# 【なぜ LLM に採点させないのか】
# LLM に「0〜100点で相性を答えて」と頼むと、73点と78点の違いを定義した人が
# 誰もいないため、それらしい数字が毎回生成されるだけになります。
# 同じ画像でも結果がブレますし、「なぜその点数か」を説明できません。
#
# LLM が得意なのは「セラミドは保湿成分である」という分類・判断です。
# 苦手なのは、それらを総合して目盛りの合った数値にすることです。
# そこで役割を分けています。
#
#   LLM    … 成分ごとに 0〜3 の4段階で分類する（得意）
#   Python … その合計から点数を計算する（確実・毎回同じ・説明できる）
#
# このファイルの関数はすべて「入力が同じなら出力も同じ」です。
# 外部と通信しないので、動きを追うのも直すのも簡単です。
# =============================================================================

import config


# =============================================================================
# 表示名 ⇄ 軸キーの変換
# =============================================================================

# {"保湿・うるおい": "moisturizing", ...} という逆引き表を作る
_LABEL_TO_AXIS = {label: axis for axis, label in config.AXIS_LABELS.items()}


def to_axis_keys(desired_effects: list[str]) -> list[str]:
    """プロフィールの「重視する効果」を軸キーの一覧に変換する。

    画面からは表示名（"保湿・うるおい"）で送られてきますが、
    キー（"moisturizing"）が直接来ても受け付けます。
    知らない値は無視します。
    """
    keys = []
    for effect in desired_effects:
        name = (effect or "").strip()
        axis = _LABEL_TO_AXIS.get(name)
        if axis is None and name in config.AXES:
            axis = name
        if axis and axis not in keys:
            keys.append(axis)
    return keys


# =============================================================================
# ① 配合量の重み
# =============================================================================

def ingredient_weight(position: int, total: int, low_dose_active: bool) -> float:
    """成分1件の重みを求める。

    全成分表示は配合量の多い順に並べる規則があるため、成分表の順番を
    「どれくらい入っているか」の代理指標として使います。
    後ろの成分ほど軽く扱いますが、MIN_WEIGHT より下には落としません。

    ただしレチノールやナイアシンアミドのように少量でも効く成分は、
    順番が後ろでも効果が落ちないので重みを下げません。
    """
    if low_dose_active:
        return 1.0
    if total <= 0:
        return 1.0
    return max(config.MIN_WEIGHT, 1.0 - position / total)


def _total_positions(ingredients: list[dict]) -> int:
    """成分表全体のおおよその長さ。

    水などを除外しているため手元のリストは実際より短いことがあります。
    一番大きい position を全体の長さの目安として使います。
    """
    if not ingredients:
        return 0
    return max(item["position"] for item in ingredients)


# =============================================================================
# ② 製品の軸スコア（レーダーの外側）
# =============================================================================

def product_axis_scores(ingredients: list[dict]) -> tuple[dict, dict]:
    """成分リストから、5軸それぞれのスコア (0-100) を計算する。

    @return (軸スコアの辞書, 軸ごとに効いている成分名の辞書)
    """
    total = _total_positions(ingredients)

    # 軸ごとの生の合計値と、貢献した成分の記録
    raw_totals = {axis: 0.0 for axis in config.AXES}
    contributions = {axis: [] for axis in config.AXES}

    for item in ingredients:
        weight = ingredient_weight(item["position"], total, item["low_dose_active"])
        for axis in config.AXES:
            level = item["effects"][axis]
            if level <= 0:
                continue
            contribution = level * weight
            raw_totals[axis] += contribution
            contributions[axis].append((contribution, item["name"]))

    # 生の合計を 0〜100 に変換する。
    # AXIS_FULL_SCORE に達したら満点、という単純な比例。
    # 満点の基準は軸ごとに違う（保湿だけ重い）。理由は config.py に書いています。
    scores = {
        axis: min(100, round(raw_totals[axis] / config.AXIS_FULL_SCORE[axis] * 100))
        for axis in config.AXES
    }

    # 「この軸に効いています」として画面に出す成分を、貢献の大きい順に選ぶ
    contributors = {}
    for axis in config.AXES:
        ranked = sorted(contributions[axis], key=lambda pair: pair[0], reverse=True)
        contributors[axis] = [
            name for _, name in ranked[: config.MAX_CONTRIBUTORS_PER_AXIS]
        ]

    return scores, contributors


# =============================================================================
# ③ 採点対象の軸と、その重み
# =============================================================================

def axis_weights(desired_axes: list[str]) -> dict:
    """どの軸を採点に使うかを決める。

    選んだ軸だけが 1.0、それ以外は 0.0 です。
    重み 0 の軸は、いくら高くても低くても点数に影響しません。

    【なぜ「求めていない軸」を計算から外すのか】
    以前は5軸すべてに「求める水準」を置き、重なった割合で採点していました。
    しかしそれだと、保湿だけを求めている人に保湿100点のクリームを見せても
    71点にしかなりませんでした。求めてもいない4軸を満たせないことが、
    減点として効いていたためです。

    「求めていないものができていない」のは、その人にとって欠点ではない。
    そう考えて、採点対象を本人が選んだ軸だけに限定しました。

    ひとつも選んでいない場合だけ、5軸すべてを平等に見ます（＝総合力）。
    このとき点数が低めに出るのは正しい挙動です。
    ほとんどの製品は特定の効果に振っていて、万能ではないためです。
    """
    if not desired_axes:
        return {axis: config.FOCUS_WEIGHT for axis in config.AXES}
    return {
        axis: (config.FOCUS_WEIGHT if axis in desired_axes else 0.0)
        for axis in config.AXES
    }


def age_hint_axes(desired_axes: list[str], age_group: str) -> list[str]:
    """年代からの「この軸も見ておくといいかも」を返す。

    点数には一切影響しません。すでに選んでいる軸は重複するので外します。

    年代を点数に反映させないのは、本人が選んでいない軸で減点することに
    なるからです。かわりに情報として画面に出し、選ぶかどうかは本人に任せます。
    """
    hints = config.AGE_FOCUS_AXES.get(age_group, [])
    return [axis for axis in hints if axis not in desired_axes]


# =============================================================================
# ④ 刺激リスク
# =============================================================================

def irritation_assessment(ingredients: list[dict]) -> tuple[str, list[str]]:
    """刺激リスクを「低・中・高」で判定し、根拠になった成分名を返す。

    効果の軸と違い、これは全員にとって「低いほうがいい」性質のものなので、
    レーダーには載せず独立して表示します。
    """
    total = _total_positions(ingredients)

    raw = 0.0
    risky = []
    for item in ingredients:
        risk = item["irritation_risk"]
        if risk <= 0:
            continue
        weight = ingredient_weight(item["position"], total, item["low_dose_active"])
        raw += risk * weight
        # リスク2以上のものだけを「根拠」として画面に出す
        if risk >= 2:
            risky.append((risk * weight, item["name"]))

    if raw < config.IRRITATION_THRESHOLD_LOW:
        level = "低"
    elif raw < config.IRRITATION_THRESHOLD_HIGH:
        level = "中"
    else:
        level = "高"

    risky.sort(key=lambda pair: pair[0], reverse=True)
    reasons = [name for _, name in risky[:3]]

    return level, reasons


# =============================================================================
# ⑤ 「避けたい成分」との照合
# =============================================================================

def is_avoided(ingredient: dict, avoid_terms: list[str]) -> bool:
    """成分が「避けたい成分」に該当するか判定する。

    表記ゆれに対応するため、完全一致ではなく「含まれていれば該当」とします。
    （例: 避けたい「香料」 → 成分「合成香料」も該当させる）
    """
    haystack = f"{ingredient['name']} {ingredient['original_name']}".lower()
    return any(term.lower() in haystack for term in avoid_terms)


# =============================================================================
# ⑥ 成分ごとの評価（good / bad / neutral）
# =============================================================================

def rate_ingredient(ingredient: dict, desired_axes: list[str], avoided: bool) -> str:
    """成分1件の評価を決める。

    LLM に判定させず、明確なルールで決めます。
      bad     : 避けたい成分に該当、または刺激リスクが2以上
      good    : あなたが重視する軸に、はっきり貢献している（2以上）
      neutral : それ以外
    """
    if avoided or ingredient["irritation_risk"] >= 2:
        return "bad"

    for axis in desired_axes:
        if ingredient["effects"].get(axis, 0) >= 2:
            return "good"

    return "neutral"


# =============================================================================
# ⑦ 相性スコア
# =============================================================================

def compatibility_score(
    product: dict,
    weights: dict,
    avoid_hit_count: int,
    irritation_level: str,
    skin_type: str,
) -> int:
    """相性スコア (0-100) を計算する。

    考え方は「あなたが選んだ効果を、この製品がどれだけ持っているか」。

        素点 = Σ(製品の軸スコア × 重み) / Σ重み

    重みは選んだ軸が1、それ以外が0なので、実際には
    **選んだ軸の平均点そのもの**です。

    レーダーチャートで選んだ軸の値を平均すれば、この数字になります。
    グラフと点数が一致するので、「なぜこの点数なのか」を目で確かめられます。
    """
    total_weight = sum(weights.values())
    if total_weight <= 0:
        return 0

    base = sum(product[axis] * weights[axis] for axis in config.AXES) / total_weight

    # 避けたい成分が入っていた分の減点
    avoid_penalty = min(
        config.AVOID_PENALTY_MAX,
        avoid_hit_count * config.AVOID_PENALTY_PER_HIT,
    )

    # 刺激リスクによる減点。敏感肌の人には強く効かせる
    if skin_type in config.SENSITIVE_SKIN_TYPES:
        irritation_penalty = config.IRRITATION_PENALTY_SENSITIVE.get(irritation_level, 0)
    else:
        irritation_penalty = config.IRRITATION_PENALTY_NORMAL.get(irritation_level, 0)

    return max(0, min(100, round(base - avoid_penalty - irritation_penalty)))


# =============================================================================
# ⑧ 点数の理由を組み立てる
# =============================================================================

# 説明文で「満たしている / ほどほど / 物足りない」を分ける境目（軸スコア）
SCORE_STRONG = 70
SCORE_WEAK = 40

def build_score_reason(
    product: dict,
    desired_axes: list[str],
    avoid_hit_count: int,
    irritation_level: str,
    skin_type: str,
) -> str:
    """なぜその点数になったのかを説明する文章を組み立てる。

    LLM に書かせず、計算に使った値からそのまま文章にします。
    そうしないと「点数」と「説明」が食い違います。
    """
    sentences = []

    if desired_axes:
        # 軸スコアをそのまま3段階に分けて言葉にする。
        # 基準を製品ごとに動かさないので、別の製品と読み比べられる。
        strong = [a for a in desired_axes if product[a] >= SCORE_STRONG]
        weak = [a for a in desired_axes if product[a] < SCORE_WEAK]
        middle = [a for a in desired_axes if a not in strong and a not in weak]

        def names(axes):
            return "」「".join(config.AXIS_LABELS[axis] for axis in axes)

        if strong:
            sentences.append(f"重視されている「{names(strong)}」をしっかり満たしています。")
        if middle:
            sentences.append(f"「{names(middle)}」はほどほどです。")
        if weak:
            sentences.append(f"「{names(weak)}」を求めるには物足りません。")
    else:
        # 重視する効果が未設定のときは、5軸の平均になることを明示する。
        # 何も選ばないと点数が低めに出るので、その理由を伝えないと不親切。
        best = max(config.AXES, key=lambda axis: product[axis])
        sentences.append(
            "重視する効果が未設定のため、5つの効果すべての平均で評価しています。"
            f"この製品は「{config.AXIS_LABELS[best]}」に強みがあります。"
        )

    if avoid_hit_count > 0:
        sentences.append(f"避けたい成分が{avoid_hit_count}件含まれるため減点しています。")

    if irritation_level == "高":
        sentences.append("刺激になりうる成分が多めのため減点しています。")
    elif irritation_level == "中" and skin_type in config.SENSITIVE_SKIN_TYPES:
        sentences.append("敏感肌のため、刺激リスク中の分を減点しています。")

    return "".join(sentences)


# =============================================================================
# 入口：ここまでの計算をまとめて実行する
# =============================================================================

def score_ingredients(ingredients: list[dict], profile) -> dict:
    """整形済みの成分リストとプロフィールから、画面に出す値を全部作る。

    @param ingredients schemas.sanitize_raw_ingredients() を通した成分リスト
    @param profile     schemas.UserProfile
    @return AnalysisResult に渡せる辞書（product_name などは呼び出し側で足す）
    """
    desired_axes = to_axis_keys(profile.desired_effects)
    avoid_terms = profile.avoid_ingredients
    total = _total_positions(ingredients)

    # 「配合上位」バッジを付ける範囲（成分表の上位3割）
    top_ranked_limit = max(1, round(total * config.TOP_RANKED_RATIO)) if total else 0

    product, contributors = product_axis_scores(ingredients)
    weights = axis_weights(desired_axes)
    irritation_level, irritation_reasons = irritation_assessment(ingredients)

    # 成分ごとに、避けたい成分かどうかと評価を決める
    scored_ingredients = []
    avoid_hit_count = 0
    for item in ingredients:
        avoided = is_avoided(item, avoid_terms)
        if avoided:
            avoid_hit_count += 1

        scored_ingredients.append({
            "name": item["name"],
            "original_name": item["original_name"],
            "description": item["description"],
            "rating": rate_ingredient(item, desired_axes, avoided),
            "position": item["position"],
            "is_top_ranked": item["position"] <= top_ranked_limit,
            "is_avoided": avoided,
            "irritation_risk": item["irritation_risk"],
        })

    # 表示順は配合量の多い順（＝成分表に書かれている順）。
    #
    # 以前は「避けたい成分 → bad → good → neutral」の順に並べ替えて
    # 注意すべきものを上に出していました。しかし手元の容器と見比べたときに
    # 並びが違うと、どれがどれだか照合できません。
    # 「成分表は配合量の多い順に並ぶ」というこのアプリの前提とも食い違います。
    #
    # 注意すべき成分を見落とさないための導線は、並び順以外に用意してあります。
    #   ・刺激リスクのカードに、根拠になった成分名を出している
    #   ・避けたい成分に当たった件数を、点数の理由文に書いている
    #   ・リスト内でも色分け（赤／緑／灰）で区別できる
    scored_ingredients.sort(key=lambda item: item["position"])

    score = compatibility_score(
        product, weights, avoid_hit_count, irritation_level, profile.skin_type
    )
    reason = build_score_reason(
        product, desired_axes, avoid_hit_count, irritation_level, profile.skin_type
    )

    return {
        "compatibility_score": score,
        "score_reason": reason,
        "radar_product": product,
        # 点数に使った軸。画面ではこの軸を強調して「なぜこの点数か」を示す
        "focus_axes": [axis for axis in config.AXES if weights[axis] > 0],
        # 年代から提案するだけの軸。点数には影響しない
        "age_hint_axes": age_hint_axes(desired_axes, profile.age_group),
        "axis_contributors": contributors,
        "irritation_level": irritation_level,
        "irritation_reasons": irritation_reasons,
        "ingredients": scored_ingredients,
    }
