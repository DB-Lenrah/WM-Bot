const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const mongoose = require('mongoose');
const axios = require('axios');
const http = require('http');
require('dotenv').config();

// ==========================================
//         CONFIGURATION (via .env)
// ==========================================
const SUPER_ADMINS = [
    process.env.SUPER_ADMIN_1,
    process.env.SUPER_ADMIN_2,
].filter(Boolean);

const groupInfo = {
    "1": { name: "البرمجة والتقنية",              link: process.env.GROUP_1_LINK, id: process.env.GROUP_1_ID },
    "2": { name: "التصميم والمونتاج",             link: process.env.GROUP_2_LINK, id: process.env.GROUP_2_ID },
    "3": { name: "التسويق وصناعة البيزنس",        link: process.env.GROUP_3_LINK, id: process.env.GROUP_3_ID },
    "4": { name: "صناعة المحتوى والإعلام",        link: process.env.GROUP_4_LINK, id: process.env.GROUP_4_ID },
    "5": { name: "الألعاب والأنمي",               link: process.env.GROUP_5_LINK, id: process.env.GROUP_5_ID },
    "6": { name: "الربح والاستثمار",              link: process.env.GROUP_6_LINK, id: process.env.GROUP_6_ID },
    "7": { name: "التطوير الذاتي والمهارات",      link: process.env.GROUP_7_LINK, id: process.env.GROUP_7_ID },
    "8": { name: "دردشة عامة واهتمامات متنوعة",  link: process.env.GROUP_8_LINK, id: process.env.GROUP_8_ID },
};

// ==========================================
//              UTILITIES
// ==========================================
function normalizeJid(jid) {
    if (!jid) return jid;
    let normalized = jid.includes(':') ? jid.split(':')[0] + '@s.whatsapp.net' : jid;
    normalized = normalized.replace('@c.us', '@s.whatsapp.net');
    normalized = normalized.replace('@lid', '@s.whatsapp.net');
    return normalized;
}

