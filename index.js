const { 
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, 
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder,
  REST, Routes, SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');
const http = require('http');

// ==================== DUMMY HTTP SERVER PENTRU RENDER (BIND 0.0.0.0) ====================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('TITAN Market Bot is online 24/7!');
  res.end();
}).listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web Server pornit pe portul ${PORT} (0.0.0.0) pentru Render.`);
});

// ==================== DISCORD CLIENT SETUP ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

// ==================== TITAN MARKET EMOJIS & BANNERS ====================
const EMOJIS = {
  nitro: '<:Nitro_Classic:1544785006314922126>',
  deco: '<:giveaway2:1544784989261140030>',
  boost: '<:serverboost:1544785004549120090>',
  other: '<:zbuy377:1544784990460715099>',
  support: '<:unionsupport:1544784991647568037>',
  hammer: '<:hammerworldedito:1544788659662889060>',
  ticket: '<:ticketdefreegod:1544789767357603880>',
  ticket_id: '<:greenlink:1544789764937617418>',
  claim: '<:claim:1544789753524654231>',
  remove_user: '<:uncheckmark:1544789763398172686>',
  issue: '<:issue:1544789766262882314>',
  stats: '<:skillstatsicon:1544790500526002327>',
  giveaway: '<:giveaway1:1544784987612516437>',
  id: '<:iconsid:1544938510006620170>',
  name: '<:nametag6:1544938508601262130>'
};

const BANNERS = {
  giveaways: 'https://cdn.discordapp.com/attachments/1538227192641888327/1544941690194763876/standard.gif',
  invites: 'https://cdn.discordapp.com/attachments/1538227192641888327/1544941862937305119/standard_1.gif',
  tickets: 'https://cdn.discordapp.com/attachments/1538227192641888327/1544942042738593822/standard_2.gif'
};

const COLOR_CYAN = '#00E5FF';
const COLOR_VIOLET = '#7C4DFF';
const PREFIX = '+';
const TOKEN = process.env.DISCORD_TOKEN;
const DEFAULT_LOGS_CHANNEL = '1544967779273412669';

// ==================== DATABASE ====================
let db = {
  welcomeChannel: null,
  byeChannel: null,
  logsChannel: DEFAULT_LOGS_CHANNEL,
  invites: {},
  vouches: {},
  giveaways: {},
  ticketCount: 0
};

if (fs.existsSync('./db.json')) {
  try {
    const loadedDb = JSON.parse(fs.readFileSync('./db.json', 'utf8'));
    db = { ...db, ...loadedDb };
    if (!db.logsChannel) db.logsChannel = DEFAULT_LOGS_CHANNEL;
  } catch (e) {}
}
const saveDB = () => fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));

const guildInvites = new Map();

// ==================== DURATION PARSER HELPER ====================
function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)([s|m|h|d|w])$/i);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'd': return num * 24 * 60 * 60 * 1000;
    case 'w': return num * 7 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

// ==================== SLASH COMMANDS ====================
const slashCommands = [
  new SlashCommandBuilder().setName('panel').setDescription('Displays the main TITAN Market support ticket panel'),
  new SlashCommandBuilder().setName('profile').setDescription('Displays a member\'s TITAN Market profile')
    .addUserOption(opt => opt.setName('user').setDescription('Target user')),
  new SlashCommandBuilder().setName('vouch').setDescription('Leave a vouch/review for a member')
    .addUserOption(opt => opt.setName('user').setDescription('Target member/seller').setRequired(true))
    .addStringOption(opt => opt.setName('comment').setDescription('Transaction details/feedback').setRequired(true)),
  new SlashCommandBuilder().setName('rep').setDescription('Give reputation (+rep) to a member')
    .addUserOption(opt => opt.setName('user').setDescription('Target member').setRequired(true))
    .addStringOption(opt => opt.setName('comment').setDescription('Transaction details/feedback').setRequired(true)),
  new SlashCommandBuilder().setName('vouchstats').setDescription('Displays all vouches received by a member')
    .addUserOption(opt => opt.setName('user').setDescription('Target user')),
  new SlashCommandBuilder().setName('invites').setDescription('Displays invitation statistics for a member')
    .addUserOption(opt => opt.setName('user').setDescription('Target user')),
  new SlashCommandBuilder().setName('invitelist').setDescription('Displays the list of members invited by a user')
    .addUserOption(opt => opt.setName('user').setDescription('Target user')),
  new SlashCommandBuilder().setName('topinvites').setDescription('Displays the top inviters leaderboard'),
  new SlashCommandBuilder().setName('clear').setDescription('Purge a specified number of messages from the channel')
    .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages (1-100)').setRequired(true)),
  new SlashCommandBuilder().setName('giveaway').setDescription('Host a TITAN Market giveaway')
    .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g., 10s, 1m, 1h, 1d)').setRequired(true))
    .addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners').setRequired(true))
    .addStringOption(opt => opt.setName('prize').setDescription('Prize description').setRequired(true)),
  new SlashCommandBuilder().setName('gend').setDescription('Force end an active giveaway')
    .addStringOption(opt => opt.setName('message_id').setDescription('The Giveaway Message ID').setRequired(true)),
  new SlashCommandBuilder().setName('greroll').setDescription('Reroll a new winner for an ended giveaway')
    .addStringOption(opt => opt.setName('message_id').setDescription('The Giveaway Message ID').setRequired(true)),
  new SlashCommandBuilder().setName('gedit').setDescription('Edit an active giveaway')
    .addStringOption(opt => opt.setName('message_id').setDescription('The Giveaway Message ID').setRequired(true))
    .addStringOption(opt => opt.setName('prize').setDescription('New prize description').setRequired(false))
    .addIntegerOption(opt => opt.setName('winners').setDescription('New number of winners').setRequired(false)),
  new SlashCommandBuilder().setName('setwelcome').setDescription('Set the welcome message channel')
    .addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true)),
  new SlashCommandBuilder().setName('setbye').setDescription('Set the leave/bye message channel')
    .addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true)),
  new SlashCommandBuilder().setName('setlogs').setDescription('Set the logs & transcripts channel')
    .addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true))
].map(cmd => cmd.toJSON());

// ==================== READY EVENT ====================
client.once('ready', async () => {
  console.log(`\n==============================================`);
  console.log(`🚀 [TITAN MARKET BOT] Online as ${client.user.tag}`);
  console.log(`⚡ Hosted Status: OPTIMAL`);
  console.log(`==============================================\n`);

  let statusIndex = 0;
  const statuses = [
    () => `⚡ TITAN Market™ | discord.gg/titanmarket`,
    () => `🎫 Managing ${db.ticketCount} Tickets`,
    () => `💎 Premium Marketplace Services`
  ];
  setInterval(() => {
    client.user.setActivity(statuses[statusIndex](), { type: 3 });
    statusIndex = (statusIndex + 1) % statuses.length;
  }, 15000);

  // Verificare automata giveaways la fiecare 10 secunde
  setInterval(checkGiveaways, 10000);

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
    console.log('✅ Slash Commands registered successfully!');
  } catch (err) {
    console.error('❌ Error registering Slash Commands:', err.message);
  }

  client.guilds.cache.forEach(async (guild) => {
    try {
      const firstInvites = await guild.invites.fetch();
      guildInvites.set(guild.id, new Map(firstInvites.map(inv => [inv.code, inv.uses])));
    } catch (e) {}
  });
});

// ==================== GIVEAWAY AUTOMATION ENGINE ====================
async function checkGiveaways() {
  const now = Date.now();
  for (const [msgId, gw] of Object.entries(db.giveaways)) {
    if (!gw.ended && gw.endTime <= now) {
      await endGiveaway(msgId);
    }
  }
}

async function endGiveaway(msgId) {
  const gw = db.giveaways[msgId];
  if (!gw || gw.ended) return;

  gw.ended = true;
  saveDB();

  try {
    const channel = await client.channels.fetch(gw.channelId).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(msgId).catch(() => null);

    let winners = [];
    if (gw.participants && gw.participants.length > 0) {
      const pool = [...new Set(gw.participants)];
      const count = Math.min(gw.winners, pool.length);
      for (let i = 0; i < count; i++) {
        const randIndex = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(randIndex, 1)[0]);
      }
    }

    gw.winnerIds = winners;
    saveDB();

    const winnersText = winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'No valid participants';

    if (msg) {
      const endedEmbed = new EmbedBuilder()
        .setColor('#FF0055')
        .setTitle(`${EMOJIS.giveaway} TITAN GIVEAWAY ENDED: ${gw.prize}`)
        .setImage(BANNERS.giveaways)
        .setDescription(`\n• **Winner(s):** ${winnersText}\n• **Hosted by:** <@${gw.hostId}>\n• **Total Entries:** \`${gw.participants ? gw.participants.length : 0}\``)
        .setFooter({ text: 'TITAN Market™ • Official Giveaways Ended' })
        .setTimestamp();

      const disabledBtn = new ButtonBuilder()
        .setCustomId('join_gw_disabled')
        .setLabel(`Ended (${gw.participants ? gw.participants.length : 0})`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      await msg.edit({ embeds: [endedEmbed], components: [new ActionRowBuilder().addComponents(disabledBtn)] });
    }

    if (winners.length > 0) {
      channel.send(`🎉 Congratulations ${winnersText}! You won **${gw.prize}**! Contact <@${gw.hostId}> to claim your prize!`);
    } else {
      channel.send(`⚠️ Giveaway for **${gw.prize}** ended, but there were no valid participants.`);
    }
  } catch (err) {
    console.error('Error ending giveaway:', err);
  }
}

