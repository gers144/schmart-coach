#!/usr/bin/env bash
# Прогоняет все карточки через Exa → Supabase, по одной.
# Запуск:  PROJECT_REF=xxxx ADMIN_TOKEN=yyyy bash ingest-all.sh
# Только часть:  bash ingest-all.sh steve-jobs beyonce
set -u
: "${PROJECT_REF:?укажи PROJECT_REF}"; : "${ADMIN_TOKEN:?укажи ADMIN_TOKEN}"
URL="https://${PROJECT_REF}.supabase.co/functions/v1/ingest-card"
IDS=("$@")
[ ${#IDS[@]} -eq 0 ] && IDS=(call-a-friend plan-your-time be-a-hugger take-the-stairs use-names less-social-media smile be-grateful give-a-compliment plan-your-day andy-rooney oprah-winfrey mahatma-gandhi viktor-frankl dalai-lama mark-manson richard-branson zig-ziglar denis-waitley james-clear jordan-peterson jordan-belfort steve-jobs leonardo-dicaprio meryl-streep johnny-depp will-smith jared-leto robert-de-niro jennifer-aniston hugh-jackman keanu-reeves anthony-hopkins beyonce wiz-khalifa harry-styles chris-martin adam-levine katy-perry mika lizzo ryan-tedder madonna forrest-gump rocky walt-disney august-walker chris-gardner piglet jack-sparrow donald-duck dumbledore)
ok=0; fail=()
for id in "${IDS[@]}"; do
  for attempt in 1 2; do
    printf "%-22s попытка %s … " "$id" "$attempt"
    res=$(curl -s -m 200 -X POST "$URL" -H "Content-Type: application/json" \
      -H "x-admin-token: ${ADMIN_TOKEN}" -d "{\"card_id\":\"$id\"}")
    if echo "$res" | grep -q '"ok":true'; then
      echo "готово  $(echo "$res" | grep -o '"status":"[a-z_]*"' | head -1)"; ok=$((ok+1)); break
    else
      echo "ошибка: ${res:0:160}"; [ $attempt -eq 2 ] && fail+=("$id"); sleep 5
    fi
  done
done
echo; echo "Готово: $ok из ${#IDS[@]}"
[ ${#fail[@]} -gt 0 ] && echo "Не получилось: ${fail[*]}  → запусти: bash ingest-all.sh ${fail[*]}"
