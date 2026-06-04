const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits, Routes, REST } = require('discord.js');
const { handlePublicationInteraction, handlePublicationMessage } = require('./publications.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

// ==================== [ الإعدادات العامة للمشروع ] ====================
const CONFIG = {
    CLIENT_ID: "ضع_ايدي_البوت_هنا",
    OWNER_ID: "ضع_ايدي_صاحب_السيرفر_هنا", // الشخص الذي يستلم الكريدت
    PROBOT_ID: "282859044593598464",
    
    // رومات المزادات
    AUCTION_ROOMS: ["1111", "2222", "3333", "4444"], // الأربعة رومات المخصصة للمزادات
    BOT_COMMANDS_ROOM: "ضع_ايدي_روم_الاوامر_هنا", // روم تحويل الاموال
    AUCTION_INPUT_ROOM: "ضع_ايدي_روم_كتابة_نموذج_المزاد_هنا", // الروم الخاص بكتابة النموذج
};

const userSessions = new Map();
global.userSessions = userSessions; // مشاركة الجلسات مع ملف المنشورات

const commands = [
    { name: 'show', description: 'إنشاء لوحة شراء المزاد الرسمية', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
    { name: 'publication', description: 'إنشاء لوحة شراء المنشورات الرسمية', default_member_permissions: PermissionFlagsBits.Administrator.toString() }
];

client.once('ready', async () => {
    console.log(`✅ البوت يعمل بنجاح باسم: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), { body: commands });
        console.log('⚡ تم تسجيل أوامر الـ Slash بنجاح!');
    } catch (error) { console.error(error); }
});

// ==================== [ التعامل مع الأزرار والقوائم ] ====================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'show') {
            const embed = new EmbedBuilder().setTitle('📦 لوحة شراء المزادات الرسمية').setDescription('اضغط على الزر أدناه لشراء مزاد واتبع الخطوات الحماية التلقائية.').setColor('#2f3136');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('buy_auction').setLabel('🛒 شراء مزاد جديد').setStyle(ButtonStyle.Success));
            await interaction.reply({ content: 'تم الإرسال.', ephemeral: true });
            await interaction.channel.send({ embeds: [embed], components: [row] });
        }
        if (interaction.commandName === 'publication') {
            const embed = new EmbedBuilder().setTitle('📢 لوحة شراء المنشورات الدائمة').setDescription('اضغط على الزر أدناه لشراء منشور مخصص ونشره عبر البوت.').setColor('#00ffcc');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('buy_pub').setLabel('🛍️ شراء منشور').setStyle(ButtonStyle.Primary));
            await interaction.reply({ content: 'تم الإرسال.', ephemeral: true });
            await interaction.channel.send({ embeds: [embed], components: [row] });
        }
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const userId = interaction.user.id;

        // تحويل التفاعلات الخاصة بالمنشورات للملف الثاني للتعامل معها
        if (interaction.customId === 'buy_pub' || interaction.customId === 'pub_mention_menu') {
            return handlePublicationInteraction(interaction, userId, CONFIG);
        }

        // مسار المزاد
        if (interaction.customId === 'buy_auction') {
            userSessions.set(userId, { type: 'auction', step: 'mention_select' });
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('auc_mention_menu').setPlaceholder('اختر نوع المنشن للمزاد')
                    .addOptions([
                        { label: '@here (500k)', value: 'here_500k' },
                        { label: '@everyone (600k)', value: 'everyone_600k' }
                    ])
            );
            await interaction.reply({ content: 'الرجاء اختيار المنشن المطلوب لعملية المزاد:', components: [row], ephemeral: true });
        }

        if (interaction.customId === 'auc_mention_menu') {
            const session = userSessions.get(userId);
            if (!session) return;
            const selection = interaction.values[0];
            session.mention = selection === 'here_500k' ? '@here' : '@everyone';
            session.mentionPrice = selection === 'here_500k' ? 500000 : 600000;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('auc_confirm_yes').setLabel('نعم، تكملة').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('auc_confirm_no').setLabel('لا، إلغاء العملية').setStyle(ButtonStyle.Danger)
            );
            await interaction.update({ content: `💵 سعر المنشن المختار هو **${session.mentionPrice.toLocaleString()}** كريدت.\nهل تريد تكملة العملية؟`, components: [row] });
        }

        if (interaction.customId === 'auc_confirm_no') {
            userSessions.delete(userId);
            await interaction.update({ content: '❌ تم إلغاء العملية بنجاح.', components: [] });
        }

        if (interaction.customId === 'auc_confirm_yes') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('time_5').setLabel('5 دقائق | 1M').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('time_10').setLabel('10 دقائق | 3M').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('time_15').setLabel('15 دقيقة | 5M').setStyle(ButtonStyle.Primary)
            );
            await interaction.update({ content: '⏱️ الرجاء اختيار مدة المزاد من الأزرار التالية:', components: [row] });
        }

        if (interaction.customId.startsWith('time_')) {
            const session = userSessions.get(userId);
            if (!session) return;
            const timeType = interaction.customId.split('_')[1];
            if (timeType === '5') { session.duration = 5 * 60000; session.timePrice = 1000000; }
            if (timeType === '10') { session.duration = 10 * 60000; session.timePrice = 3000000; }
            if (timeType === '15') { session.duration = 15 * 60000; session.timePrice = 5000000; }

            session.totalAmount = session.mentionPrice + session.timePrice;
            session.taxAmount = Math.floor(session.totalAmount / 0.95) + 1;
            userSessions.set(userId, session);

            await interaction.update({
                content: `💳 **مجموع المبلغ المطلوب صافي:** \`${session.totalAmount.toLocaleString()}\` كريدت\n` +
                        `قم بنسخ الأمر أدناه وحوله في روم الأوامر <#${CONFIG.BOT_COMMANDS_ROOM}>:\n` +
                        `\`\`\`\nc ${CONFIG.OWNER_ID} ${session.taxAmount}\`\`\``,
                components: []
            });
        }
    }
});