async function rerollGiveaway(msgId, channel) {
  const gw = db.giveaways[msgId];
  if (!gw) return { success: false, message: '❌ Giveaway not found in database!' };
  if (!gw.ended) return { success: false, message: '❌ This giveaway has not ended yet!' };
  if (!gw.participants || gw.participants.length === 0) return { success: false, message: '❌ No participants in this giveaway to reroll!' };

  const pool = [...new Set(gw.participants)];
  const newWinnerId = pool[Math.floor(Math.random() * pool.length)];

  await channel.send(`🎉 **REROLL!** The new winner for **${gw.prize}** is <@${newWinnerId}>! Congratulations! 🎁`);
  return { success: true };
}

// ==================== INVITE TRACKER EVENTS ====================
client.on('guildMemberAdd', async (member) => {
  const cached = guildInvites.get(member.guild.id);
  try {
    const newInvites = await member.guild.invites.fetch();
    const usedInvite = newInvites.find(inv => cached && cached.get(inv.code) < inv.uses);

    if (usedInvite && usedInvite.inviter) {
      const inviterId = usedInvite.inviter.id;
      if (!db.invites[inviterId]) db.invites[inviterId] = { total: 0, active: 0, left: 0, fake: 0, users: [] };
      if (!db.invites[inviterId].users) db.invites[inviterId].users = [];

      const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
      if (accountAgeDays < 7) {
        db.invites[inviterId].fake += 1;
      } else {
        db.invites[inviterId].total += 1;
        db.invites[inviterId].active += 1;
      }

      db.invites[inviterId].users.push({
        id: member.id,
        tag: member.user.tag,
        joinedAt: new Date().toLocaleDateString('en-US')
      });
      saveDB();

      if (db.welcomeChannel) {
        const channel = member.guild.channels.cache.get(db.welcomeChannel);
        if (channel) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_CYAN)
            .setTitle(`👋 Welcome to TITAN Market™!`)
            .setDescription(`• User: ${member}\n• Invited by: **${usedInvite.inviter.tag}**\n• Total Active Invites: **${db.invites[inviterId].active}**`)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();
          channel.send({ embeds: [embed] });
        }
      }
    }
  } catch (e) {}
});

