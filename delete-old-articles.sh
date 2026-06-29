#!/bin/bash
# ============================================================
# Al Asl Solar — Delete old Arabic-slug article files from repo
# Run from root of your cloned GitHub repo
# ============================================================

OLD_SLUGS=(
  "الصيانة-وطول-العمر-إزاي-تحافظ-على-منظومتك-الشمسية-لأطول-فترة؟-1781971245146"
  "الطاقة-الشمسية-إيه-هي-وإزاي-بتشتغل؟-1781918119702"
  "المقارنات-بين-الأنظمة-إزاي-تختار-النظام-الشمسي-المناسب-ليك؟-1781970721422"
  "تطبيقات-الطاقة-الشمسية-من-المزرعة-للفيلا-والمصنع-والفندق-1781971759844"
)

SUFFIXES=("" "-ar" "-es" "-zh")

for slug in "${OLD_SLUGS[@]}"; do
  for suffix in "${SUFFIXES[@]}"; do
    file="articles/${slug}${suffix}.html"
    if [ -f "$file" ]; then
      git rm "$file"
      echo "Deleted: $file"
    fi
  done
done

echo ""
echo "✅ Done. Now run: npm run generate && git add . && git commit -m 'fix: English slugs for all articles' && git push"
