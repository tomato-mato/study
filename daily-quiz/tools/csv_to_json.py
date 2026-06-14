#!/usr/bin/env python3
"""
CSV → questions.json 変換スクリプト
Usage: python csv_to_json.py <input.csv> <output.json>
"""
import csv
import json
import sys
from pathlib import Path


def load_csv(path: str) -> list[dict]:
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def validate_row(row: dict, lineno: int) -> list[str]:
    errors = []

    for field in ("id", "question", "answer", "explanation"):
        if not row.get(field, "").strip():
            errors.append(f"行{lineno}: 必須項目 '{field}' が空です")

    choices = [row.get(f"choice{i}", "").strip() for i in range(1, 5)]
    filled = [c for c in choices if c]

    if len(filled) < 2:
        errors.append(f"行{lineno}: 選択肢は2つ以上必要です")
        return errors

    # 途中に空欄が挟まっていないか確認
    seen_empty = False
    for i, c in enumerate(choices, 1):
        if not c:
            seen_empty = True
        elif seen_empty:
            errors.append(f"行{lineno}: choice{i} の前に空の選択肢があります（途中空欄禁止）")
            break

    try:
        ans = int(row["answer"])
    except (ValueError, KeyError):
        errors.append(f"行{lineno}: 'answer' は整数で指定してください")
        return errors

    if not (1 <= ans <= len(filled)):
        errors.append(f"行{lineno}: 'answer'={ans} が選択肢数({len(filled)})の範囲外です")

    return errors


def convert(row: dict) -> dict:
    choices = [row.get(f"choice{i}", "").strip() for i in range(1, 5)]
    choices = [c for c in choices if c]

    obj = {
        "id":          row["id"].strip(),
        "question":    row["question"].strip(),
        "choices":     choices,
        "answer":      int(row["answer"].strip()) - 1,  # 1-based → 0-based
        "explanation": row["explanation"].strip(),
    }

    link = row.get("link", "").strip()
    if link:
        obj["link"] = link

    return obj


def main():
    if len(sys.argv) != 3:
        print("Usage: python csv_to_json.py <input.csv> <output.json>")
        sys.exit(1)

    in_path, out_path = sys.argv[1], sys.argv[2]

    if not Path(in_path).exists():
        print(f"エラー: '{in_path}' が見つかりません")
        sys.exit(1)

    rows = load_csv(in_path)
    all_errors = []

    for i, row in enumerate(rows, start=2):  # ヘッダーが1行目なので2始まり
        all_errors.extend(validate_row(row, i))

    # ID の重複チェック
    ids = [r.get("id", "").strip() for r in rows]
    seen = set()
    for i, qid in enumerate(ids, start=2):
        if qid in seen:
            all_errors.append(f"行{i}: ID '{qid}' が重複しています")
        seen.add(qid)

    if all_errors:
        print("バリデーションエラーがあります:\n")
        for e in all_errors:
            print(f"  ✗ {e}")
        sys.exit(1)

    questions = [convert(r) for r in rows]

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"✓ {len(questions)} 問を '{out_path}' に出力しました")


if __name__ == "__main__":
    main()