client.on('guildMemberRemove', async (member) => {
  if (db.byeChannel) {
    const channel = member.guild.channels.cache.get(db.byeChannel);
    if (channel) channel.send(`👋 **${member.user.tag}** left TITAN Market.`);
  }
});

// ==================== MESSAGE COMMANDS (PREFIX +) ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === 'setwelcome' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const ch = message.mentions.channels.first() || message.channel;
      db.welcomeChannel = ch.id;
      saveDB();
      return message.reply(`✅ Welcome channel set to ${ch}`);
    }

    if (cmd === 'setbye' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const ch = message.mentions.channels.first() || message.channel;
      db.byeChannel = ch.id;
      saveDB();
      return message.reply(`✅ Bye channel set to ${ch}`);
    }

    if (cmd === 'setlogs' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const ch = message.mentions.channels.first() || message.channel;
      db.logsChannel = ch.id;
      saveDB();
      return message.reply(`✅ Logs & Transcripts channel set to ${ch}`);
    }

    if (cmd === 'panel') handlePanelCommand(message);
    if (cmd === 'p' || cmd === 'profile') handleProfileCommand(message, message.mentions.users.first() || message.author);
    if (cmd === 'vouch' || cmd === 'rep') {
      const target = message.mentions.users.first();
      const comment = args.slice(1).join(' ');
      if (!target || !comment) return message.reply('❌ Invalid syntax! Usage: `+vouch @user <comment>` or `+rep @user <comment>`');
      if (target.id === message.author.id) return message.reply('❌ You cannot vouch for yourself!');
      
      processVouch(message.author, target, comment);
      return message.reply(`✨ Thank you ${message.author} for leaving a vouch for **${target.username}**! Your feedback has been saved successfully. 💎`);
    }

    if (cmd === 'vouchstats') handleVouchStatsCommand(message, message.mentions.users.first() || message.author);
    if (cmd === 'invites') handleInvitesCommand(message, message.mentions.users.first() || message.author);
    if (cmd === 'invitelist') handleInviteListCommand(message, message.mentions.users.first() || message.author);
    if (cmd === 'topinvites') handleTopInvitesCommand(message);
    if (cmd === 'clear') handleClearCommand(message, parseInt(args[0]));

    if (cmd === 'gend') {
      const msgId = args[0];
      if (!msgId) return message.reply('❌ Usage: `+gend <message_id>`');
      await endGiveaway(msgId);
      return message.reply(`✅ Giveaway \`${msgId}\` has been ended.`);
    }

    if (cmd === 'greroll') {
      const msgId = args[0];
      if (!msgId) return message.reply('❌ Usage: `+greroll <message_id>`');
      const res = await rerollGiveaway(msgId, message.channel);
      if (!res.success) return message.reply(res.message);
    }

    if (cmd === 'gedit') {
      const msgId = args[0];
      const newPrize = args.slice(1).join(' ');
      if (!msgId || !newPrize) return message.reply('❌ Usage: `+gedit <message_id> <new_prize>`');
      const gw = db.giveaways[msgId];
      if (!gw) return message.reply('❌ Giveaway not found!');
      gw.prize = newPrize;
      saveDB();
      return message.reply(`✅ Giveaway \`${msgId}\` prize updated to: **${newPrize}**`);
    }
  }
});

