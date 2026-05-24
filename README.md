# WhatsApp Bot Dashboard

لوحة تحكم عربية لإدارة بوت رسائل يعمل على المواقع الخارجية ومع WhatsApp Cloud API.

## التشغيل المحلي

```powershell
npm start
```

افتح:

```text
http://localhost:3000
```

بيانات الدخول الافتراضية:

```text
Email: admin
Password: admin123
```

يفضل تغيير كلمة المرور من صفحة المستخدمين بعد أول دخول. يمكن تغيير كلمة المرور الافتراضية قبل أول تشغيل عبر:

```powershell
$env:BOOTSTRAP_ADMIN_PASSWORD="your-strong-password"; npm start
```

## ما الذي تم بناؤه؟

- Login وجلسة دخول آمنة بتوقيع HMAC.
- إدارة مستخدمين: مدير وموظف.
- إدارة ردود تلقائية حسب الكلمات المفتاحية.
- تخزين المحادثات والردود والإعدادات في `data/store.json` على السيرفر.
- Widget جاهز للزرع في أي موقع.
- Webhook لاستقبال رسائل WhatsApp Cloud API.
- إرسال رد تلقائي إلى WhatsApp عند ضبط `Phone Number ID` و `Access Token`.

## النشر على Vercel

المشروع جاهز للنشر على Vercel من خلال ملفات `api/[...path].js` و `vercel.json`.

اضبط متغيرات البيئة التالية في Vercel قبل التشغيل:

```text
BOOTSTRAP_ADMIN_PASSWORD=your-strong-password
APP_SECRET=long-random-secret
PUBLIC_BASE_URL=https://your-domain.com
```

للتخزين الدائم على Vercel، اربط Redis من Marketplace واضبط:

```text
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

الكود يدعم أيضا أسماء Vercel KV القديمة `KV_REST_API_URL` و `KV_REST_API_TOKEN` لو كانت موجودة في مشروع سابق.

بدون Redis سيعمل السيرفر، لكن التخزين على Vercel لن يكون دائما لأن بيئة Functions لا تعتمد على ملفات قابلة للحفظ الدائم.

## ربط أي موقع

من صفحة "كود الربط" انسخ السطر الظاهر وضعه قبل نهاية وسم `body` في الموقع المطلوب.

```html
<script src="https://your-domain.com/widget.js?key=SITE_KEY" defer></script>
```

أي رسالة من الـ widget سيتم حفظها كمحادثة داخل لوحة التحكم، والبوت سيرد بناء على قواعد الردود التلقائية.

## ربط WhatsApp Cloud API

من صفحة "الإعدادات" اضبط:

- `Verify Token`
- `Phone Number ID`
- `WABA ID`
- `Access Token`
- `Graph Version`

ثم استخدم رابط الـ Webhook الموجود في صفحة "كود الربط" كـ Callback URL داخل Meta:

```text
https://your-domain.com/api/whatsapp/webhook
```

Meta تحتاج رابط HTTPS عام، لذلك استخدم رابط Vercel أو الدومين الرسمي.

## الملفات المهمة

- `server.js`: API والسيرفر والتخزين والـ webhook.
- `public/index.html`: واجهة لوحة التحكم.
- `public/app.js`: منطق الواجهة وربطها بالـ API.
- `public/app.css`: التصميم.
- `api/[...path].js`: نقطة تشغيل API على Vercel.
- `vercel.json`: إعدادات توجيه Vercel.

## ملاحظات إنتاجية

عند الاستخدام التجاري، اجعل كل الأسرار داخل Environment Variables واستخدم تخزينا دائما مثل KV/Redis أو قاعدة بيانات خارجية.