function normalizeArabicNumbers(text) {
    return text.replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

function normalizeText(text) {
    let normalized = text.toLowerCase().replace(/[^a-zA-Z\u0600-\u06FF0-9\s]/g, '');
    normalized = normalized.replace(/(.)\1+/g, '$1');
    return normalized;
}

// ==========================================
//           BAD WORDS FILTER
// ==========================================
const badWords = [
    "قذر","وسخ","حقير","سافل","كلب","حمار","خنزير",
    "متخلف","غبي","تافه","نذل","واطي","زفت","لعنة",
    "يلعن","ابن كلب","ابن حرام","شرموط","عرص","خول",
    "fuck","fucking","motherfucker","shit","bitch",
    "asshole","bastard","idiot","moron","slut","dick"
];

const MAX_WARNINGS = 3;

function containsBadWords(text) {
    const clean = normalizeText(text);
    const withoutSpaces = clean.replace(/\s/g, '');
    return badWords.some(word => {
        const normalizedWord = normalizeText(word);
        const pattern = new RegExp(`(^|\\s)${normalizedWord}($|\\s)`, 'i');
        const patternNoSpace = new RegExp(normalizedWord, 'i');
        return pattern.test(clean) || patternNoSpace.test(withoutSpaces);
    });
}

// ==========================================
//           RANK SYSTEM
// ==========================================
function getRankInfo(points) {
    if (points >= 6301) return { name: "Grand Master 🌟", next: "القمة",       req: 6301 };
    if (points >= 3101) return { name: "Master 👑",        next: "Grand Master", req: 6301 };
    if (points >= 1501) return { name: "Diamond 🔥",       next: "Master",       req: 3101 };
    if (points >= 701)  return { name: "Platinum 💎",      next: "Diamond",      req: 1501 };
    if (points >= 301)  return { name: "Gold 🥇",          next: "Platinum",     req: 701  };
    if (points >= 101)  return { name: "Silver 🥈",        next: "Gold",         req: 301  };
    return                     { name: "Bronze 🔰",        next: "Silver",       req: 101  };
}

// ==========================================
//           SPAM PROTECTION
// ==========================================
const cooldowns = new Map();
const messageTracker = new Map();

function isSpamming(userId) {
    const now = Date.now();
    const data = messageTracker.get(userId) || { count: 0, last: now };
    if (now - data.last < 2000) { data.count++; } else { data.count = 1; }
    data.last = now;
    messageTracker.set(userId, data);
    return data.count > 4;
}

function shouldUseAI(text) {
    const commands = ['.', '9', '10', '11', '12', '13', '14', '15', 'تحديث'];
    const shortReplies = ['نعم', 'لا', 'اه', 'ايوه', 'تمام', 'ماشي'];
    return (!commands.includes(text.trim())) &&
        (text.length > 2 || shortReplies.includes(text.trim().toLowerCase()));
}

// ==========================================
//           DATABASE
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ [DATABASE] Connected successfully'))
    .catch(err => console.error('❌ [DATABASE] Connection error:', err));

const UserSchema = new mongoose.Schema({
    chosenName:            { type: String,   default: null },
    id:                    { type: String,   unique: true },
    points:                { type: Number,   default: 0 },
    greeted:               { type: Boolean,  default: false },
    name:                  { type: String,   default: "مستخدم" },
    groupMemberships:      { type: [{ groupKey: String, realGroupId: String, joinedAt: Number }], default: [] },
    realPhone:             { type: String,   default: null },
    lastGroupRequested:    { type: String,   default: null },
    lastGroupRequestedTime:{ type: Number,   default: null },
    authorizedGroups:      { type: [String], default: [] },
    isBanned:              { type: Boolean,  default: false },
    warningCount:          { type: Number,   default: 0 },
    lastInteraction:       { type: Date,     default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// ==========================================
//           AI ENGINE (GROQ)
// ==========================================
const conversationHistory = new Map();
const offTopicCount = new Map();
const OFF_TOPIC_LIMIT = 15;

function isOnTopicMessage(text) {
    const keywords = [
        'جروب','مجال','انضم','ادخل','اشترك','برمجة','تصميم',
        'تسويق','ألعاب','محتوى','استثمار','تطوير','دردشة',
        'بوت','مجتمع','نقاط','رتبة','قائمة','تحديث',
        'معلومات','قوانين','ادارة','رصيد','db-lenrah'
    ];
    return keywords.some(word => text.toLowerCase().includes(word));
}

async function chatGPT(userId, text, userData) {
    if (['نعم','لا','اه','ايوه','تمام','ماشي'].includes(text.toLowerCase())) {
        text = "رد على سؤالك السابق: " + text;
    }
    try {
        if (!offTopicCount.has(userId)) offTopicCount.set(userId, 0);
        if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);

        const currentCount = offTopicCount.get(userId);
        const onTopic = isOnTopicMessage(text);

        if (onTopic) {
            offTopicCount.set(userId, 0);
        } else {
            if (currentCount >= OFF_TOPIC_LIMIT) {
                return `عذراً، لقد استنفدت رصيدك من الأسئلة العامة (${OFF_TOPIC_LIMIT} سؤال).\n\nللاستمرار، تحدث معي عن مجتمع DB-Lenrah والجروبات وسيتجدد رصيدك تلقائياً.\n\nاكتب ( . ) للقائمة الرئيسية 😊`;
            }
            offTopicCount.set(userId, currentCount + 1);
        }

        const remaining = OFF_TOPIC_LIMIT - offTopicCount.get(userId);
        const history = conversationHistory.get(userId);
        history.push({ role: 'user', content: text });
        if (history.length > 10) history.splice(0, 2);

        const systemPrompt = `
أنت مساعد ذكي اسمك "DB-LENRAH"، تعمل كواجهة تفاعلية لمجتمع رقمي متخصص اسمه "DB-Lenrah".

📋 الأوامر المتاحة:
- اكتب . ← القائمة الرئيسية
- اكتب 1-8 ← للانضمام لجروب معين
- اكتب 9 ← عرض النقاط
- اكتب 10 ← عرض الرتبة
- اكتب 11 ← معلومات الجروب
- اكتب 12 ← قوانين الجروب
- اكتب 13 ← فائدة الجروب
- اكتب 14 ← كيف تشارك صح
- اكتب 15 ← التواصل مع الإدارة
- اكتب تحديث ← تغيير الجروبات

🗣️ أسلوب الكلام:
- تكلم بالعربية الفصحى الواضحة دائماً
- أسلوبك ودود ومحفز ومختصر
- ردودك جملتين أو ثلاث بحد أقصى
- لا تعرض أي قائمة تلقائياً

📊 رصيد الأسئلة العامة المتبقي: ${remaining}
👤 الاسم المحفوظ: ${userData?.chosenName || 'لم يُحدد بعد'}

❌ ممنوع: ذكر تفاصيل تقنية، سياسة، دين، لغة غير عربية.
        `;

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'system', content: systemPrompt }, ...history],
                max_tokens: 300
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        const reply = response.data.choices[0].message.content;
        const nameMatch = text.match(/اسمي\s+(\S+)/);
        if (nameMatch?.[1]) {
            await User.findOneAndUpdate({ id: userId }, { chosenName: nameMatch[1] });
        }
        history.push({ role: 'assistant', content: reply });
        conversationHistory.set(userId, history);
        return reply;

    } catch (e) {
        console.error("Groq Error:", e.response?.data || e.message);
        return "عذرًا، حدث خطأ مؤقت. اكتب ( . ) للقائمة الرئيسية 🙏";
    }
}

// ==========================================
//           BOT CORE
// ==========================================
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
    const { version } = await fetchLatestBaileysVersion();

    // Keep-alive server
    const port = process.env.PORT || 8000;
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('DB-Lenrah Bot is Running ✅');
    }).listen(port);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'fatal' }),
        browser: ['DB-Lenrah', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    function getUserRole(id) {
        if (SUPER_ADMINS.includes(id)) return 'super';
        return 'user';
    }

    // Auto-cleanup: max 2 groups per user
    setInterval(async () => {
        try {
            const violators = await User.find({ 'groupMemberships.1': { $exists: true }, isBanned: false });
            for (const user of violators) {
                if (SUPER_ADMINS.includes(user.id)) continue;
                if (user.groupMemberships.length <= 2) continue;

                const sorted = [...user.groupMemberships].sort((a, b) => a.joinedAt - b.joinedAt);
                const oldest = sorted[0];
                try {
                    await sock.groupParticipantsUpdate(oldest.realGroupId, [user.id], 'remove');
                    const targetId = (user.realPhone || user.id.split('@')[0]) + '@s.whatsapp.net';
                    await sock.sendMessage(targetId, {
                        text: `⚠️ تم طردك من أحد الجروبات لأنك تجاوزت الحد المسموح به (جروبان كحد أقصى).\n\nاكتب ( . ) للقائمة الرئيسية.`
                    });
                    await User.findOneAndUpdate(
                        { id: user.id },
                        { $pull: { groupMemberships: { realGroupId: oldest.realGroupId } } }
                    );
                } catch (err) {
                    console.error('Auto-remove failed:', err.message);
                }
            }
        } catch (err) {
            console.error('Interval error:', err.message);
        }
    }, 3 * 60 * 1000);

    // Gatekeeper
    sock.ev.on('group-participants.update', async (anu) => {
        const { id: groupId, participants, action } = anu;

        if (action === 'add') {
            for (const user of participants) {
                const userId = normalizeJid(typeof user === 'string' ? user : user.id);
                if (SUPER_ADMINS.includes(userId)) continue;

                const userData = await User.findOne({ id: userId });
                const now = Date.now();
                const requestedRecently = userData?.lastGroupRequestedTime &&
                    (now - userData.lastGroupRequestedTime) < 3 * 60 * 1000;

                if (!requestedRecently) {
                    await sock.sendMessage(groupId, {
                        text: `⚠️ عذراً @${userId.split('@')[0]}، الدخول مسموح فقط عبر البوت الرئيسي.`,
                        mentions: [userId]
                    });
                    try {
                        await sock.groupParticipantsUpdate(groupId, [userId], 'remove');
                        await sock.sendMessage(userId, {
                            text: "❌ تم طردك لأنك دخلت عبر رابط خارجي. اطلب الرابط من البوت أولاً."
                        });
                    } catch (err) {
                        console.error('Gatekeeper remove failed:', err.message);
                    }
                } else {
                    const groupKey = Object.keys(groupInfo).find(k => groupInfo[k].id === groupId);
                    await User.findOneAndUpdate(
                        { id: userId },
                        {
                            $set: { lastGroupRequestedTime: null },
                            $push: { groupMemberships: { groupKey: groupKey || 'unknown', realGroupId: groupId, joinedAt: now } }
                        }
                    );
                }
            }
        }

        if (action === 'remove') {
            for (const user of participants) {
                const userId = normalizeJid(typeof user === 'string' ? user : user.id);
                await User.findOneAndUpdate(
                    { id: userId },
                    { $pull: { groupMemberships: { realGroupId: groupId } } }
                );
            }
        }
    });

    // Main message handler
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const m = messages[0];
        if (!m.message || type !== 'notify') return;

        const remoteJid = m.key.remoteJid;
        const participant = normalizeJid(m.key.participant || remoteJid);
        const role = getUserRole(participant);
        const isAdmin = role !== 'user';
        const isGroup = remoteJid.endsWith('@g.us');

        if (!isAdmin && isSpamming(participant)) {
            await sock.sendMessage(remoteJid, { text: "🚫 بلاش سبام يا بطل 😅" });
            return;
        }

        if (m.key.fromMe && remoteJid !== (sock.user?.id?.split(':')[0] + '@s.whatsapp.net')) return;

        const rawBody = (
            m.message.conversation ||
            m.message.extendedTextMessage?.text ||
            m.message.buttonsResponseMessage?.selectedButtonId || ""
        ).trim();
        const body = normalizeArabicNumbers(rawBody);
        if (!body) return;

        const pushName = m.pushName || "مستخدم";

        let userData = await User.findOne({ id: participant });
        if (!userData) {
            userData = new User({ id: participant, name: pushName });
            await userData.save();
        }
        userData.lastInteraction = new Date();
        await userData.save();

        if (!isGroup && remoteJid.includes('@s.whatsapp.net')) {
            const phone = remoteJid.split('@')[0];
            if (!isNaN(phone) && userData.realPhone !== phone) {
                await User.findOneAndUpdate({ id: participant }, { realPhone: phone });
                userData.realPhone = phone;
            }
        }

        if (userData.isBanned) {
            await sock.sendMessage(remoteJid, {
                text: `🚫 أنت محظور من استخدام البوت.\n\nللاعتراض، تواصل مع الإدارة.`
            });
            return;
        }

        // Admin commands
        if (!isAdmin && isGroup) {
            if (containsBadWords(body)) {
                userData.warningCount = (userData.warningCount || 0) + 1;
                await userData.save();
                const left = MAX_WARNINGS - userData.warningCount;
                await sock.sendMessage(remoteJid, {
                    text: `⚠️ @${userData.realPhone || participant.split('@')[0]} تحذير ${userData.warningCount}/${MAX_WARNINGS} — ${left > 0 ? left + ' إنذار متبقي' : 'لا إنذارات متبقية'}.`,
                    mentions: [participant]
                });
                SUPER_ADMINS.forEach(async admin => {
                    await sock.sendMessage(admin, {
                        text: `🚨 إساءة في جروب\n👤 ${pushName}\n💬 "${body}"\n⚠️ ${userData.warningCount}/${MAX_WARNINGS}`
                    });
                });
                return;
            }
            const now = Date.now();
            if (now - (cooldowns.get(participant) || 0) > 3000) {
                const updated = await User.findOneAndUpdate(
                    { id: participant },
                    { $inc: { points: 2 }, $set: { name: pushName, lastInteraction: new Date() } },
                    { new: true }
                );
                if (updated) {
                    const prev = getRankInfo(updated.points - 2);
                    const curr = getRankInfo(updated.points);
                    if (prev.name !== curr.name) {
                        await sock.sendMessage(remoteJid, {
                            text: `🎊 كفو يا ${pushName}! ارتقيت لرتبة [ ${curr.name} ] 🔥`,
                            mentions: [participant]
                        });
                    }
                }
                cooldowns.set(participant, now);
            }
            return;
        }

        if (isAdmin) {
            const args = body.split(' ');
            const cmd = args[0];
            const reportTo = SUPER_ADMINS[0];

            if (cmd === '!add') {
                const pts = parseInt(args[1]);
                const target = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (args[2] ? args[2] + '@s.whatsapp.net' : null);
                if (target && !isNaN(pts)) {
                    await User.findOneAndUpdate({ id: target }, { $inc: { points: pts } }, { upsert: true });
                    await sock.sendMessage(remoteJid, { text: `✅ تم إضافة ${pts} نقطة.` });
                    await sock.sendMessage(target, { text: `🎉 تم إضافة ${pts} نقطة إلى رصيدك من الإدارة.` });
                }
                return;
            }
            if (cmd === '!sub' && args[1] && args[2]) {
                const pts = parseInt(args[1]);
                const target = args[2] + '@s.whatsapp.net';
                const u = await User.findOne({ id: target });
                const newPts = Math.max(0, (u?.points || 0) - pts);
                await User.findOneAndUpdate({ id: target }, { points: newPts });
                await sock.sendMessage(remoteJid, { text: `📉 تم خصم ${pts} نقطة. الرصيد الحالي: ${newPts}.` });
                await sock.sendMessage(target, { text: `⚠️ تم خصم ${pts} نقطة. رصيدك: ${newPts}.` });
                return;
            }
            if (cmd === '!addall' && args[1]) {
                const pts = parseInt(args[1]);
                const msg = args.slice(2).join(' ');
                const all = await User.find({ isBanned: false });
                await User.updateMany({ isBanned: false }, { $inc: { points: pts } });
                for (const u of all) {
                    try {
                        const t = (u.realPhone || u.id.split('@')[0]) + '@s.whatsapp.net';
                        await sock.sendMessage(t, { text: `🎉 تم إضافة ${pts} نقطة هدية!${msg ? '\n' + msg : ''}` });
                        await new Promise(r => setTimeout(r, 300));
                    } catch (_) {}
                }
                await sock.sendMessage(remoteJid, { text: `✅ تم توزيع ${pts} نقطة على ${all.length} مستخدم.` });
                return;
            }
            if (cmd === '!resetwarn' && args[1]) {
                const jid = normalizeJid(args[1] + '@s.whatsapp.net');
                const result = await User.findOneAndUpdate({ id: jid }, { warningCount: 0 }, { new: true });
                await sock.sendMessage(remoteJid, { text: result ? `✅ تم تصفير تحذيرات ${args[1]}.` : `⚠️ الرقم غير موجود.` });
                if (result) await sock.sendMessage(jid, { text: `✅ تم تصفير سجل تحذيراتك. التزم بالقوانين 🤝` });
                return;
            }
            if (cmd === '!ban' && args[1] && role === 'super') {
                const jid = normalizeJid(args[1] + '@s.whatsapp.net');
                await User.findOneAndUpdate({ id: jid }, { isBanned: true, warningCount: 0 }, { upsert: true });
                await sock.sendMessage(remoteJid, { text: `🚫 تم حظر ${args[1]}.` });
                await sock.sendMessage(jid, { text: `🚫 تم حظرك. للاعتراض تواصل مع الإدارة.` });
                return;
            }
            if (cmd === '!unban' && args[1]) {
                const jid = normalizeJid(args[1] + '@s.whatsapp.net');
                await User.findOneAndUpdate({ id: jid }, { isBanned: false, warningCount: 0 });
                await sock.sendMessage(remoteJid, { text: `✅ تم فك الحظر عن ${args[1]}.` });
                await sock.sendMessage(jid, { text: `✅ تم فك الحظر عن حسابك. اكتب ( . ) للقائمة.` });
                return;
            }
            if (cmd === '!groups') {
                const groups = await sock.groupFetchAllParticipating();
                const text = Object.entries(groups).map(([id, g]) => `${g.subject}\n${id}`).join('\n\n');
                await sock.sendMessage(remoteJid, { text });
                return;
            }
            return;
        }

        // Regular user flow
        const sendMainMenu = async () => {
            await sock.sendMessage(remoteJid, {
                text: `✨ أهلاً بك في DB-Lenrah ✨\n\nاختار المجال اللي مهتم بيه:\n\n1️⃣ البرمجة والتقنية\n2️⃣ التصميم والمونتاج\n3️⃣ التسويق وصناعة البيزنس\n4️⃣ صناعة المحتوى والإعلام\n5️⃣ الألعاب والأنمي\n6️⃣ الربح والاستثمار\n7️⃣ التطوير الذاتي والمهارات\n8️⃣ دردشة عامة\n\nاكتب رقم مجالك 🔥`
            });
        };

        const rank = getRankInfo(userData.points);
        const num = parseInt(body);

        if (['16','ابدأ','هلا','.','menu','الرئيسية'].includes(body.toLowerCase()) || !userData.greeted) {
            userData.greeted = true;
            await userData.save();
            await sendMainMenu();

        } else if (num >= 1 && num <= 8 && body.trim().length === 1) {
            const selection = groupInfo[body];
            const alreadyIn = userData.groupMemberships?.some(m => m.realGroupId === selection.id || m.groupKey === body);
            const memberCount = userData.groupMemberships?.length || 0;

            if (memberCount >= 2 && !alreadyIn) {
                const names = userData.groupMemberships.map(m => groupInfo[m.groupKey]?.name || 'جروب غير معروف');
                await sock.sendMessage(remoteJid, {
                    text: `⚠️ لا يمكنك الانضمام لأكثر من جروبين.\n\nأنت مشترك في:\n1️⃣ ${names[0]}\n2️⃣ ${names[1]}\n\nاخرج من أحدهما ثم اكتب تحديث.`
                });
            } else {
                await User.findOneAndUpdate(
                    { id: participant },
                    { $set: { lastGroupRequested: selection.id, lastGroupRequestedTime: Date.now() } }
                );
                await sock.sendMessage(remoteJid, {
                    text: `🔗 رابط الانضمام لجروب [${selection.name}]:\n${selection.link}\n\nننتظرك! 🚀`
                });
                setTimeout(async () => {
                    await sock.sendMessage(remoteJid, {
                        text: `اختيار ممتاز 🔥\n\n9️⃣ نقاطي | 🔟 رتبتي | 1️⃣1️⃣ معلومات | 2️⃣1️⃣ قوانين | 3️⃣1️⃣ فائدة | 4️⃣1️⃣ مشاركة صح | 5️⃣1️⃣ الإدارة`
                    });
                }, 2000);
            }

        } else if (body === '9') {
            await sock.sendMessage(remoteJid, { text: `⭐ نقاطك: [ ${userData.points} ] نقطة\n🏆 رتبتك: [ ${rank.name} ]` });
        } else if (body === '10') {
            await sock.sendMessage(remoteJid, { text: `🏅 رتبتك: [ ${rank.name} ]\n📊 نقاطك: [ ${userData.points} ] / [ ${rank.req} ]\nكل خطوة تقربك من القمة 👑` });
        } else if (body === '11') {
            await sock.sendMessage(remoteJid, { text: `📌 DB-Lenrah مجتمع متخصص يجمع بين التقنية والمحتوى والنقاش. النظام مبني على النقاط والرتب. 🔹` });
        } else if (body === '12') {
            await sock.sendMessage(remoteJid, { text: `⚠️ القوانين:\n✔️ الاحترام المتبادل\n✔️ الالتزام بالموضوع\n✔️ ممنوع السبام ⚖️` });
        } else if (body === '13') {
            await sock.sendMessage(remoteJid, { text: `🎯 مجالات: تقنية، تصميم، تسويق، ألعاب، تطوير ذاتي.\nوجودك هنا قيمة حقيقية ✨` });
        } else if (body === '14') {
            await sock.sendMessage(remoteJid, { text: `🚀 شارك بمعلومة مفيدة، اسأل بذكاء، وساعد غيرك.\nاللعب النضيف هو اللي يكسب 🕹️` });
        } else if (body === '15') {
            await sock.sendMessage(remoteJid, { text: `👨‍💼 للتواصل مع الإدارة ابعت رسالة خاصة لـ:\n👉 DB-Lenrah\nإحنا هنا نساعدك 🤝` });
        } else if (body === 'تحديث') {
            for (const membership of userData.groupMemberships) {
                try { await sock.groupParticipantsUpdate(membership.realGroupId, [participant], 'remove'); } catch (_) {}
            }
            userData.groupMemberships = [];
            userData.lastGroupRequested = null;
            await userData.save();
            await sock.sendMessage(remoteJid, { text: "✅ تم تحديث سجلاتك! اكتب رقم مجالك الجديد." });
        } else {
            if (shouldUseAI(body)) {
                const aiCooldown = cooldowns.get(participant + "_ai") || 0;
                if (Date.now() - aiCooldown < 5000) {
                    await sock.sendMessage(remoteJid, { text: "⏳ انتظر 5 ثوانٍ بين كل سؤال 🤖" });
                    return;
                }
                cooldowns.set(participant + "_ai", Date.now());
                const aiReply = await chatGPT(participant, body, userData);
                await sock.sendMessage(remoteJid, { text: `🤖 *DB-LENRAH AI:*\n\n${aiReply}` });
            } else {
                await sock.sendMessage(remoteJid, { text: "اكتب ( . ) للقائمة الرئيسية 😊" });
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { console.clear(); qrcode.generate(qr, { small: true }); }
        if (connection === 'close') {
            const code = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : null;
            if (code !== DisconnectReason.loggedOut) setTimeout(() => startBot(), 10000);
        } else if (connection === 'open') {
            console.log('✅ DB-LENRAH Bot is Online!');
        }
    });
}

startBot();