// ==================== INTERACTION HANDLER ====================
client.on('interactionCreate', async (interaction) => {

  // --- 1. SLASH COMMANDS ---
  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;

    if (commandName === 'setwelcome') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      }
      const ch = options.getChannel('channel');
      db.welcomeChannel = ch.id;
      saveDB();
      return interaction.reply({ content: `✅ Welcome channel set to ${ch}`, ephemeral: true });
    }

    if (commandName === 'setbye') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      }
      const ch = options.getChannel('channel');
      db.byeChannel = ch.id;
      saveDB();
      return interaction.reply({ content: `✅ Bye channel set to ${ch}`, ephemeral: true });
    }

    if (commandName === 'setlogs') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      }
      const ch = options.getChannel('channel');
      db.logsChannel = ch.id;
      saveDB();
      return interaction.reply({ content: `✅ Logs & Transcripts channel set to ${ch}`, ephemeral: true });
    }

    if (commandName === 'panel') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      }
      await handlePanelCommand(interaction);
    }

    if (commandName === 'profile') {
      const target = options.getUser('user') || interaction.user;
      await handleProfileCommand(interaction, target);
    }

    if (commandName === 'vouch' || commandName === 'rep') {
      const target = options.getUser('user');
      const comment = options.getString('comment');
      if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot vouch for yourself!', ephemeral: true });

      processVouch(interaction.user, target, comment);
      return interaction.reply({ content: `✨ Thank you ${interaction.user} for leaving a vouch for **${target.username}**! Your feedback has been saved successfully. 💎` });
    }

    if (commandName === 'vouchstats') {
      const target = options.getUser('user') || interaction.user;
      await handleVouchStatsCommand(interaction, target);
    }

    if (commandName === 'invites') {
      const target = options.getUser('user') || interaction.user;
      await handleInvitesCommand(interaction, target);
    }

    if (commandName === 'invitelist') {
      const target = options.getUser('user') || interaction.user;
      await handleInviteListCommand(interaction, target);
    }

    if (commandName === 'topinvites') {
      await handleTopInvitesCommand(interaction);
    }

    if (commandName === 'clear') {
      const num = options.getInteger('amount');
      await handleClearCommand(interaction, num);
    }

    if (commandName === 'giveaway') {
      const durationStr = options.getString('duration');
      const winners = options.getInteger('winners');
      const prize = options.getString('prize');

      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        return interaction.reply({ content: '❌ Invalid duration format! Use e.g. `10s`, `1m`, `1h`, `1d`.', ephemeral: true });
      }

      const endTime = Date.now() + durationMs;
      const endTimestamp = Math.floor(endTime / 1000);

      const embed = new EmbedBuilder()
        .setColor(COLOR_VIOLET)
        .setTitle(`${EMOJIS.giveaway} TITAN GIVEAWAY: ${prize}`)
        .setImage(BANNERS.giveaways)
        .setDescription(`\n• **Winners:** \`${winners}\`\n• **Ends:** <t:${endTimestamp}:R> (<t:${endTimestamp}:f>)\n• **Host:** ${interaction.user}\n\nClick the button below to join!`)
        .setFooter({ text: 'TITAN Market™ • Official Giveaways' });

      const btn = new ButtonBuilder().setCustomId('join_gw').setLabel('Join (0)').setStyle(ButtonStyle.Primary).setEmoji('🎉');
      const row = new ActionRowBuilder().addComponents(btn);

      const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
      db.giveaways[msg.id] = { 
        winners, 
        prize, 
        participants: [], 
        channelId: interaction.channelId, 
        endTime, 
        hostId: interaction.user.id, 
        ended: false 
      };
      saveDB();
    }

    if (commandName === 'gend') {
      const msgId = options.getString('message_id');
      const gw = db.giveaways[msgId];
      if (!gw) return interaction.reply({ content: '❌ Giveaway not found with that message ID!', ephemeral: true });
      if (gw.ended) return interaction.reply({ content: '⚠️ This giveaway has already ended!', ephemeral: true });

      await endGiveaway(msgId);
      return interaction.reply({ content: `✅ Giveaway \`${msgId}\` ended successfully!` });
    }

    if (commandName === 'greroll') {
      const msgId = options.getString('message_id');
      const res = await rerollGiveaway(msgId, interaction.channel);
      if (!res.success) return interaction.reply({ content: res.message, ephemeral: true });
      return interaction.reply({ content: `✅ Reroll complete for giveaway \`${msgId}\`!` });
    }

    if (commandName === 'gedit') {
      const msgId = options.getString('message_id');
      const newPrize = options.getString('prize');
      const newWinners = options.getInteger('winners');

      const gw = db.giveaways[msgId];
      if (!gw) return interaction.reply({ content: '❌ Giveaway not found!', ephemeral: true });

      if (newPrize) gw.prize = newPrize;
      if (newWinners) gw.winners = newWinners;
      saveDB();

      return interaction.reply({ content: `✅ Giveaway \`${msgId}\` updated successfully!` });
    }
  }

  // --- 2. SELECT MENU (CREARE DIRECTA TICKET) ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_type') {
    const selectedType = interaction.values[0];

    db.ticketCount += 1;
    saveDB();

    const channelName = `ticket-${selectedType}-${db.ticketCount}`;
    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] }
      ]
    });

    const ticketEmbed = new EmbedBuilder()
      .setColor(COLOR_CYAN)
      .setTitle(`${EMOJIS.ticket} TITAN Market™ — New Ticket`)
      .setDescription(
        `👋 **Hello ${interaction.user}!** Welcome to your support ticket.\n\n` +
        `• **Category:** \`${selectedType.toUpperCase()}\`\n` +
        `${EMOJIS.ticket_id} **Ticket ID:** \`TICK-${db.ticketCount}\`\n\n` +
        `A member of our team will be with you shortly. Use the buttons below to manage this ticket.\n\n` +
        `🔒 **Secured transaction via TITAN Market**`
      )
      .setFooter({ text: 'TITAN Market™ • Official Support' })
      .setTimestamp();

    const btns = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✨'),
      new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
      new ButtonBuilder().setCustomId('remove_user').setLabel('Remove User').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    await channel.send({ content: `${interaction.user}`, embeds: [ticketEmbed], components: [btns] });
    await interaction.reply({ content: `✅ Your ticket has been created successfully: ${channel}`, ephemeral: true });
  }

  // --- 3. MODAL SUBMITS (ADAUGARE / SCOATERE MEMBRU DIN TICKET) ---
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_add_user') {
      const userId = interaction.fields.getTextInputValue('add_user_id').trim();
      try {
        const targetUser = await client.users.fetch(userId);
        await interaction.channel.permissionOverwrites.edit(targetUser.id, {
          ViewChannel: true,
          SendMessages: true,
          AttachFiles: true
        });
        await interaction.reply({ content: `✅ Added ${targetUser} (\`${targetUser.id}\`) to this ticket.` });
      } catch (err) {
        await interaction.reply({ content: `❌ Could not find or add user with ID \`${userId}\`. Make sure the ID is correct!`, ephemeral: true });
      }
    }

    if (interaction.customId === 'modal_remove_user') {
      const userId = interaction.fields.getTextInputValue('remove_user_id').trim();
      try {
        const targetUser = await client.users.fetch(userId);
        await interaction.channel.permissionOverwrites.delete(targetUser.id);
        await interaction.reply({ content: `✅ Removed ${targetUser} (\`${targetUser.id}\`) from this ticket.` });
      } catch (err) {
        await interaction.reply({ content: `❌ Could not find or remove user with ID \`${userId}\`. Make sure the ID is correct!`, ephemeral: true });
      }
    }
  }

  // --- 4. BUTTON ACTIONS ---
  if (interaction.isButton()) {
    if (interaction.customId === 'claim_ticket') {
      const claimEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#00FF66')
        .addFields({ name: '✨ Claimed By', value: `${interaction.user}`, inline: true });

      await interaction.update({ embeds: [claimEmbed], components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('claimed_disabled').setLabel(`Claimed by ${interaction.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
          new ButtonBuilder().setCustomId('remove_user').setLabel('Remove User').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        )
      ]});
      await interaction.channel.send(`✨ **Ticket claimed by ${interaction.user}!**`);
    }

    if (interaction.customId === 'add_user') {
      const modal = new ModalBuilder()
        .setCustomId('modal_add_user')
        .setTitle('Add User to Ticket');

      const userInput = new TextInputBuilder()
        .setCustomId('add_user_id')
        .setLabel('User ID to add:')
        .setPlaceholder('Enter Discord User ID...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(userInput));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'remove_user') {
      const modal = new ModalBuilder()
        .setCustomId('modal_remove_user')
        .setTitle('Remove User from Ticket');

      const userInput = new TextInputBuilder()
        .setCustomId('remove_user_id')
        .setLabel('User ID to remove:')
        .setPlaceholder('Enter Discord User ID...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(userInput));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.reply('🔒 Generating transcript and closing ticket in 5 seconds...');

      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      let transcriptText = `TITAN MARKET TICKET TRANSCRIPT - ${interaction.channel.name}\nGenerated at: ${new Date().toLocaleString()}\n--------------------------------------------------\n\n`;
      messages.reverse().forEach(m => {
        transcriptText += `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}\n`;
      });

      const buffer = Buffer.from(transcriptText, 'utf-8');

      // 1. Send Transcript to Logs Channel
      const targetLogsId = db.logsChannel || DEFAULT_LOGS_CHANNEL;
      const logChannel = interaction.guild.channels.cache.get(targetLogsId);
      if (logChannel) {
        const attachmentLog = new AttachmentBuilder(buffer, { name: `${interaction.channel.name}-transcript.txt` });
        logChannel.send({ content: `📁 **Transcript for ${interaction.channel.name}**`, files: [attachmentLog] });
      }

      // 2. Send Transcript to DM of Ticket Owner
      let ticketOwner = interaction.user;
      const userOverwrite = interaction.channel.permissionOverwrites.cache.find(
        ow => ow.type === 1 && ow.id !== client.user.id && ow.id !== interaction.guild.id
      );
      if (userOverwrite) {
        const fetchedUser = await client.users.fetch(userOverwrite.id).catch(() => null);
        if (fetchedUser) ticketOwner = fetchedUser;
      }

      if (ticketOwner) {
        try {
          const attachmentDM = new AttachmentBuilder(buffer, { name: `${interaction.channel.name}-transcript.txt` });
          await ticketOwner.send({ 
            content: `📁 **Here is your transcript for ticket \`${interaction.channel.name}\` from TITAN Market™:**`, 
            files: [attachmentDM] 
          });
        } catch (e) {
          console.log(`Could not send DM transcript to ${ticketOwner.tag}`);
        }
      }

      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    if (interaction.customId === 'join_gw') {
      const gw = db.giveaways[interaction.message.id];
      if (!gw || gw.ended) return interaction.reply({ content: '❌ This giveaway is no longer active.', ephemeral: true });

      if (gw.participants.includes(interaction.user.id)) {
        return interaction.reply({ content: '⚠️ You are already entered in this giveaway!', ephemeral: true });
      }

      gw.participants.push(interaction.user.id);
      saveDB();

      const updatedBtn = new ButtonBuilder().setCustomId('join_gw').setLabel(`Join (${gw.participants.length})`).setStyle(ButtonStyle.Primary).setEmoji('🎉');
      await interaction.update({ components: [new ActionRowBuilder().addComponents(updatedBtn)] });
    }
  }
});

