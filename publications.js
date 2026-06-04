const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

// معالجة الضغط على أزرار وقوائم المنشورات
async function handlePublicationInteraction(interaction, userId, CONFIG) {
    const userSessions = global.userSessions;

    if (interaction.customId === 'buy_pub') {
        userSessions.set(userId, { type: 'publication', step: 'waiting_pub_text' });
        await interaction.reply({ 
            content: `📝 **أهلاً بك!** يرجى التوجه فوراً إلى الروم المخصص <#${CONFIG.PUB_LOG_ROOM}> واكتب منشورك أو إعلانك بالكامل هناك ليقوم البوت بحفظه وتنسيقه لك كلياً.`, 
            ephemeral: true 
        });
    }

    if (interaction.customId === 'pub_mention_menu') {
        const session = userSessions.get(userId);
        if (!session) return interaction.reply({ content: '⚠️ انتهت الجلسة، يرجى إعادة المحاولة من جديد.', ephemeral: true });

        const selection = interaction.values[0];
        session.mention = selection === 'pub_here' ? '@here' : '@everyone';
        session.totalAmount = selection === 'pub_here' ? 1000000 : 2000000;
        session.taxAmount = Math.floor(session.totalAmount / 0.95) + 1;

        userSessions.set(userId, session);

        await interaction.update({
            content: `💵 **سعر المنشن المختار (${session.mention}):** \`${session.totalAmount.toLocaleString()}\` كريدت.\n` +
                    `قم بنسخ الأمر أدناه وتحويله مباشرة في روم الأوامر <#${CONFIG.BOT_COMMANDS_ROOM}>:\n` +
                    `\`\`\`\nc ${CONFIG.OWNER_ID} ${session.taxAmount}\`\`\`\n` +
                    `🔄 البوت في انتظار فحص عملية التحويل تلقائياً الآن...`,
            components: []
        });
    }
}

// معالجة كتابة وقراءة رسالة المنشور وفحص الدفع المالي له
async function handlePublicationMessage(message, CONFIG) {
    const userSessions = global.userSessions;

    // 1. التقاط وقراءة المنشور المكتوب من العضو وحذفه فوراً لحفظ السرية والتنظيم
    if (!message.author.bot && message.channel.id === CONFIG.PUB_LOG_ROOM) {
        const session = userSessions.get(message.author.id);
        if (session && session.type === 'publication' && session.step === 'waiting_pub_text') {
            session.pubContent = message.content;
            session.step = 'pub_mention_select';
            userSessions.set(message.author.id, session);

            // حذف الرسالة المكتوبة فوراً لتنظيف الروم كاملاً وبقاءه سرياً
            await message.delete().catch(() => {});

            // إرسال قائمة اختيار المنشن المخفية للعضو داخل روم الكتابة
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('pub_mention_menu')
                    .setPlaceholder('اختر نوع المنشن المطلوب لمنشورك الجديد')
                    .addOptions([
                        { label: '@here (1M)', value: 'pub_here', description: 'سعر المنشور مع منشن هير هو 1 مليون' },
                        { label: '@everyone (2M)', value: 'pub_everyone', description: 'سعر المنشور مع منشن افري وان هو 2 مليون' }
                    ])
            );

            await message.channel.send({ 
                content: `👋 تم نسخ وحفظ منشورك بنجاح يا <@${message.author.id}>.\nالآن حدد نوع المنشن الذي ترغب به من القائمة أدناه لإصدار الفاتورة:`, 
                components: [row] 
            });
        }
    }

    // 2. فحص تحويل بروبوت التلقائي ونشر المنشور بنفس تصميم الصورة تماماً
    if (message.author.id === CONFIG.PROBOT_ID && message.channel.id === CONFIG.BOT_COMMANDS_ROOM) {
        if (message.content.includes('has transferred') || message.content.includes('حول')) {
            const matches = message.content.match(/\d+/g);
            if (!matches || matches.length < 3) return;

            const senderId = matches[0];
            const receiverId = matches[1];
            const amount = parseInt(matches[2]);

            if (receiverId !== CONFIG.OWNER_ID) return;
            const session = userSessions.get(senderId);
            if (!session || session.type !== 'publication') return;

            if (amount >= session.totalAmount || amount >= session.taxAmount) {
                const displayRoom = message.guild.channels.cache.get(CONFIG.PUB_DISPLAY_ROOM);
                if (displayRoom) {
                    
                    // تصميم الإمبيد الاحترافي المطابق تماماً للصورة المرسلة
                    const pubEmbed = new EmbedBuilder()
                        .setDescription(`${session.pubContent}\n\n• **صاحب الطلب :** <@${senderId}>\n• **الـمـنـشـن :** ${session.mention}`)
                        .setColor('#1a1a1a');

                    // إضافة الأزرار الثلاثة التفاعلية المطابقة لشكل الصورة المرفقة
                    const pubRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('buy_pub') // عند الضغط عليه يشتري منشور جديد تلقائياً
                            .setLabel('شراء نشر طلب ✨')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('view_prices')
                            .setLabel('لرؤية اسعار الطلبات 🗺️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true), // زر استعراضي غير قابل للضغط ومطابق للصورة
                        new ButtonBuilder()
                            .setLabel('صاحب الطلب 👤')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://discord.com{senderId}`) // يفتح حساب الشخص مباشرة عند الضغط عليه
                    );

                    // إرسال المنشور الرسمي بالمنشن والأزرار
                    await displayRoom.send({ content: `${session.mention}`, embeds: [pubEmbed], components: [pubRow] });

                    // تأكيد الدفع والنجاح للعضو
                    await message.reply({ content: `✅ **تم تأكيد استلام الكريدت بنجاح!**\nيا <@${senderId}>، تم نشر طلبك وتنسيقه بالشكل الرسمي داخل روم المنشورات <#${CONFIG.PUB_DISPLAY_ROOM}> فوراً.` });
                    userSessions.delete(senderId); // مسح الجلسة بعد النجاح
                }
            }
        }
    }
}

module.exports = { handlePublicationInteraction
