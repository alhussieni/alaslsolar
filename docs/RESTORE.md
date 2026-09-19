# دليل استرجاع النسخ الاحتياطية

النظام بيعمل باك أب يومي (01:00 UTC) لثلاث حاجات منفصلة. كل واحدة ليها طريقة استرجاع مختلفة.

---

## 1) استرجاع الكود (GitHub)

كل يوم بيتعمل tag اسمه `backup-YYYY-MM-DD` على أحدث نسخة من `main` وقت التشغيل. الاحتفاظ: 90 يوم، بعدها الـtag بيتمسح تلقائيًا.

**عرض كل نسخ الباك أب المتاحة:**
```bash
git fetch --tags
git tag -l 'backup-*' | sort
```

**الرجوع لنسخة يوم معيّن (مثلاً 2026-09-15) بدون ما تفقد الشغل الحالي:**
```bash
git checkout -b rollback-2026-09-15 backup-2026-09-15
# راجع الكود، لو مطمن وعايز تخليه main:
git checkout main
git reset --hard rollback-2026-09-15
git push origin main --force   # تحذير: force push، استخدمها وانت متأكد
```

**لو عايز بس تشوف ملف واحد من يوم معيّن من غير ما تغيّر حاجة:**
```bash
git show backup-2026-09-15:dashboard.html > /tmp/dashboard-old.html
```

---

## 2) استرجاع قاعدة بيانات Supabase

كل يوم بيتعمل `pg_dump` كامل (schema + data) ويتحفظ في فرع منفصل اسمه `db-backups`، في المسار:
```
backups/db/YYYY-MM-DD.sql
```
الاحتفاظ: آخر 90 يوم بس.

**تحميل نسخة يوم معيّن:**
```bash
git clone --branch db-backups --single-branch https://github.com/alhussieni/alaslsolar.git db-backups-checkout
cd db-backups-checkout
ls backups/db/          # شوف التواريخ المتاحة
```

**⚠️ قبل الاسترجاع — الأهم:**
استرجاع dump كامل بيمسح البيانات الحالية ويحطها بدل منها. **اعمل dump للحالة الحالية الأول** عشان لو حصل غلط تقدر ترجع:
```bash
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --format=plain --file="before-restore-$(date +%Y%m%d-%H%M).sql"
```

**تنفيذ الاسترجاع الفعلي (على نسخة تجريبية الأول لو ينفع، مش مباشرة على الإنتاج):**
```bash
psql "$SUPABASE_DB_URL" < backups/db/2026-09-15.sql
```
`$SUPABASE_DB_URL` هو نفس الـconnection string المستخدم في الـworkflow (من Supabase Dashboard → Project Settings → Database → Connection string).

**لو عايز تسترجع جدول واحد بس** (مش قاعدة البيانات كلها)، افتح ملف الـdump ودور على السطر `COPY public.products_ar` (أو اسم الجدول)، وانسخ بس الجزء ده في ملف منفصل وشغّله — أسلم من استرجاع كل حاجة.

---

## 3) استرجاع ملفات Supabase Storage

كل يوم بيتنزل نسخة كاملة من كل الملفات (صور منتجات، datasheets، إلخ) في:
```
backups/storage/YYYY-MM-DD/<اسم-الـbucket>/<مسار الملف>
```
على نفس فرع `db-backups`. الاحتفاظ: آخر 90 يوم.

**استرجاع ملف واحد اتمسح بالغلط:**
1. افتح `backups/storage/<آخر تاريخ فيه الملف>/<bucket>/<المسار>` من فرع `db-backups`.
2. ارفعه تاني يدوي من Supabase Dashboard → Storage، أو عبر سكريبت رفع.

**استرجاع bucket كامل** (نادر، بس ممكن تحتاجه):
```bash
# محتاج SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY كمتغيرات بيئة
node scripts/backup/restore-storage.mjs backups/storage/2026-09-15/products-images products-images
```
(سكريبت `restore-storage.mjs` مش مكتوب لسه — لو احتجت استرجاع bucket كامل فعليًا قولّي وأكتبه وقتها، مش مكتوب دلوقتي لأنه استخدام نادر جدًا ومحتاج مراجعة دقيقة قبل التنفيذ عشان ميبوظش حاجة تانية.)

---

## ملاحظات عامة

- الباك أب الثلاثة (الكود، الداتابيز، الملفات) **مش متزامنين لحظيًا مع بعض** — كل واحد بياخد وقته في نفس الـworkflow يوميًا، فلو محتاج ترجع "لحظة معينة" بالظبط، استخدم نفس التاريخ للثلاثة لكن افهم إن فيه فرق دقايق بينهم مش أكتر.
- لو الـworkflow فشل يوم معيّن (مثلاً Supabase كان down)، هيبقى فيه فجوة في التواريخ. اتأكد من [تبويب Actions في GitHub](../../actions/workflows/daily-backup.yml) بين فترة وفترة إن الباك أب شغال فعلًا، مش بس مفترض إنه شغال.
- الاحتفاظ 90 يوم يعني: أي حاجة قبل كده اتمسحت تلقائيًا (كود + داتابيز + ملفات). لو محتاج نسخة أقدم من كده لازم تتعمل يدوي وتتحفظ في مكان تاني قبل ما تتمسح.