// ==================== HELPER FUNCTIONS ====================

function processVouch(author, target, comment) {
  if (!db.vouches[target.id]) db.vouches[target.id] = [];
  db.vouches[target.id].push({
    authorId: author.id,
    authorTag: author.tag,
    comment: comment,
    date: new Date().toLocaleDateString('en-US')
  });
  saveDB();
}

async function handleProfileCommand(ctx, user) {
  const userVouches = db.vouches[user.id] || [];
  const inviteStats = db.invites[user.id] || { total: 0, active: 0, left: 0, fake: 0 };
  const member = ctx.guild.members.cache.get(user.id);

  const embed = new EmbedBuilder()
    .setColor(COLOR_CYAN)
    .setTitle(`${EMOJIS.name} Member Profile: ${user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: `${EMOJIS.id} User ID`, value: `\`${user.id}\``, inline: true },
      { name: `${EMOJIS.stats} Reputation (Vouches)`, value: `\`${userVouches.length} Vouches\``, inline: true },
      { name: `${EMOJIS.support} Active Invites`, value: `\`${inviteStats.active || 0} Invites\``, inline: true },
      { name: '📅 Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: '📥 Joined Server', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'N/A', inline: true }
    )
    .setFooter({ text: 'TITAN Market™ • User Profile' })
    .setTimestamp();

  if (ctx.reply) await ctx.reply({ embeds: [embed] });
  else await ctx.channel.send({ embeds: [embed] });
}

