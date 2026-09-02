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
    scores = {
        axis: min(100, round(raw_totals[axis] / config.AXIS_FULL_SCORE * 100))
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
# ③ あなたが求めるもの（レーダーの内側）
# =============================================================================

def need_axis_scores(desired_axes: list[str], age_group: str) -> dict:
    """プロフィールから「求めるもの」の5軸を組み立てる。

    選んだ軸は高く、選んでいない軸も「あれば嬉しい」の基準線を持たせます。
    そのうえで、年齢による補正を加えます。
    """
    needs = {
        axis: (config.NEED_SELECTED if axis in desired_axes else config.NEED_BASELINE)
        for axis in config.AXES
    }

    # 同じ成分でも年代によって「必要かどうか」が変わるので、要求側を動かす
    adjustments = config.AGE_ADJUSTMENTS.get(age_group, {})
    for axis, delta in adjustments.items():
        if axis in needs:
            needs[axis] = max(0, min(100, needs[axis] + delta))

    return needs


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
    needs: dict,
    avoid_hit_count: int,
    irritation_level: str,
    skin_type: str,
) -> int:
    """相性スコア (0-100) を計算する。

    考え方は「求めたものを、どれだけ満たせたか」。

        達成率 = Σ min(製品の実力, 求めるもの) / Σ 求めるもの

    min を取っているので、求めていない軸がいくら高くても加点されません。
    これは2重レーダーで「重なった面積 ÷ 求めた面積」を計算していることと
    同じなので、画面の見た目と点数が必ず一致します。
    """
    need_total = sum(needs.values())
    if need_total <= 0:
        return 0

    overlap = sum(min(product[axis], needs[axis]) for axis in config.AXES)
    base = overlap / need_total * 100

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

def build_score_reason(
    product: dict,
    needs: dict,
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
        # 求めた水準の8割を超えていれば「満たした」とみなす
        met = [
            config.AXIS_LABELS[axis]
            for axis in desired_axes
            if product[axis] >= needs[axis] * 0.8
        ]
        unmet = [
            config.AXIS_LABELS[axis]
            for axis in desired_axes
            if product[axis] < needs[axis] * 0.8
        ]

        if met:
            sentences.append(f"重視されている「{'」「'.join(met)}」を満たしています。")
        if unmet:
            sentences.append(f"「{'」「'.join(unmet)}」は控えめです。")
    else:
        # 重視する効果が未設定のときは、製品の得意分野を伝える
        best = max(config.AXES, key=lambda axis: product[axis])
        sentences.append(f"「{config.AXIS_LABELS[best]}」に強みのある製品です。")

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
    needs = need_axis_scores(desired_axes, profile.age_group)
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

    # 表示順: 避けたい成分 → bad → good → neutral、同じ区分なら配合順
    rating_order = {"bad": 0, "good": 1, "neutral": 2}
    scored_ingredients.sort(
        key=lambda item: (
            0 if item["is_avoided"] else 1,
            rating_order.get(item["rating"], 3),
            item["position"],
        )
    )

    score = compatibility_score(
        product, needs, avoid_hit_count, irritation_level, profile.skin_type
    )
    reason = build_score_reason(
        product, needs, desired_axes, avoid_hit_count, irritation_level, profile.skin_type
    )

    return {
        "compatibility_score": score,
        "score_reason": reason,
        "radar_product": product,
        "radar_need": needs,
        "axis_contributors": contributors,
        "irritation_level": irritation_level,
        "irritation_reasons": irritation_reasons,
        "ingredients": scored_ingredients,
    }
