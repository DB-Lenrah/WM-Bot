<p align="center">
  <img src="https://img.shields.io/github/stars/DB-Lenrah/WM-Bot?style=for-the-badge" />
  <img src="https://img.shields.io/github/license/DB-Lenrah/WM-Bot?style=for-the-badge" />
  <img src="https://img.shields.io/github/last-commit/DB-Lenrah/WM-Bot?style=for-the-badge" />
  <img src="https://img.shields.io/badge/status-active-success?style=for-the-badge" />
  <img src="https://img.shields.io/badge/version-5.0-blue?style=for-the-badge" />
</p>

<h1 align="center">DB-LENRAH WhatsApp Bot</h1>

<p align="center">
  A structured WhatsApp community management system built with Baileys — focused on real enforcement, not just auto-replies.
</p>

---

## 📸 Preview

> _Screenshots coming soon_

---

<!-- ============================== ENGLISH ============================== -->

<div dir="ltr">

## 🇬🇧 English

### Overview

**DB-LENRAH** is a WhatsApp automation system built with [Baileys](https://github.com/WhiskeySockets/Baileys), designed to manage communities in a structured and controlled way.

It focuses on solving real problems like access control, spam, user engagement, and moderation — not just auto-replies.

---

### ⚙️ Core Systems

#### 🔐 Access Control (Gatekeeper)
- Users can only join groups via the bot
- Direct link joins are blocked
- Temporary authorization system
- Auto-kick for unauthorized users

#### 👥 Group Management
- Max 2 groups per user
- Tracks joined groups
- Prevents over-joining
- Reset using `تحديث`

#### 🏆 Gamification System
- +2 points per message (cooldown applied)
- Automatic rank upgrades

**Ranks:**

```
Bronze → Silver → Gold → Platinum → Diamond → Master → Grand Master
```

#### 🛡️ Moderation System
- Detects bad words (Arabic + English)
- Smart normalization (handles tricks like spacing & repetition)
- Warning system (max 3)
- Auto reports to admin

#### 🤖 AI System (Groq)
- Context-aware replies
- Conversation memory
- Off-topic limiter
- Controlled response style

#### 🚫 Anti-Spam
- Detects message flooding
- Cooldown per user
- Prevents abuse

---

### ✅ Features

- WhatsApp community management system
- AI assistant integration
- Real-time points & ranking
- Anti-spam protection
- Moderation & reporting
- MongoDB database
- Admin control system
- Auto reconnect

---

### 🧑‍💼 Admin Commands

```
!add <points> @user
!sub <points> <number>
!addall <points>
!suball <points>
!resetwarn <number>
!ban <number>
!unban <number>
```

---

### 🚀 Installation

```bash
git clone https://github.com/DB-Lenrah/WM-Bot.git
cd WM-Bot
npm install
```

#### Environment Variables

Create a `.env` file in the root directory:

```env
MONGO_URI=your_mongodb_connection_string
GROQ_API_KEY=your_groq_api_key
PORT=8000
```

#### Run

```bash
node index.js
```

Then scan the QR code from the terminal.

---

### 💪 Strengths

- Real enforcement logic (not UI-only)
- Strong anti-abuse system
- Efficient runtime performance
- Suitable for scalable communities

### ⚠️ Limitations

- Single file structure
- No dashboard
- Depends on external AI API
- Basic logging

### 🔮 Future Improvements

- Modular architecture
- Web dashboard
- Advanced logging
- Multi-language support

</div>

---

<!-- ============================== ARABIC ============================== -->

<div dir="rtl">

## 🇸🇦 العربية

### نظرة عامة

**بوت DB-LENRAH** هو نظام لإدارة مجتمعات واتساب بشكل منظم، يركز على التحكم في الدخول، الحماية، وتحفيز التفاعل.

ليس مجرد بوت ردود، بل نظام إدارة كامل.

---

### ⚙️ الأنظمة الأساسية

#### 🔐 التحكم في الدخول
- الدخول فقط من خلال البوت
- منع الروابط المباشرة
- طرد تلقائي للمخالفين

#### 👥 إدارة الجروبات
- حد أقصى جروبان لكل مستخدم
- تتبع الجروبات المنضم إليها
- منع الانضمام الزائد
- إعادة التعيين بأمر `تحديث`

#### 🏆 نظام النقاط
- كل رسالة = +2 نقطة
- ترقية تلقائية للرتبة

**الرتب:**

```
برونزي → فضي → ذهبي → بلاتيني → دايموند → ماستر → جراند ماستر
```

#### 🛡️ نظام الحماية
- كشف السب (عربي + إنجليزي)
- معالجة التحايل على الكلمات
- نظام تحذيرات (3 تحذيرات)
- إرسال بلاغ للإدارة تلقائيًا

#### 🤖 الذكاء الاصطناعي
- ردود حسب السياق
- حفظ المحادثة
- تحديد عدد الأسئلة
- أسلوب رد مضبوط

#### 🚫 منع السبام
- كشف الإرسال السريع
- تهدئة المستخدم
- حماية من الإزعاج

---

### ✅ المميزات

- إدارة احترافية لجروبات واتساب
- نظام نقاط وتحفيز
- حماية قوية من السبام
- ذكاء اصطناعي مدمج
- قاعدة بيانات MongoDB
- نظام إداري متكامل

---

### 🚀 التشغيل

```bash
node index.js
```

ثم عمل Scan للـ QR من التيرمنال.

---

### ⚠️ العيوب

- ملف واحد فقط (Single file)
- لا يوجد لوحة تحكم
- يعتمد على API خارجي
- تسجيل بيانات بسيط

---

### 📝 ملاحظات

- لا تشارك ملف `.env` مع أحد
- يُفضل استخدام MongoDB Atlas
- مناسب للمجتمعات المتوسطة والكبيرة

</div>

---

## 📄 License

Licensed under the [Apache 2.0 License](LICENSE).