async function handleVouchStatsCommand(ctx, user) {
  const list = db.vouches[user.id] || [];
  
  if (list.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setColor(COLOR_VIOLET)
      .setTitle(`📊 Reviews & Vouches: ${user.username}`)
      .setDescription(`• **${user.username}** has no vouches recorded yet.`);
    return ctx.reply ? ctx.reply({ embeds: [emptyEmbed] }) : ctx.channel.send({ embeds: [emptyEmbed] });
  }

  const recent = list.slice(-5).reverse();
  let desc = recent.map((v, i) => `**${i + 1}.** From <@${v.authorId}> (${v.date}):\n> "${v.comment}"`).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(COLOR_VIOLET)
    .setTitle(`📊 Reviews & Vouches: ${user.username}`)
    .setDescription(`• **Total Vouches Received:** \`${list.length}\`\n\n**Recent Feedback:**\n${desc}`)
    .setThumbnail(user.displayAvatarURL());

  if (ctx.reply) await ctx.reply({ embeds: [embed] });
  else await ctx.channel.send({ embeds: [embed] });
}

async function handleInviteListCommand(ctx, user) {
  const data = db.invites[user.id] || { users: [] };
  const userList = data.users || [];

  if (userList.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setColor(COLOR_CYAN)
      .setTitle(`${EMOJIS.stats} Invite List: ${user.username}`)
      .setDescription(`• **${user.username}** hasn't invited anyone yet.`);
    return ctx.reply ? ctx.reply({ embeds: [emptyEmbed] }) : ctx.channel.send({ embeds: [emptyEmbed] });
  }

  const recentInvites = userList.slice(-15).reverse();
  const desc = recentInvites.map((u, i) => `**${i + 1}.** <@${u.id}> (\`${u.tag}\`) — joined \`${u.joinedAt}\``).join('\n');

  const embed = new EmbedBuilder()
    .setColor(COLOR_CYAN)
    .setTitle(`${EMOJIS.stats} List of Invited Members by ${user.username}`)
    .setDescription(`• **Total Invited Users:** \`${userList.length}\`\n\n**Recent Invitations:**\n${desc}`)
    .setImage(BANNERS.invites);

  if (ctx.reply) await ctx.reply({ embeds: [embed] });
  else await ctx.channel.send({ embeds: [embed] });
}