// ==================== [ فحص الرسائل والتحويل ونموذج الروم ] ====================
client.on('messageCreate', async (message) => {
    if (message.author.bot && message.author.id !== CONFIG.PROBOT_ID) return;

    // تمرير رسائل روم المنشورات للملف المخصص لها
    handlePublicationMessage(message, CONFIG);

    // استقبال نموذج المزاد من العضو في الروم الخاص بعد الدفع
    if (!message.author.bot && message.channel.id === CONFIG.AUCTION_INPUT_ROOM) {
        const session = userSessions.get(message.author.id);
        if (session && session.type === 'auction' && session.step === 'waiting_model_input') {
            
            const userText = message.content;
            const userAttachment = message.attachments.first() ? message.attachments.first().url : null;

            await message.delete().catch(() => {}); // حذف رسالته فوراً لحفظ الخصوصية
            userSessions.delete(message.author.id); // إنهاء الجلسة

            // إرسال المزاد في أول روم متاح من القائمة
            const targetRoom = message.guild.channels.cache.get(CONFIG.AUCTION_ROOMS[0]);
            if (targetRoom) {
                await targetRoom.send({ content: session.mention });
                
                const modelEmbed = new EmbedBuilder()
                    .setTitle('🔨 تم إطلاق مزاد علني جديد!')
                    .setDescription(`**صاحب المزاد:** <@${message.author.id}>\n\n**تفاصيل المزاد ونموذجه:**\n${userText}`)
                    .setColor('#ff9900');
                await targetRoom.send({ embeds: [modelEmbed] });

                // إرسال القوانين الصارمة للمزاد
                const rulesEmbed = new EmbedBuilder()
                    .setTitle('📜 قوانين المزاد العامة')
                    .setDescription("1. ممنوع تزيد لو ما معك فلوس كاش بيدك.\n2. ممنوع تزيد اقل من 100k.\n3. ممنوع تزيد اقل من سعر البداية.\n4. ممنوع تفتح أي موضوع جانبي غير المزاد.")
                    .setColor('#ff0000');
                await targetRoom.send({ embeds: [rulesEmbed] });

                // إذا أرفق صورة يتم إرسالها وفحصها
                if (userAttachment) {
                    await targetRoom.send({ content: userAttachment });
                }

                // مؤقت انتهاء المزاد وتنظيف الروم بالكامل وإعادة زر الشراء
                setTimeout(async () => {
                    try {
                        const collected = await targetRoom.messages.fetch({ limit: 100 });
                        await targetRoom.bulkDelete(collected, true);
                        
                        const reEmbed = new EmbedBuilder().setTitle('📦 لوحة شراء المزادات الرسمية').setDescription('اضغط على الزر أدناه لشراء مزاد جديد.').setColor('#2f3136');
                        const reRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('buy_auction').setLabel('🛒 شراء مزاد جديد').setStyle(ButtonStyle.Success));
                        await targetRoom.send({ embeds: [reEmbed], components: [reRow] });
