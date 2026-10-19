# نموذج الصلاحيات (RBAC) — مرجع المشروع

آخر تحديث: 2026-10-19. المصدر الحقيقي للأدوار والصلاحيات هو قاعدة البيانات؛ هذا الملف توثيق لها.

## الفكرة
- **الحماية الحقيقية على السيرفر** (RLS + دوال `SECURITY DEFINER`). إخفاء الأزرار في الواجهة تجميل فقط.
- المستخدم ← أدوار (`user_roles`) ← صلاحيات (`role_permissions`) + **صلاحيات إضافية لمستخدم بعينه** (`user_permissions`، السوبر أدمن فقط).
- `has_permission('x.y')` هي الدالة اللي بتستخدمها كل policy جديدة. `superadmin` بيعدّي أي صلاحية (حتى المستقبلية).
- النظام القديم (`is_admin()` ← `admin_users`، و`is_rep()` ← `reps`) **ما زال شغالًا بجانب الجديد** (الـ policies بتتجمع بـ OR). حذفه مؤجل لحد ما نتأكد إن الجديد سليم.

## نقطة الدخول الموحدة
`/management/` — دخول واحد (username أو إيميل)، وبعده بطاقات للأقسام المسموحة بس: لوحة التحكم، العملاء والمتابعة، سجل العروض (CRM)، عروض الأسعار (QL)، إدارة الموظفين، ERP (قيد التجهيز).
كل الصفحات على نفس الدومين وبتستخدم نفس عميل Supabase (`supabase-config.js`) فالجلسة مشتركة: الدخول من البوابة بيفتح باقي الأقسام بدون دخول تاني.
ظهور البطاقة مبني على `my_permissions()`؛ والحماية الفعلية تفضل في RLS. أي قسم جديد = عنصر في مصفوفة `MODULES` داخل `management/index.html`.

## الأدوار
| الدور | يعمل إيه |
|---|---|
| `superadmin` | كل شيء (إدارة المستخدمين، الأسعار، التكلفة، سجل التعديلات) |
| `admin` | مقالات ومنتجات (كتابة + نشر)، محتوى الموقع، طلبات الموقع، متابعة المناديب وإسناد العملاء، رؤية كل العروض. **لا** أسعار ولا تكلفة ولا إدارة مستخدمين. لا يدخل QL إلا لو السوبر أدمن فتحه له |
| `sales_manager` | متابعة أداء المناديب (كل المناديب)، إسناد العملاء، كل العملاء والعروض، تقديم عروض أسعار |
| `sales_rep` | QL، تقديم عروض أسعار، عملاؤه هو فقط |

## مصفوفة الصلاحيات (من قاعدة البيانات)
| الصلاحية | الأدوار |
|---|---|
| `staff.manage`, `audit.read`, `costs.read`, `pricing.manage`, `reps.manage` | superadmin فقط |
| `articles.write`, `articles.review`, `products.write`, `products.review`, `content.manage`, `leads.manage`, `dashboard.access` | admin |
| `reps.view`, `reps.activity.read`, `customers.read_all`, `customers.assign`, `quotes.read_all` | admin, sales_manager |
| `crm.access` | admin, sales_manager, sales_rep |
| `ql.access`, `quotes.create` | sales_manager, sales_rep |
| `customers.read_own`, `quotes.read_own` | sales_rep |
| `offgrid.access`, `products.access` | غير مربوطتين بدور (الأعلام القديمة `reps.can_access_*`) |
| `erp.access` | محجوزة (superadmin فقط) |

## مهام يومية
- **إضافة موظف:** `/admin/staff.html` (سوبر أدمن) ← username + باسورد (10+ حروف، حروف وأرقام) ← اختر الدور ← انسخ الباسورد وسلّمه.
- **تغيير باسورد / تعطيل:** نفس الصفحة. التعطيل يمنع الدخول الجديد فورًا؛ جلسة مفتوحة قد تعيش حتى ساعة.
- **فتح QL لأدمن:** زر «فتح QL» في نفس الصفحة (يضيف حزمة صلاحيات + يفتح صف مندوب). «غلق QL» يعكسها.
- **دعوة مندوب بالإيميل:** من قسم المناديب في الـ dashboard (`invite-rep`) — بيتسجل في الأدوار تلقائيًا (trigger).
- **صلاحية جديدة:** migration فيه `insert into permissions` + `role_permissions` + policies جديدة تستخدم `has_permission()`. لا تعدّل `is_admin()`.
- **دور جديد:** `insert into roles` + `role_permissions`، وأضفه لقائمة `ROLES` في `admin/staff.html`.

## قيود معروفة
1. QL لسه بيعتمد على صف في `reps` (الدخول وعملاء/عروض). مين عنده دور مندوب أو فُتح له QL بيتعمل له صف تلقائيًا.
2. `customers.assigned_rep_id` مربوط بـ `reps(id)`: من يملك عملاء لازم يكون له صف في `reps`.
3. `can_access_crm` تحكم واجهة فقط (مفيش دالة تقابله). `can_access_offgrid/products` مفروضة على السيرفر.
4. زر «حذف» العروض في CRM لسه مقصور على `admin_users`.
5. فحص الباسوردات المسرّبة غير متاح (خطة Free).

## ترتيب النشر والتراجع
نشر: migrations بالترتيب ← Edge Function ← ملفات الواجهة. التراجع: عكس الترتيب، وكل migration ليه ملف في `supabase/rollbacks/`.

## الـ baseline (مطلوب مرة واحدة)
الـ production فيها ~80 migration والريبو فيه القليل منها. من جهازك:
```
supabase login
supabase link --project-ref nymkmrdbicfuniobunth
supabase db dump --schema public -f supabase/baseline/schema_2026-10-19.sql
supabase migration list
```
ارفع الملف الناتج. هو مرجع (مش للتنفيذ على الـ production).