async function handleTopInvitesCommand(ctx) {
  const sorted = Object.entries(db.invites)
    .sort(([, a], [, b]) => (b.active || 0) - (a.active || 0))
    .slice(0, 10);

  let desc = sorted.map(([id, st], index) => `${index + 1}. <@${id}> — **${st.active || 0}** active invites (Total: ${st.total || 0})`).join('\n') || 'No invitations recorded yet.';
  
  const embed = new EmbedBuilder()
    .setColor(COLOR_CYAN)
    .setTitle(`${EMOJIS.stats} TITAN Market™ Top Inviters Leaderboard`)
    .setDescription(desc)
    .setImage(BANNERS.invites);
  
  if (ctx.reply) await ctx.reply({ embeds: [embed] });
  else await ctx.channel.send({ embeds: [embed] });
}

async function handlePanelCommand(ctx) {
  const embed = new EmbedBuilder()
    .setColor(COLOR_CYAN)
    .setTitle(`${EMOJIS.hammer} TITAN Market™ Tickets`)
    .setDescription(
      `• **TITAN Market™** is a marketplace server that offers fast, secure trading and exchange services.\n\n` +
      `• Select the type of ticket you'd like to create from the dropdown menu below.`
    )
    .setImage(BANNERS.tickets)
    .setFooter({ text: 'TITAN Market™ • Support Center' });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_ticket_type')
    .setPlaceholder('Select Ticket Type')
    .addOptions([
      { label: 'Nitro', description: 'Open a ticket for Nitro', value: 'nitro', emoji: EMOJIS.nitro },
      { label: 'Decoration', description: 'Open a ticket for Decoration', value: 'deco', emoji: EMOJIS.deco },
      { label: 'Server Boosts', description: 'Open a ticket for Server Boosts', value: 'boost', emoji: EMOJIS.boost },
      { label: 'Other', description: 'Open a ticket for other requests', value: 'other', emoji: EMOJIS.other },
      { label: 'Support / Problem', description: 'Get help with a problem', value: 'support', emoji: EMOJIS.support }
    ]);

  const row = new ActionRowBuilder().addComponents(menu);
  
  if (ctx.replied || ctx.deferred) {
    await ctx.followUp({ embeds: [embed], components: [row] });
  } else if (ctx.reply) {
    await ctx.reply({ embeds: [embed], components: [row] });
  } else {
    await ctx.channel.send({ embeds: [embed], components: [row] });
  }
}

async function handleInvitesCommand(ctx, user) {
  const stats = db.invites[user.id] || { total: 0, active: 0, left: 0, fake: 0 };
  const retention = stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(1) : '0.0';

  const embed = new EmbedBuilder()
    .setColor(COLOR_CYAN)
    .setTitle(`${EMOJIS.stats} Invite Stats: ${user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .setImage(BANNERS.invites)
    .setDescription(
      `• **Total Invites:** \`${stats.total}\`\n` +
      `• **Active Invites:** \`${stats.active}\`\n` +
      `• **Left Invites:** \`${stats.left}\`\n` +
      `• **Fake Invites:** \`${stats.fake}\`\n` +
      `• **Retention Rate:** \`${retention}%\``
    );

  if (ctx.reply) await ctx.reply({ embeds: [embed] });
  else await ctx.channel.send({ embeds: [embed] });
}

async function handleClearCommand(ctx, amount) {
  if (!amount || isNaN(amount) || amount < 1 || amount > 100) {
    const err = '⚠️ Please specify a number between 1 and 100 messages.';
    return ctx.reply ? ctx.reply({ content: err, ephemeral: true }) : ctx.channel.send(err);
  }

  const deleted = await ctx.channel.bulkDelete(amount, true);
  const msg = `🧹 Successfully deleted ${deleted.size} messages.`;
  if (ctx.reply) await ctx.reply({ content: msg, ephemeral: true });
  else ctx.channel.send(msg).then(m => setTimeout(() => m.delete(), 3000));
}

client.login(TOKEN);
